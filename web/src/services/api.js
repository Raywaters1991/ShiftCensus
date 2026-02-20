// web/src/services/api.js
import axios from "axios";

/**
 * ShiftCensus API client
 * - Base URL is VITE_BACKEND_URL + "/api"
 * - Automatically attaches:
 *    Authorization: Bearer <supabase access token>
 *    x-org-id / x-org-code from localStorage (multiple key fallbacks)
 */

const RAW_BASE = (import.meta.env.VITE_BACKEND_URL || "").trim();

// Accept either:
//  - https://shiftcensus-backend.onrender.com
//  - https://shiftcensus-backend.onrender.com/api
// Normalize to always end up at .../api
const baseURL = RAW_BASE
  ? RAW_BASE.replace(/\/+$/, "").replace(/\/api$/, "") + "/api"
  : "/api";

function safeJsonParse(v) {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function getSupabaseAccessToken() {
  // Supabase stores tokens under: sb-<project-ref>-auth-token
  // We don’t know the exact project ref here, so scan for the key.
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const raw = window.localStorage.getItem(k);
        const parsed = safeJsonParse(raw);
        const token =
          parsed?.access_token ||
          parsed?.currentSession?.access_token ||
          parsed?.session?.access_token;
        if (token) return token;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function getActiveOrgContext() {
  // Support multiple key variants (legacy + current)
  const orgId =
    window.localStorage.getItem("activeOrgId") ||
    window.localStorage.getItem("active_org_id") ||
    window.localStorage.getItem("orgId") ||
    window.localStorage.getItem("org_id") ||
    "";

  const orgCode =
    window.localStorage.getItem("activeOrgCode") ||
    window.localStorage.getItem("active_org_code") ||
    window.localStorage.getItem("orgCode") ||
    window.localStorage.getItem("org_code") ||
    "";

  return {
    orgId: String(orgId || "").trim(),
    orgCode: String(orgCode || "").trim(),
  };
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

api.interceptors.request.use(
  (config) => {
    // Auth
    const token = getSupabaseAccessToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Org context
    const { orgId, orgCode } = getActiveOrgContext();
    config.headers = config.headers || {};

    // Only send x-org-id if it's a real UUID
    if (orgId && isUuid(orgId)) config.headers["x-org-id"] = orgId;

    // Always send org code if present (backend can resolve orgId from orgCode)
    if (orgCode) config.headers["x-org-code"] = orgCode;

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Helpful logging for debugging bad requests
    try {
      const status = err?.response?.status;
      const url = err?.config?.url;
      const data = err?.response?.data;

      if (status === 400 || status === 401 || status === 403) {
        // eslint-disable-next-line no-console
        console.warn("API error:", { status, url, data });
      }
    } catch {
      // ignore
    }
    return Promise.reject(err);
  }
);

export default api;
