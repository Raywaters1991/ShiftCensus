// web/src/services/api.js
import axios from "axios";

const baseURL =
  import.meta.env.VITE_BACKEND_URL || "https://shiftcensus-backend.onrender.com";

const api = axios.create({
  baseURL: `${baseURL}/api`,
});

// -------------------------
// Auth token helpers
// -------------------------
function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function findSupabaseAuthTokenKey(store) {
  try {
    if (!store) return null;
    return Object.keys(store).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
    );
  } catch {
    return null;
  }
}

function readSupabaseAccessTokenFromStore(store) {
  const key = findSupabaseAuthTokenKey(store);
  if (!key) return null;

  const raw = (() => {
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  })();

  const session = safeJsonParse(raw || "null");
  if (!session) return null;

  return (
    session?.access_token ||
    session?.currentSession?.access_token ||
    session?.data?.session?.access_token ||
    null
  );
}

function getSupabaseAccessToken() {
  return (
    readSupabaseAccessTokenFromStore(sessionStorage) ||
    readSupabaseAccessTokenFromStore(localStorage) ||
    null
  );
}

// -------------------------
// Org context helpers
// -------------------------
function getOrgContext() {
  const read = (store, k) => {
    try {
      return store?.getItem(k) || "";
    } catch {
      return "";
    }
  };

  const orgId =
    read(sessionStorage, "active_org_id") ||
    read(sessionStorage, "activeOrgId") ||
    read(sessionStorage, "org_id") ||
    read(sessionStorage, "orgId") ||
    read(localStorage, "active_org_id") ||
    read(localStorage, "activeOrgId") ||
    read(localStorage, "org_id") ||
    read(localStorage, "orgId") ||
    "";

  const orgCode =
    read(sessionStorage, "active_org_code") ||
    read(sessionStorage, "activeOrgCode") ||
    read(sessionStorage, "org_code") ||
    read(sessionStorage, "orgCode") ||
    read(localStorage, "active_org_code") ||
    read(localStorage, "activeOrgCode") ||
    read(localStorage, "org_code") ||
    read(localStorage, "orgCode") ||
    "";

  return { orgId, orgCode };
}

// -------------------------
// Lightweight GET cache
// -------------------------
const responseCache = new Map();
const inFlightGets = new Map();
const scheduleBundles = new Map();
const FRESH_MS = 30_000;
const STALE_MS = 5 * 60_000;
const SCHEDULE_JOIN_MS = 1_000;

function cacheScope() {
  const { orgId, orgCode } = getOrgContext();
  return `${orgId || "no-org"}|${orgCode || "no-code"}`;
}

function cacheKey(url, config = {}) {
  const params = config?.params ? JSON.stringify(config.params) : "";
  return `${cacheScope()}|${url}|${params}`;
}

function clearResponseCache() {
  responseCache.clear();
  inFlightGets.clear();
  scheduleBundles.clear();
}

// Census edits are already reflected optimistically in the UI. Preserve and
// patch the active facility's bed-board cache with the authoritative row from
// the PUT response so the page's reconciliation read is instant instead of
// making the whole board wait on another network round trip.
function censusMutationSnapshots(response) {
  const method = String(response?.config?.method || "").toLowerCase();
  if (method !== "put" && method !== "patch") return [];

  const { path } = queryParts(response?.config?.url || "");
  if (!/^\/census\/[^/]+$/.test(path)) return [];

  const updated = response?.data;
  if (!updated?.id) return [];

  const scope = cacheScope();
  const snapshots = [];

  for (const [key, entry] of responseCache.entries()) {
    if (!key.startsWith(`${scope}|`)) continue;

    // Privacy does not change during a bed edit, so keep it warm too. CensusPage
    // currently reconciles privacy alongside the bed board after a save.
    if (key.includes("|/org-settings|" ) || key.includes("|/org-settings/identifiers|")) {
      snapshots.push([key, entry]);
      continue;
    }

    if (!key.includes("|/census/bed-board|")) continue;
    if (!Array.isArray(entry?.data)) continue;

    let found = false;
    const data = entry.data.map((row) => {
      if (String(row?.id) !== String(updated.id)) return row;
      found = true;
      // Keep display-only room/bed values from the bed-board response when the
      // mutation response omits or normalizes them differently.
      return { ...row, ...updated, room: row.room, room_number: row.room_number, bed: row.bed };
    });

    if (found) snapshots.push([key, { data, ts: Date.now() }]);
  }

  return snapshots;
}

const rawGet = api.get.bind(api);

async function refreshGet(key, url, config) {
  if (inFlightGets.has(key)) return inFlightGets.get(key);
  const promise = rawGet(url, config)
    .then((data) => {
      responseCache.set(key, { data, ts: Date.now() });
      return data;
    })
    .finally(() => inFlightGets.delete(key));
  inFlightGets.set(key, promise);
  return promise;
}

async function regularCachedGet(url, config = {}) {
  if (config?.cache === false) return rawGet(url, config);

  const key = cacheKey(url, config);
  const cached = responseCache.get(key);
  const age = cached ? Date.now() - cached.ts : Infinity;

  if (cached && age <= FRESH_MS) return cached.data;

  if (cached && age <= STALE_MS) {
    refreshGet(key, url, config).catch(() => {});
    return cached.data;
  }

  return refreshGet(key, url, config);
}

function scheduleViewUrl(from, to) {
  return `/schedule-view?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

async function getScheduleView(from, to, config = {}) {
  if (!from || !to) throw new Error("Schedule range is required");
  return regularCachedGet(scheduleViewUrl(from, to), config);
}

function queryParts(url) {
  try {
    const parsed = new URL(String(url || ""), "https://shiftcensus.local");
    return { path: parsed.pathname, params: parsed.searchParams };
  } catch {
    return { path: String(url || ""), params: new URLSearchParams() };
  }
}

function recentScheduleBundle() {
  const entry = scheduleBundles.get(cacheScope());
  if (!entry || Date.now() - entry.started > SCHEDULE_JOIN_MS) return null;
  return entry;
}

function scheduleBundle(from, to, config = {}) {
  const scope = cacheScope();
  const existing = scheduleBundles.get(scope);
  if (existing && existing.from === from && existing.to === to && Date.now() - existing.started <= STALE_MS) {
    return existing;
  }

  const promise = getScheduleView(from, to, config);
  const entry = { from, to, started: Date.now(), promise };
  scheduleBundles.set(scope, entry);
  promise.catch(() => {
    if (scheduleBundles.get(scope) === entry) scheduleBundles.delete(scope);
  });
  return entry;
}

// Transparently collapse legacy Schedule page reads into one HTTP request.
// New Schedule code calls getScheduleView directly; the legacy interception is
// retained for compatibility with any remaining callers.
api.get = async function cachedGet(url, config = {}) {
  const { path, params } = queryParts(url);

  if (path === "/shifts" && params.get("from") && params.get("to") && !params.get("date")) {
    const from = params.get("from");
    const to = params.get("to");
    try {
      const bundle = await scheduleBundle(from, to, config).promise;
      return Array.isArray(bundle?.shifts) ? bundle.shifts : [];
    } catch {
      return regularCachedGet(url, config);
    }
  }

  if (path === "/shift-requests/approved-time-off" && params.get("from") && params.get("to")) {
    const from = params.get("from");
    const to = params.get("to");
    const active = recentScheduleBundle();
    if (active && active.from === from && active.to === to) {
      try {
        const bundle = await active.promise;
        return Array.isArray(bundle?.pto) ? bundle.pto : [];
      } catch {}
    }
  }

  if (path === "/staff/lookup") {
    const active = recentScheduleBundle();
    if (active) {
      try {
        const bundle = await active.promise;
        return Array.isArray(bundle?.staff) ? bundle.staff : [];
      } catch {}
    }
  }

  if (path === "/coverage-requirements") {
    const active = recentScheduleBundle();
    if (active) {
      try {
        const bundle = await active.promise;
        return Array.isArray(bundle?.requirements) ? bundle.requirements : [];
      } catch {}
    }
  }

  return regularCachedGet(url, config);
};

api.getScheduleView = getScheduleView;
api.prefetchScheduleView = (from, to) => getScheduleView(from, to).then(() => undefined);
api.clearResponseCache = clearResponseCache;
api.invalidateGetCache = clearResponseCache;

// -------------------------
// Axios interceptors
// -------------------------
api.interceptors.request.use((config) => {
  const headers = config.headers ?? {};

  const setHeader = (k, v) => {
    if (!v) return;
    if (typeof headers.set === "function") headers.set(k, v);
    else headers[k] = v;
  };

  const token = getSupabaseAccessToken();
  if (token) setHeader("Authorization", `Bearer ${token}`);

  const { orgId, orgCode } = getOrgContext();
  if (orgId) setHeader("X-Org-Id", orgId);

  if (orgCode && String(orgCode).toUpperCase() !== "ADMIN") {
    setHeader("X-Org-Code", orgCode);
  }

  config.headers = headers;
  return config;
});

api.interceptors.response.use(
  (response) => {
    const method = String(response?.config?.method || "get").toLowerCase();
    if (method !== "get" && method !== "head") {
      const preserved = censusMutationSnapshots(response);
      clearResponseCache();
      for (const [key, entry] of preserved) responseCache.set(key, entry);
    }
    return response.data;
  },
  (error) => {
    const status = error?.response?.status ?? error?.status;
    const body = error?.response?.data ?? error?.body ?? null;

    if (status !== undefined) error.status = status;
    if (body !== undefined) error.body = body;

    const serverMessage =
      body?.details?.message ||
      body?.message ||
      (typeof body?.error === "string" && body.error !== "GENDER_MISMATCH" ? body.error : null);

    if (serverMessage) error.message = serverMessage;

    return Promise.reject(error);
  }
);

export default api;
