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
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});


// =====================================================
// Utilities
// =====================================================

// Safe storage getter
function safeGet(storage, key) {
  try {
    return storage?.getItem?.(key) || "";
  } catch {
    return "";
  }
}

// Read keys in priority order
function readFirst(...keys) {
  for (const k of keys) {
    const v = safeGet(sessionStorage, k) || safeGet(localStorage, k);
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

// UUID validator
function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}


// =====================================================
// Org context helpers
// =====================================================

// Returns ONLY a valid UUID or empty string
function getOrgId() {
  const candidate = readFirst(
    "active_org_id",
    "org_id",
    "orgId",
    "activeOrgId",
    "activeOrgID"
  );

  return isUuid(candidate) ? candidate : "";
}

// Returns ONLY org_code (not UUID)
function getOrgCode() {
  const code = readFirst(
    "active_org_code",
    "org_code",
    "orgCode",
    "activeOrgCode",
    "activeOrgCODE"
  );

  // Prevent UUID accidentally stored as code
  if (isUuid(code)) return "";

  return code || "";
}


// =====================================================
// REQUEST INTERCEPTOR
// Adds auth + org headers automatically
// =====================================================

api.interceptors.request.use(async (config) => {
  // ---------- AUTH TOKEN ----------
  let token = null;

  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token || null;
  } catch {
    token = null;
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    delete config.headers.Authorization;
  }

  // ---------- ORG CONTEXT ----------
  const orgId = getOrgId();
  const orgCode = getOrgCode();

  // Only send valid headers
  if (orgId) {
    config.headers["x-org-id"] = orgId;
  } else {
    delete config.headers["x-org-id"];
  }

  if (orgCode) {
    config.headers["x-org-code"] = orgCode;
  } else {
    delete config.headers["x-org-code"];
  }

  return config;
});


// =====================================================
// RESPONSE INTERCEPTOR
// Clean error handling
// =====================================================

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      "Request failed";

    const err = new Error(message);
    err.status = error?.response?.status;
    err.body = error?.response?.data;

    return Promise.reject(err);
  }
);


export default api;
