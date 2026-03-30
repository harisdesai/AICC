import { create } from "zustand";
import api from "../lib/api";

export const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem("aicc_token") || null,
  loading: false,
  error: null,

  init: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data.user });
    } catch {
      set({ token: null, user: null });
      localStorage.removeItem("aicc_token");
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const emailNorm = String(email ?? "").trim().toLowerCase();
      const { data } = await api.post("/auth/login", { email: emailNorm, password });
      localStorage.setItem("aicc_token", data.token);
      set({ token: data.token, user: data.user, loading: false });
      return { ok: true };
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        (err.code === "ERR_NETWORK" ? "Cannot reach the server. Is the API running?" : null) ||
        err.message ||
        "Login failed";
      set({ error: msg, loading: false });
      return { ok: false, error: msg };
    }
  },

  register: async (name, email, password) => {
    set({ loading: true, error: null });
    try {
      const emailNorm = String(email ?? "").trim().toLowerCase();
      const nameTrim = String(name ?? "").trim();
      const { data } = await api.post("/auth/register", { name: nameTrim, email: emailNorm, password });
      localStorage.setItem("aicc_token", data.token);
      set({ token: data.token, user: data.user, loading: false });
      return { ok: true };
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        (err.code === "ERR_NETWORK" ? "Cannot reach the server. Is the API running on port 5000?" : null) ||
        err.message ||
        "Registration failed";
      set({ error: msg, loading: false });
      return { ok: false, error: msg };
    }
  },

  logout: () => {
    localStorage.removeItem("aicc_token");
    set({ token: null, user: null });
  },
}));
