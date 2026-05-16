import { Outlet, Navigate, Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../lib/store";
import { LogOut, Users, BookOpen, CreditCard, Calendar as CalendarIcon, User as UserIcon, MessageCircle } from "lucide-react";
import clsx from "clsx";
import { useState, useEffect } from "react";
import { io } from "socket.io-client";

export function Layout() {
  const { token, role, logout } = useAuthStore();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!token) return;
    fetch("/api/messages/conversations", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : [])
      .then((convs: any[]) => {
        setUnreadCount(convs.reduce((sum: number, c: any) => sum + (c.unreadCount || 0), 0));
      })
      .catch(() => {});

    const socket = io();
    socket.on("new_message", () => {
      fetch("/api/messages/conversations", {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.ok ? r.json() : [])
        .then((convs: any[]) => {
          setUnreadCount(convs.reduce((sum: number, c: any) => sum + (c.unreadCount || 0), 0));
        })
        .catch(() => {});
    });

    return () => { socket.disconnect(); };
  }, [token]);

  // Reset badge when visiting messages page
  useEffect(() => {
    if (location.pathname.startsWith("/messages")) {
      setUnreadCount(0);
    }
  }, [location.pathname]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const isStudent = role === "client";

  // Nav items shared between sidebar and bottom bar
  const navItems = [
    ...((!isStudent) ? [
      { to: "/dashboard", icon: BookOpen, label: "Dashboard", match: location.pathname === "/dashboard" },
      { to: "/students", icon: Users, label: "Students", match: location.pathname === "/students" || location.pathname.startsWith("/students/") },
    ] : []),
    { to: "/calendar", icon: CalendarIcon, label: "Calendar", match: location.pathname === "/calendar" },
    { to: "/messages", icon: MessageCircle, label: "Messages", match: location.pathname.startsWith("/messages"), badge: unreadCount },
    ...((!isStudent) ? [
      { to: "/payments", icon: CreditCard, label: "Payments", match: location.pathname === "/payments" },
    ] : []),
    { to: "/profile", icon: UserIcon, label: "Profile", match: location.pathname === "/profile" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight">Skola</h1>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {navItems.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={clsx(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors relative",
                item.match ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
              )}
            >
              <item.icon className={clsx("w-5 h-5", item.match ? "text-white" : "text-slate-500")} />
              {item.label}
              {item.badge && item.badge > 0 && !item.match && (
                <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-auto">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          ))}
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
      <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8">
        <Outlet />
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-pb">
        <div className="flex justify-around items-center h-14">
          {navItems.slice(0, 5).map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={clsx(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative pt-1",
                item.match ? "text-blue-600" : "text-gray-400"
              )}
            >
              <div className="relative">
                <item.icon className="w-5 h-5" />
                {item.badge && item.badge > 0 && !item.match && (
                  <span className="absolute -top-1.5 -right-2 bg-blue-600 text-white text-[8px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
