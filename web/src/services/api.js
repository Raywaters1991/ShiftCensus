// web/src/services/api.js
import axios from "axios";
import supabase from "./supabaseClient";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_BASE ||
  "http://localhost:4000";

// Remove trailing slash
const BASE = String(API_BASE || "").replace(/\/+$/, "");

const api = axios.create({
  baseURL: BASE,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 20000,
});


// ================================
// Helpers for org headers
// ================================

function readFirst(...keys) {
  for (const k of keys) {
    const v =
      (typeof sessionStorage !== "undefined" && sessionStorage.getItem(k)) ||
      (typeof localStorage !== "undefined" && localStorage.getItem(k)) ||
      "";
    if (v) return v;
  }
  return "";
}

function getOrgId() {
  return readFirst("active_org_id", "org_id", "activeOrgId", "orgId");
}

function getOrgCode() {
  return readFirst("org_code", "active_org_code", "orgCode", "activeOrgCode");
}


// ================================
// REQUEST INTERCEPTOR
// Adds auth + org headers automatically
// ================================

api.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token || null;

  // Debug (safe)
  console.log(
    "API base:",
    BASE,
    "| session?",
    session ? "YES" : "NO",
    "| token?",
    token ? token.slice(0, 12) + "..." : "NO TOKEN"
  );

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const orgId = getOrgId();
  const orgCode = getOrgCode();

  if (orgId) config.headers["x-org-id"] = String(orgId);
  if (orgCode) config.headers["x-org-code"] = String(orgCode);

  return config;
});


// ================================
// RESPONSE INTERCEPTOR
// Cleaner errors
// ================================

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error.message ||
      "Request failed";

    const err = new Error(message);
    err.status = error?.response?.status;
    err.body = error?.response?.data;

    return Promise.reject(err);
  }
);

export default api;
