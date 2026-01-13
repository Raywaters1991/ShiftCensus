// src/services/api.js

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

function getToken() {
  return readFirst("token");
}

function getOrgId() {
  // support older/newer key names
  return readFirst("active_org_id", "org_id", "activeOrgId", "orgId");
}

function getOrgCode() {
  // support older/newer key names
  return readFirst("org_code", "active_org_code", "orgCode", "activeOrgCode");
}

async function request(method, path, body) {
  const token = getToken();
  const orgId = getOrgId();
  const orgCode = getOrgCode();

  const headers = {
    "Content-Type": "application/json",
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  // ✅ IMPORTANT: Send BOTH headers when available.
  // Some routes expect x-org-code, others expect x-org-id.
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
