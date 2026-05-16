import { create } from "zustand";

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  role: string | null;
  setAuth: (token: string, refreshToken: string, role: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("token"),
  refreshToken: localStorage.getItem("refreshToken"),
  role: localStorage.getItem("role"),
  setAuth: (token, refreshToken, role) => {
    localStorage.setItem("token", token);
    localStorage.setItem("refreshToken", refreshToken);
    localStorage.setItem("role", role);
    set({ token, refreshToken, role });
  },
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("role");
    set({ token: null, refreshToken: null, role: null });
  },
}));
