import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../lib/api";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    loading: true,
    user: null,
    business: null,
    permissions: [],
  });

  const load = useCallback(async () => {
    const t = localStorage.getItem("token");
    if (!t) {
      setState({ loading: false, user: null, business: null, permissions: [] });
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setState({
        loading: false,
        user: data.user,
        business: data.business,
        permissions: data.permissions,
      });
    } catch {
      localStorage.removeItem("token");
      setState({ loading: false, user: null, business: null, permissions: [] });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", data.token);
    await load();
    return data;
  };

  const register = async (name, email, password) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    localStorage.setItem("token", data.token);
    await load();
    return data;
  };

  const setupBusiness = async (payload) => {
    const { data } = await api.post("/business", payload);
    localStorage.setItem("token", data.token);
    await load();
    return data;
  };

  const logout = () => {
    localStorage.removeItem("token");
    setState({ loading: false, user: null, business: null, permissions: [] });
  };

  const can = (m) =>
    state.permissions.includes("*") || state.permissions.includes(m);

  return (
    <Ctx.Provider
      value={{ ...state, login, register, setupBusiness, logout, can, reload: load }}
    >
      {children}
    </Ctx.Provider>
  );
}
