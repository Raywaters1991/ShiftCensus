// web/src/services/api.js

const API_BASE =
  import.meta.env.VITE_API_URL ||
  "https://shiftcensus-backend.onrender.com";

async function request(path, options = {}) {
  const token = localStorage.getItem("sb-access-token");

  const orgId =
    localStorage.getItem("activeOrgId") ||
    localStorage.getItem("active_org_id") ||
    localStorage.getItem("orgId") ||
    localStorage.getItem("org_id");

  const orgCode =
    localStorage.getItem("activeOrgCode") ||
    localStorage.getItem("active_org_code") ||
    localStorage.getItem("orgCode") ||
    localStorage.getItem("org_code");

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(orgId ? { "x-org-id": orgId } : {}),
    ...(orgCode ? { "x-org-code": orgCode } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return res.json();
}

export default {
  get: (path) => request(path),
  post: (path, body) =>
    request(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  put: (path, body) =>
    request(path, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  delete: (path) =>
    request(path, { method: "DELETE" }),
};
