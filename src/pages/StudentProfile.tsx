import { useState, useEffect } from "react";
import { useAuthStore } from "../lib/store";
import { Mail } from "lucide-react";

export function StudentProfile() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { token } = useAuthStore();

  useEffect(() => {
    fetch("/api/students/me", {
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
  }, [token]);

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      // Implementation for saving profile
      alert("Profile saving not implemented yet");
  };

  if (loading) return <div className="p-8 text-center">Loading profile...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">My Profile</h1>
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
    </div>
  );
}
