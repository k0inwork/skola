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

// Global 401 interceptor — auto-logout on expired token
const originalFetch = window.fetch;
window.fetch = async function (...args: Parameters<typeof fetch>) {
  const response = await originalFetch.apply(this, args);

  if (response.status === 401) {
    // Only intercept API calls, not the login endpoint itself
    const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
    if (url.includes("/api/") && !url.includes("/api/auth/login")) {
      useAuthStore.getState().logout();
    }
  }

  return response;
};
