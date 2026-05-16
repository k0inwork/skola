import { Outlet, Navigate, Link } from "react-router-dom";
import { useAuthStore } from "../lib/store";
import { LogOut, Users, BookOpen, CreditCard } from "lucide-react";

export function Layout() {
  const { token, logout } = useAuthStore();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight">Scola</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          <Link to="/" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 transition-colors">
            <BookOpen className="w-5 h-5 text-slate-400" />
            Dashboard
          </Link>
          <Link to="/students" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 transition-colors">
            <Users className="w-5 h-5 text-slate-400" />
            Students
          </Link>
          <Link to="/payments" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 transition-colors">
            <CreditCard className="w-5 h-5 text-slate-400" />
            Payments
          </Link>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={logout}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors px-3 py-2 w-full text-left rounded-md hover:bg-slate-800"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
