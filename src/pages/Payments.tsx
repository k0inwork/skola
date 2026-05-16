import { Plus } from "lucide-react";

export function Payments() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Payments</h1>
          <p className="mt-1 text-gray-500">Manage student payments and invoices.</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition">
          <Plus className="w-4 h-4" />
          Record Payment
        </button>
      </div>

      <div className="bg-white p-8 text-center text-gray-500 rounded-xl border border-gray-100 shadow-sm">
        Payments module coming soon!
      </div>
    </div>
  );
}
