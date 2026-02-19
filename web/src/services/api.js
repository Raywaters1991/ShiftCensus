// web/src/services/api.js
import axios from "axios";
import supabase from "./supabaseClient";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_BASE ||
  "http://localhost:4000";

// Remove trailing slash
const BASE = String(API_BASE || "").replace(/\/+$/, "");

// -------------------------
// Helpers
// -------------------------
function safeGet(storage, key) {
  try {
    return storage?.getItem?.(key) || "";
  } catch {
    return "";
  }
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.trim())
  );
}

function readFirst(...keys) {
  // Prefer sessionStorage (active selection) then localStorage (fallback)
  for (const k of keys) {
    const v = safeGet(sessionStorage, k) || safeGet(localStorage, k);
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

function getOrgId() {
  // IMPORTANT: only accept UUIDs for x-org-id
  const candidate = readFirst(
    "active_org_id",
    "activeOrgId",
    "org_id",
    "orgId",
    "activeOrgID"
  );
  return isUuid(candidate) ? candidate : "";
}

function getOrgCode() {
  // org_code can be "ADMIN", "NSPAC", etc.
  return readFirst(
    "active_org_code",
    "activeOrgCode",
    "org_code",
    "orgCode",
    "activeOrgCODE"
  );
}

// -------------------------
// Axios client
// -------------------------
const api = axios.create({
  baseURL: BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

// ================================
// REQUEST INTERCEPTOR
// Adds auth + org headers automatically
// ================================
api.interceptors.request.use(async (config) => {
  // Auth token
  let token = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token || null;
  } catch {
    token = null;
  }

  if (token) config.headers.Authorization = `Bearer ${token}`;
  else delete config.headers.Authorization;

  // Org context
  const orgId = getOrgId();
  const orgCode = getOrgCode();

  if (orgId) config.headers["x-org-id"] = orgId;
  else delete config.headers["x-org-id"];

  if (orgCode) config.headers["x-org-code"] = orgCode;
  else delete config.headers["x-org-code"];

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
      error?.message ||
      "Request failed";

    const err = new Error(message);
    err.status = error?.response?.status;
    err.body = error?.response?.data;

    return Promise.reject(err);
  }
);

export default api;
