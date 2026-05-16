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

// Global 401 interceptor — try refresh, then logout if that fails too
const originalFetch = window.fetch;

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) return false;

  try {
    const res = await originalFetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;

    const data = await res.json();
    useAuthStore.getState().setAuth(data.accessToken, data.refreshToken, useAuthStore.getState().role!);
    return true;
  } catch {
    return false;
  }
}

window.fetch = async function (...args: Parameters<typeof fetch>) {
  const response = await originalFetch.apply(this, args);

  if (response.status === 401) {
    const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
    if (url.includes("/api/") && !url.includes("/api/auth/login") && !url.includes("/api/auth/refresh")) {
      // Try to refresh the token
      if (!refreshPromise) {
        refreshPromise = tryRefresh();
      }
      const refreshed = await refreshPromise;
      refreshPromise = null;

      if (refreshed) {
        // Retry the original request with new token
        const { token } = useAuthStore.getState();
        const newArgs = [...args] as Parameters<typeof fetch>;
        if (newArgs[1] && newArgs[1].headers) {
          const headers = new Headers(newArgs[1].headers);
          headers.set("Authorization", `Bearer ${token}`);
          newArgs[1] = { ...newArgs[1], headers };
        }
        return originalFetch.apply(this, newArgs);
      }

      // Refresh failed — logout
      useAuthStore.getState().logout();
    }
  }

  return response;
};
