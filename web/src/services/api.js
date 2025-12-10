// src/services/api.js

const API_BASE = "http://localhost:4000/api";   // DO NOT CHANGE

function getToken() {
  return sessionStorage.getItem("token") || "";
}

function getOrg() {
  return sessionStorage.getItem("org_code") || "";
}

async function request(method, path, body) {
  const token = getToken();
  const org = getOrg();

  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "x-org-code": org,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // If backend returned an error (4xx or 5xx)
  if (!res.ok) {
    let errorBody;
    try {
      errorBody = await res.json(); // try JSON
    } catch {
      errorBody = await res.text(); // fallback
    }
    console.error("SERVER ERROR:", errorBody);
    throw new Error(
      typeof errorBody === "string"
        ? errorBody
        : errorBody.error || "Request failed"
    );
  }

  // SUCCESS — always JSON
  return await res.json();
}

export default {
  get:    (path)        => request("GET", path),
  post:   (path, body)  => request("POST", path, body),
  put:    (path, body)  => request("PUT", path, body),
  delete: (path)        => request("DELETE", path),
};
