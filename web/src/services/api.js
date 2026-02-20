// web/src/services/api.js
import axios from "axios";

const baseURL =
  import.meta.env.VITE_BACKEND_URL || "https://shiftcensus-backend.onrender.com";

const api = axios.create({
  baseURL: `${baseURL}/api`,
});

// Attach auth + org headers to every request
api.interceptors.request.use((config) => {
  // 1) Supabase auth token (your existing logic may differ)
  const authKey = Object.keys(localStorage).find(
    (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
  );

  if (authKey) {
    try {
      const session = JSON.parse(localStorage.getItem(authKey) || "null");
      const token = session?.access_token;
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch {}
  }

  // 2) Org context (IMPORTANT)
  const orgId =
    localStorage.getItem("active_org_id") ||
    localStorage.getItem("activeOrgId") ||
    "";

  const orgCode =
    localStorage.getItem("active_org_code") ||
    localStorage.getItem("activeOrgCode") ||
    localStorage.getItem("org_code") ||
    "";

  if (orgId) config.headers["X-Org-Id"] = orgId;
  if (orgCode) config.headers["X-Org-Code"] = orgCode;

  return config;
});

export default api;
