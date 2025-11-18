import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3001/api",
});

// 🔹 Attach org_code to every request automatically
api.interceptors.request.use((config) => {
  const orgCode = localStorage.getItem("org_code"); // stored from landing page

  if (orgCode) {
    if (!config.params) config.params = {};
    config.params.org_code = orgCode;
  }

  return config;
});

export default api;
