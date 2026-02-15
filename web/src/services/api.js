// src/services/api.js
import supabase from "./supabaseClient";

const API_BASE = "http://localhost:4000/api"; // DO NOT CHANGE

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

async function request(method, path, body) {
  // ✅ Always use the current Supabase session token
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token || null;
  console.log("API session?", session ? "YES" : "NO", token ? token.slice(0, 12) + "..." : "NO TOKEN");


  const orgId = getOrgId();
  const orgCode = getOrgCode();

  const headers = {
    "Content-Type": "application/json",
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  // ✅ Send BOTH headers when available
  if (orgId) headers["x-org-id"] = String(orgId);
  if (orgCode) headers["x-org-code"] = String(orgCode);

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let parsedBody = null;
  try {
    const text = await res.text();
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = null;
  }

  if (!res.ok) {
    const err = new Error(parsedBody?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = parsedBody;
    throw err;
  }

  return parsedBody;
}

export default {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
  put: (path, body) => request("PUT", path, body),
  patch: (path, body) => request("PATCH", path, body),
  delete: (path) => request("DELETE", path),
};
