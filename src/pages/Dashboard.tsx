import { useAuthStore } from "../lib/store";
import { InstructorDashboard } from "./InstructorDashboard";
import { StudentDashboard } from "./StudentDashboard";

export function Dashboard() {
  const role = useAuthStore(s => s.role);
  const isStudent = role === "client";

  if (isStudent) {
    return <StudentDashboard />;
  }

  return <InstructorDashboard />;
}
