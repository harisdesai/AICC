import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("aicc_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("aicc_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
