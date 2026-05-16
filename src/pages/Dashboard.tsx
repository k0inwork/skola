export function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
        <p className="mt-1 text-gray-500">Welcome to Scola CRM.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-gray-500 font-medium text-sm">Active Students</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">0</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-gray-500 font-medium text-sm">Scheduled Lessons</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">0</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-gray-500 font-medium text-sm">Pending Payments</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">€0</p>
        </div>
      </div>
    </div>
  );
}
