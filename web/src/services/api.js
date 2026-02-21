// web/src/services/api.js
import axios from "axios";

const baseURL =
  import.meta.env.VITE_BACKEND_URL || "https://shiftcensus-backend.onrender.com";

const api = axios.create({
  baseURL: `${baseURL}/api`,
});

function getSupabaseAccessToken() {
  const authKey = Object.keys(localStorage).find(
    (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
  );
  if (!authKey) return null;

  try {
    const session = JSON.parse(localStorage.getItem(authKey) || "null");
    return session?.access_token || null;
  } catch {
    return null;
  }
}

function getOrgContext() {
  const read = (store, k) => {
    try { return store?.getItem(k) || ""; } catch { return ""; }
  };

  const orgId =
    read(sessionStorage, "active_org_id") ||
    read(sessionStorage, "org_id") ||
    read(sessionStorage, "orgId") ||
    read(localStorage, "active_org_id") ||
    read(localStorage, "org_id") ||
    read(localStorage, "orgId") ||
    "";

  const orgCode =
    read(sessionStorage, "active_org_code") ||
    read(sessionStorage, "org_code") ||
    read(sessionStorage, "orgCode") ||
    read(localStorage, "active_org_code") ||
    read(localStorage, "org_code") ||
    read(localStorage, "orgCode") ||
    "";

  return { orgId, orgCode };
}

// Attach auth + org headers to every request (Axios v1 safe)
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

  // IMPORTANT: send both when available
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
