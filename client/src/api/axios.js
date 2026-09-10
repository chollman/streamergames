import axios from "axios";
import { store } from "../store/store";

// Base URL: in dev, Vite proxies /api to :4000 (see vite.config.js) so we
// can use relative paths. In prod, VITE_API_URL points at the API host.
const baseURL = import.meta.env.VITE_API_URL || "";

export const api = axios.create({ baseURL, timeout: 15000 });

// Inject Bearer token from the auth slice on every request. Constitution §5
// says the JWT is the single credential the client ever sends. Guest routes
// override this per-request when they need to speak as a specific seat.
api.interceptors.request.use((config) => {
  const state = store.getState();
  const token = state.auth && state.auth.token;
  if (token && !(config.headers && config.headers.Authorization)) {
    config.headers = { ...(config.headers || {}), Authorization: `Bearer ${token}` };
  }
  const lang = state.language && state.language.value;
  if (lang && !(config.headers && config.headers["Accept-Language"])) {
    config.headers = { ...(config.headers || {}), "Accept-Language": lang };
  }
  return config;
});

export default api;
