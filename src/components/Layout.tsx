import { Outlet, Navigate, Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../lib/store";
import { ToastContainer } from "../lib/notify";
import { LogOut, Users, BookOpen, CreditCard, Calendar as CalendarIcon, User as UserIcon, MessageCircle, Bell, X, MoreVertical } from "lucide-react";
import clsx from "clsx";
import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

export function Layout() {
  const { token, role, logout } = useAuthStore();
  const location = useLocation();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [calendarAlerts, setCalendarAlerts] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  const isStudent = role === "client";

  // Fetch unread message count
  useEffect(() => {
    if (!token) return;
    fetch("/api/messages/conversations", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : [])
      .then((convs: any[]) => {
        setUnreadMessages(convs.reduce((sum: number, c: any) => sum + (c.unreadCount || 0), 0));
      })
      .catch(() => {});

    const socket = io({ auth: { token } });
    socket.on("new_message", () => {
      fetch("/api/messages/conversations", {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.ok ? r.json() : [])
        .then((convs: any[]) => {
          setUnreadMessages(convs.reduce((sum: number, c: any) => sum + (c.unreadCount || 0), 0));
        })
        .catch(() => {});
    });

    // Listen for calendar updates (bookings/cancellations) for non-students
    if (!isStudent) {
      socket.on("calendar_update", () => {
        setCalendarAlerts(prev => prev + 1);
      });
    }

    return () => { socket.disconnect(); };
  }, [token, isStudent]);

  // Reset calendar badge when visiting calendar page
  useEffect(() => {
    if (location.pathname === "/calendar") {
      setCalendarAlerts(0);
    }
  }, [location.pathname]);

  // Click outside to close dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifDropdown(false);
      }
      if (showMobileMenu) setShowMobileMenu(false);
    };
    if (showNotifDropdown || showMobileMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotifDropdown, showMobileMenu]);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (!showNotifDropdown || !token || isStudent) return;
    fetch("/api/calendar/notifications?limit=15", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : [])
      .then(setNotifications)
      .catch(() => {});
  }, [showNotifDropdown, token, isStudent]);

  // Reset message badge when visiting messages page
  useEffect(() => {
    if (location.pathname.startsWith("/messages")) {
      setUnreadMessages(0);
    }
  }, [location.pathname]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Nav items shared between sidebar and bottom bar
  const navItems = [
    ...((!isStudent) ? [
      { to: "/dashboard", icon: BookOpen, label: "Dashboard", match: location.pathname === "/dashboard" },
      { to: "/students", icon: Users, label: "Students", match: location.pathname === "/students" || location.pathname.startsWith("/students/") },
    ] : []),
    { to: "/calendar", icon: CalendarIcon, label: "Calendar", match: location.pathname === "/calendar", badge: calendarAlerts },
    { to: "/messages", icon: MessageCircle, label: "Messages", match: location.pathname.startsWith("/messages"), badge: unreadMessages },
    ...((!isStudent) ? [
      { to: "/payments", icon: CreditCard, label: "Payments", match: location.pathname === "/payments" },
    ] : []),
    { to: "/profile", icon: UserIcon, label: "Profile", match: location.pathname === "/profile" },
  ];

  const renderBadge = (count: number, _isMatch: boolean, small?: boolean) => {
    if (!count || count <= 0) return null;
    return (
      <span className={clsx(
        "bg-blue-600 text-white font-bold rounded-full flex items-center justify-center leading-none",
        small
          ? "absolute -top-1 -right-2 text-[8px] w-4 h-4"
          : "text-[10px] px-1.5 py-0.5 ml-auto"
      )}>
        {small ? (count > 9 ? "9+" : count) : (count > 99 ? "99+" : count)}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      <ToastContainer />
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col">
        <div className="p-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Olaines autoskola</h1>
          {!isStudent && (
            <button
              onClick={() => setShowNotifDropdown(!showNotifDropdown)}
              className="relative p-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Bell className="w-5 h-5 text-slate-400" />
              {calendarAlerts > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {calendarAlerts > 9 ? "9+" : calendarAlerts}
                </span>
              )}
            </button>
          )}
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
              {item.badge !== undefined && renderBadge(item.badge, item.match)}
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
      <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8 relative">
        {/* Notification dropdown — desktop: top-right, mobile: bottom sheet */}
        {showNotifDropdown && !isStudent && (
          <div ref={notifRef} className="absolute top-2 right-2 md:top-4 md:right-4 z-50 md:w-80 md:max-h-96 w-[calc(100%-1rem)] left-2 md:left-auto max-h-[60vh] md:max-h-96 overflow-auto bg-white rounded-xl shadow-xl border border-gray-200">
            <div className="sticky top-0 bg-white p-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Calendar Activity</h3>
              <button onClick={() => setShowNotifDropdown(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-gray-400 text-center">No recent activity</p>
            ) : (
              notifications.map((n: any) => (
                <div key={n.id} className="px-3 py-2.5 border-b border-gray-50 flex items-start gap-2 hover:bg-gray-50">
                  <div className={clsx(
                    "w-2.5 h-2.5 rounded-full mt-1.5 shrink-0",
                    n.type === "booked" ? "bg-emerald-500" :
                    n.type === "cancelled" ? "bg-red-500" :
                    n.type === "reschedule_pending" ? "bg-amber-500" :
                    "bg-amber-500"
                  )} />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-700">
                      <span className="font-medium">{n.studentName}</span>
                      {" — "}
                      <span className={clsx(
                        "font-medium",
                        n.type === "booked" ? "text-emerald-600" :
                        n.type === "cancelled" ? "text-red-600" :
                        n.type === "reschedule_pending" ? "text-amber-600" :
                        "text-amber-600"
                      )}>
                        {n.type === "booked" ? "Booked" : n.type === "cancelled" ? "Cancelled" : n.type === "reschedule_pending" ? "Move Request" : "Rescheduled"}
                      </span>
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {n.date} {n.startTime}–{n.endTime}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        <Outlet />
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-pb">
        <div className="flex justify-around items-center h-14">
          {navItems.slice(0, 3).map(item => (
            <Link
              key={item.to}
              to={item.to}
              onClick={(e) => {
                if (item.to === "/calendar" && calendarAlerts > 0 && !isStudent) {
                  e.preventDefault();
                  setShowNotifDropdown(!showNotifDropdown);
                }
              }}
              className={clsx(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative pt-1",
                item.match ? "text-blue-600" : "text-gray-400"
              )}
            >
              <div className="relative">
                <item.icon className="w-5 h-5" />
                {item.badge !== undefined && renderBadge(item.badge, item.match, true)}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          ))}
          {/* More menu for overflow items (if any) */}
          {(() => {
            const overflow = navItems.slice(3);
            if (overflow.length > 0) {
              return (
                <button
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  className={clsx(
                    "flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative pt-1",
                    overflow.some(item => item.match) ? "text-blue-600" : "text-gray-400"
                  )}
                >
                  <div className="relative">
                    {showMobileMenu ? <X className="w-5 h-5" /> : <MoreVertical className="w-5 h-5" />}
                  </div>
                  <span className="text-[10px] font-medium">More</span>
                </button>
              );
            }
            return null;
          })()}
          {/* Logout — always visible */}
          <button
            onClick={logout}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full pt-1 text-gray-400"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-[10px] font-medium">Sign Out</span>
          </button>
        </div>

        {/* Mobile overflow menu */}
        {showMobileMenu && (
          <div className="absolute bottom-14 right-0 left-0 bg-white border-t border-gray-200 shadow-lg z-50">
            {navItems.slice(3).map(item => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setShowMobileMenu(false)}
                className={clsx(
                  "flex items-center gap-3 px-4 py-3 border-b border-gray-50",
                  item.match ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-50"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="ml-auto bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{item.badge}</span>
                )}
              </Link>
            ))}
            {!isStudent && (
              <button
                onClick={() => { setShowMobileMenu(false); setShowNotifDropdown(!showNotifDropdown); }}
                className="flex items-center gap-3 px-4 py-3 w-full text-gray-700 hover:bg-gray-50 border-b border-gray-50"
              >
                <Bell className="w-5 h-5" />
                <span className="text-sm font-medium">Notifications</span>
                {calendarAlerts > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{calendarAlerts}</span>
                )}
              </button>
            )}
            <button
              onClick={() => { setShowMobileMenu(false); logout(); }}
              className="flex items-center gap-3 px-4 py-3 w-full text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-medium">Sign Out</span>
            </button>
          </div>
        )}
      </nav>
    </div>
  );
}
