import { Outlet, Navigate, Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../lib/store";
import { LogOut, Users, BookOpen, CreditCard, Calendar as CalendarIcon } from "lucide-react";
import clsx from "clsx";

export function Layout() {
  const { token, logout } = useAuthStore();
  const location = useLocation();

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
          <Link 
            to="/dashboard" 
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
              location.pathname === "/dashboard" ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
            )}
          >
            <BookOpen className={clsx("w-5 h-5", location.pathname === "/dashboard" ? "text-white" : "text-slate-500")} />
            Dashboard
          </Link>
          <Link 
            to="/students" 
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
              location.pathname === "/students" ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
            )}
          >
            <Users className={clsx("w-5 h-5", location.pathname === "/students" ? "text-white" : "text-slate-500")} />
            Students
          </Link>
          <Link 
            to="/calendar" 
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
              location.pathname === "/calendar" ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
            )}
          >
            <CalendarIcon className={clsx("w-5 h-5", location.pathname === "/calendar" ? "text-white" : "text-slate-500")} />
            Calendar
          </Link>
          <Link 
            to="/payments" 
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
              location.pathname === "/payments" ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
            )}
          >
            <CreditCard className={clsx("w-5 h-5", location.pathname === "/payments" ? "text-white" : "text-slate-500")} />
            Payments
          </Link>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={logout}
            className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors px-3 py-2 w-full text-left rounded-md hover:bg-slate-800/50"
          >
            <LogOut className="w-5 h-5 text-slate-500" />
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
