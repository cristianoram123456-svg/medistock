import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export function apiError(e) {
  const d = e?.response?.data?.detail;
  if (d == null) return e?.message || "Something went wrong";
  if (typeof d === "string") return d;
  if (Array.isArray(d))
    return d.map((x) => (x && x.msg ? x.msg : JSON.stringify(x))).join(", ");
  return String(d);
}

export default api;
