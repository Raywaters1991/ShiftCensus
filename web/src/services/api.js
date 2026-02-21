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

  // Supabase can store session in different shapes depending on version/config
  return (
    session?.access_token ||
    session?.currentSession?.access_token ||
    session?.data?.session?.access_token ||
    null
  );
}

function getSupabaseAccessToken() {
  // Prefer sessionStorage first (good for kiosk-ish sessions),
  // then fall back to localStorage (default Supabase behavior).
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

  // Include all variants you’ve used across the app
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
// Axios interceptors
// -------------------------
api.interceptors.request.use((config) => {
  const headers = config.headers ?? {};

  const setHeader = (k, v) => {
    if (!v) return;
    // Axios v1 uses AxiosHeaders which has .set()
    if (typeof headers.set === "function") headers.set(k, v);
    else headers[k] = v;
  };

  // 1) Auth
  const token = getSupabaseAccessToken();
  if (token) setHeader("Authorization", `Bearer ${token}`);

  // 2) Org context
  const { orgId, orgCode } = getOrgContext();

  // Keep both; backend primarily needs X-Org-Code, but X-Org-Id can be useful later
  if (orgId) setHeader("X-Org-Id", orgId);
  if (orgCode) setHeader("X-Org-Code", orgCode);

  config.headers = headers;
  return config;
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(error)
);

export default api;
