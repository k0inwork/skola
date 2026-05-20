import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../lib/store";

export function OAuthCallback() {
  const [params] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  useEffect(() => {
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    const role = params.get("role");
    const name = params.get("name");
    const picture = params.get("picture");

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
