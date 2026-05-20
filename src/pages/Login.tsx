import { useState, useEffect } from "react";

export function Login() {
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<{ name: string; picture: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("skola_profile");
      if (raw) setProfile(JSON.parse(raw));
    } catch {}
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const res = await fetch("/api/auth/google/url");
      if (!res.ok) throw new Error("Failed to get Google auth URL");
      const { url } = await res.json();
      window.location.href = url;
    } catch (err: any) {
      setError(err.message || "Network error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/5 rounded-full blur-3xl" />
      </div>

      {/* Card */}
      <div className="relative max-w-sm w-full mx-4 bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
        {/* Logo area */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-xl mb-4 shadow-lg shadow-blue-600/20">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0H21M3.375 14.25h.008v.008h-.008v-.008zm0 0H7.5m0 0v-.375c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v.375m-7.5 0h7.5m0 0h2.625a1.125 1.125 0 011.125 1.125v2.813" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Olaines autoskola</h1>
          <p className="text-white/40 text-sm">Braukšanas mācību pārvaldība</p>
        </div>

        {/* Returning user profile */}
        {profile && (
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 rounded-full border-2 border-white/20 overflow-hidden mb-3 bg-white/10">
              {profile.picture ? (
                <img
                  src={profile.picture}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/60 text-xl font-medium">
                  {profile.name?.[0]?.toUpperCase() || "?"}
                </div>
              )}
            </div>
            <p className="text-white text-sm font-medium">{profile.name}</p>
            <p className="text-white/30 text-xs mt-1">Laipni lūgti atpakaļ!</p>
          </div>
        )}

        {error && (
          <div className="p-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg mb-4 text-center">
            {error}
          </div>
        )}

        {/* Google button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full bg-white text-gray-700 font-medium py-3 px-4 rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-3 min-h-[48px] shadow-lg shadow-black/10"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            <path d="M1 1h22v22H1z" fill="none"/>
          </svg>
          {profile ? `Turpināt kā ${profile.name}` : "Turpināt ar Google"}
        </button>

        <p className="text-white/20 text-[11px] text-center mt-4">
          Droša autorizācija caur Google
        </p>
      </div>
    </div>
  );
}
