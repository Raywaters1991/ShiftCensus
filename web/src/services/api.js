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
  // Prefer sessionStorage first, then localStorage
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
// Goal: make repeat navigation feel instant without weakening auth or org scoping.
// Fresh entries are returned immediately. Slightly stale entries are also returned
// immediately while a background request refreshes them for the next view.
const responseCache = new Map();
const inFlightGets = new Map();
const FRESH_MS = 30_000;
const STALE_MS = 5 * 60_000;

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

api.get = async function cachedGet(url, config = {}) {
  if (config?.cache === false) return rawGet(url, config);

  const key = cacheKey(url, config);
  const cached = responseCache.get(key);
  const age = cached ? Date.now() - cached.ts : Infinity;

  if (cached && age <= FRESH_MS) return cached.data;

  if (cached && age <= STALE_MS) {
    // Return immediately and refresh behind the scenes.
    refreshGet(key, url, config).catch(() => {});
    return cached.data;
  }

  return refreshGet(key, url, config);
};

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

  // 1) Auth
  const token = getSupabaseAccessToken();
  if (token) setHeader("Authorization", `Bearer ${token}`);

  // 2) Org context
  const { orgId, orgCode } = getOrgContext();

  if (orgId) setHeader("X-Org-Id", orgId);

  // ✅ IMPORTANT:
  // Do NOT blindly send ADMIN org_code (it hijacks superadmin context).
  if (orgCode && String(orgCode).toUpperCase() !== "ADMIN") {
    setHeader("X-Org-Code", orgCode);
  }

  config.headers = headers;
  return config;
});

api.interceptors.response.use(
  (response) => {
    // Any successful mutation can change data shown by multiple screens.
    // Clear the read cache so the next navigation reflects the mutation.
    const method = String(response?.config?.method || "get").toLowerCase();
    if (method !== "get" && method !== "head") clearResponseCache();
    return response.data;
  },
  (error) => {
    // Normalize Axios errors so the rest of the app can consistently read
    // err.status / err.body instead of depending on Axios' response shape.
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
