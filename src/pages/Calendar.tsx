import { useAuthStore } from "../lib/store";
import { InstructorCalendar } from "./InstructorCalendar";
import { StudentCalendar } from "./StudentCalendar";

export function CalendarView() {
  const role = useAuthStore(s => s.role);
  const isStudent = role === "client";

  if (isStudent) {
    return <StudentCalendar />;
  }

  return <InstructorCalendar />;
}
