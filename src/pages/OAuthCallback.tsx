import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../lib/store";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()\[\]\\\/+^])/g, '\\$1')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

export function OAuthCallback() {
  const [params] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  useEffect(() => {
    // Read tokens from httpOnly cookies set by the server (secure transfer)
    // Fallback: also check URL params for backward compatibility during migration
    const accessToken = getCookie("oauth_access_token") || params.get("accessToken");
    const refreshToken = getCookie("oauth_refresh_token") || params.get("refreshToken");
    const role = params.get("role");
    const name = params.get("name");
    const picture = params.get("picture");

    // Clean up the cookies immediately
    deleteCookie("oauth_access_token");
    deleteCookie("oauth_refresh_token");

    if (accessToken && refreshToken && role) {
      setAuth(accessToken, refreshToken, role);

      if (name || picture) {
        localStorage.setItem("skola_profile", JSON.stringify({ name, picture }));
      }

      navigate("/", { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  );
}
