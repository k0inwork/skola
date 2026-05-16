import { useState, useEffect } from "react";
import { useAuthStore } from "../lib/store";
import { Plus, DollarSign, Clock, CheckCircle2, AlertCircle } from "lucide-react";

interface Payment {
  id: string;
  studentId: string;
  enrollmentId: string;
  amount: string;
  paidAt: string;
  method: string | null;
  reference: string | null;
  comment: string | null;
  status: string;
  studentFirstName: string;
  studentLastName: string;
}

interface PaymentStats {
  totalRevenue: number;
  pendingPayments: number;
  paidLessonsTotal: number;
  unpaidLessonsCount: number;
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
}

export function Payments() {
  const { token, role } = useAuthStore();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // New payment form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState({
    studentId: "",
    amount: "",
    paidAt: new Date().toISOString().split("T")[0],
    method: "cash",
    comment: "",
  });

  useEffect(() => {
    fetchPayments();
    fetchStats();
    fetchStudents();
  }, [token]);

  const fetchPayments = async () => {
    try {
      const res = await fetch("/api/payments", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setPayments(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/payments/stats", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await fetch("/api/students?limit=100", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStudents(data.data || data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreatePayment = async () => {
    try {
      // Find or use first enrollment for student
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          studentId: form.studentId,
          enrollmentId: "00000000-0000-0000-0000-000000000000", // placeholder, backend should handle
          amount: form.amount,
          paidAt: form.paidAt,
          method: form.method,
          comment: form.comment,
          status: "paid",
        })
      });
      if (res.ok) {
        setIsFormOpen(false);
        setForm({ studentId: "", amount: "", paidAt: new Date().toISOString().split("T")[0], method: "cash", comment: "" });
        fetchPayments();
        fetchStats();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create payment");
      }
    } catch (err) {
      console.error(err);
      alert("Error creating payment");
    }
  };

  const handleDeletePayment = async (id: string) => {
    if (!confirm("Delete this payment?")) return;
    try {
      const res = await fetch(`/api/payments/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchPayments();
        fetchStats();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (role === "client") {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Payments</h1>
        <div className="bg-white p-8 text-center text-gray-500 rounded-xl border border-gray-100 shadow-sm">
          Payment history will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Payments</h1>
          <p className="mt-1 text-gray-500">Track revenue and student payments.</p>
        </div>
        <button
          onClick={() => setIsFormOpen(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4" />
          Record Payment
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Total Revenue</p>
                <p className="text-xl font-bold text-gray-900">{stats.totalRevenue.toFixed(2)} EUR</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Paid Lessons</p>
                <p className="text-xl font-bold text-gray-900">{stats.paidLessonsTotal.toFixed(2)} EUR</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Pending</p>
                <p className="text-xl font-bold text-gray-900">{stats.pendingPayments.toFixed(2)} EUR</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Unpaid Lessons</p>
                <p className="text-xl font-bold text-gray-900">{stats.unpaidLessonsCount}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payments Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b text-gray-400 text-[11px] uppercase tracking-wider bg-gray-50/50">
                <th className="p-4 font-semibold">Student</th>
                <th className="p-4 font-semibold">Amount</th>
                <th className="p-4 font-semibold">Date</th>
                <th className="p-4 font-semibold">Method</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Comment</th>
                <th className="p-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.map(payment => (
                <tr key={payment.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="p-4 font-medium text-gray-900">
                    {payment.studentFirstName} {payment.studentLastName}
                  </td>
                  <td className="p-4 font-semibold text-gray-900">{payment.amount} EUR</td>
                  <td className="p-4 text-gray-600">{payment.paidAt}</td>
                  <td className="p-4 text-gray-600 capitalize">{payment.method || "-"}</td>
                  <td className="p-4">
                    <span className={clsx(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                      payment.status === "paid" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                      payment.status === "pending" ? "bg-amber-50 text-amber-700 border-amber-100" :
                      "bg-gray-50 text-gray-700 border-gray-100"
                    )}>
                      {payment.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4 text-gray-500 max-w-xs truncate">{payment.comment || "-"}</td>
                  <td className="p-4">
                    <button
                      onClick={() => handleDeletePayment(payment.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 italic">
                    No payments recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Payment Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Record Payment</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Student</label>
                <select
                  value={form.studentId}
                  onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                  className="w-full p-2 border rounded text-sm"
                >
                  <option value="">Select student...</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (EUR)</label>
                <input
                  type="text"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="30.00"
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={form.paidAt}
                  onChange={(e) => setForm({ ...form, paidAt: e.target.value })}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
                <select
                  value={form.method}
                  onChange={(e) => setForm({ ...form, method: e.target.value })}
                  className="w-full p-2 border rounded text-sm"
                >
                  <option value="cash">Cash</option>
                  <option value="transfer">Bank Transfer</option>
                  <option value="card">Card</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comment</label>
                <input
                  type="text"
                  value={form.comment}
                  onChange={(e) => setForm({ ...form, comment: e.target.value })}
                  placeholder="Optional note..."
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setIsFormOpen(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePayment}
                disabled={!form.studentId || !form.amount}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
              >
                Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function clsx(...args: (string | boolean | undefined | null)[]) {
  return args.filter(Boolean).join(" ");
}
