import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3001/api",
});

// 🔹 Attach org_code to every request automatically
api.interceptors.request.use((config) => {
  // MUST match the key set in OrgPage.jsx: localStorage.setItem("orgCode", code)
  const orgCode = localStorage.getItem("orgCode");

  if (orgCode) {
    config.headers["x-org-code"] = orgCode;  // ← Backend looks for this
  }

  return config;
});

export default api;

