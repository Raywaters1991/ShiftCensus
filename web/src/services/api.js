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
  const orgId =
    localStorage.getItem("active_org_id") ||
    localStorage.getItem("activeOrgId") ||
    localStorage.getItem("active_orgId") ||
    localStorage.getItem("org_id") ||
    localStorage.getItem("orgId") ||
    "";

  const orgCode =
    localStorage.getItem("active_org_code") ||
    localStorage.getItem("activeOrgCode") ||
    localStorage.getItem("active_orgCode") ||
    localStorage.getItem("org_code") ||
    localStorage.getItem("orgCode") ||
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

export default api;
