import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { useAuthStore } from "../lib/store";

interface StudentStats {
  scheduledLessons: number;
}

export function StudentDashboard() {
  const [stats, setStats] = useState<StudentStats>({ scheduledLessons: 0 });
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const token = useAuthStore(s => s.token);

  useEffect(() => {
    fetch("/api/dashboard/stats", {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.ok ? res.json() : Promise.reject("Failed to fetch"))
    .then(data => {
      setStats(data);
      setLoading(false);
    })
    .catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !Array.isArray(data)) return;
        const insts = data.filter((u: any) => u.role === "instructor" || u.role === "admin");
        if (insts.length > 0) setInstructorId(insts[0].id);
      })
      .catch(console.error);
  }, [token]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">My Dashboard</h1>
        <p className="mt-1 text-gray-500">Welcome student.</p>
      </div>
      
      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading your data...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="text-gray-500 font-medium text-sm">My Scheduled Lessons</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{stats.scheduledLessons}</p>
          </div>
        </div>
      )}

      {instructorId && (
        <Link to={`/messages/${instructorId}`} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4 hover:bg-gray-50 transition max-w-md">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-gray-900 font-semibold">Contact Instructor</h3>
            <p className="text-gray-500 text-sm">Send a message</p>
          </div>
        </Link>
      )}
    </div>
  );
}
