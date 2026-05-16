import { useState, useEffect, FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useAuthStore } from "../lib/store";
import { Mail } from "lucide-react";

export function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<any>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAuthStore();

  useEffect(() => {
    const url = id ? `/api/students/${id}` : "/api/students/me";
    fetch(url, {
        headers: { Authorization: `Bearer ${token || ""}` }
    })
    .then(res => res.json())
    .then(data => {
        setProfile(data);
        setLoading(false);
    })
    .catch(err => {
        console.error(err);
        setLoading(false);
    });

    if (id) {
        fetch(`/api/students/${id}/lessons`, {
            headers: { Authorization: `Bearer ${token || ""}` }
        })
        .then(res => res.json())
        .then(data => setLessons(data))
        .catch(console.error);
    }
  }, [id, token]);

  const handleSubmit = (e: FormEvent) => {
      e.preventDefault();
      alert("Profile saving not implemented yet");
  };

  if (loading) return <div className="p-8 text-center">Loading profile...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold mb-6">{id ? "Student Profile" : "My Profile"}</h1>
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex gap-4">
            <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">First Name</label>
                <input value={profile?.firstName || ""} onChange={e => setProfile({...profile, firstName: e.target.value})} className="w-full mt-1 border px-3 py-2 rounded-md" />
            </div>
            <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">Last Name</label>
                <input value={profile?.lastName || ""} onChange={e => setProfile({...profile, lastName: e.target.value})} className="w-full mt-1 border px-3 py-2 rounded-md" />
            </div>
        </div>
        <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <div className="flex items-center gap-2 mt-1">
                <Mail className="w-5 h-5 text-gray-400" />
                <input value={profile?.email || ""} readOnly className="w-full border px-3 py-2 rounded-md bg-gray-50 text-gray-500" />
            </div>
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md">Save Profile</button>
      </form>

      {id && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold">Lesson History</h2>
                <div className="text-right">
                    <p className="text-xs text-gray-500 uppercase font-semibold">Total Paid Lessons Value</p>
                    <p className="text-xl font-bold text-emerald-600">
                        {lessons.filter(l => l.paid).length * 30} EUR
                    </p>
                    <p className="text-[10px] text-gray-400">Calculated at 30 EUR/lesson</p>
                </div>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead>
                        <tr className="border-b text-gray-400 text-[11px] uppercase tracking-wider">
                            <th className="p-3 font-semibold">Date & Time</th>
                            <th className="p-3 font-semibold">Place</th>
                            <th className="p-3 font-semibold">Instructor Comments</th>
                            <th className="p-3 font-semibold text-center">Paid</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {lessons.map(lesson => (
                            <tr key={lesson.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="p-3">
                                    <div className="font-medium text-gray-900">{lesson.date}</div>
                                    <div className="text-xs text-gray-500">{lesson.startTime} - {lesson.endTime}</div>
                                </td>
                                <td className="p-3 text-gray-600">
                                    {lesson.location || <span className="text-gray-300 italic">No place set</span>}
                                </td>
                                <td className="p-3 text-gray-600 max-w-xs truncate">
                                    {lesson.notes || <span className="text-gray-300 italic">No comments</span>}
                                </td>
                                <td className="p-3 text-center">
                                    {lesson.paid 
                                        ? <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold border border-emerald-100">PAID</span>
                                        : <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold border border-amber-100">UNPAID</span>
                                    }
                                </td>
                            </tr>
                        ))}
                        {lessons.length === 0 && (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-gray-400 italic">
                                    No lesson records available for this student yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      )}
    </div>
  );
}
