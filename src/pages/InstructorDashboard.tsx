import { useEffect, useState } from "react";
import { useAuthStore } from "../lib/store";

interface InstructorStats {
  activeStudents: number;
  scheduledLessons: number;
  pendingPayments: number;
}

export function InstructorDashboard() {
  const [stats, setStats] = useState<InstructorStats>({ activeStudents: 0, scheduledLessons: 0, pendingPayments: 0 });
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Instructor Dashboard</h1>
        <p className="mt-1 text-gray-500">Overview of all active operations.</p>
      </div>
      
      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading metrics...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="text-gray-500 font-medium text-sm">Active Students</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{stats.activeStudents}</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="text-gray-500 font-medium text-sm">Scheduled Lessons</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{stats.scheduledLessons}</p>
          </div>
        </div>
      )}
    </div>
  );
}
