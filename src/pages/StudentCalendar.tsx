import { useState, useEffect } from "react";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { useAuthStore } from "../lib/store";
import { toastError } from "../lib/notify";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { io } from "socket.io-client";

interface BookedLesson {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  studentId: string | null;
  studentFirstName: string;
  studentLastName: string;
  location?: string | null;
  isMine?: boolean;
  status?: string | null;
  proposedDate?: string | null;
  proposedStartTime?: string | null;
  proposedEndTime?: string | null;
  createdAt?: string | null;
}

interface Slot {
  id: string;
  time: string;
  endTime: string;
  date: string;
  isAvailable: boolean;
  isMine: boolean;
  lesson?: BookedLesson;
}

const GRID_START_HOUR = 6;
const GRID_END_HOUR = 22;
const HOUR_HEIGHT = 60;

const timeToY = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return (h - GRID_START_HOUR) * HOUR_HEIGHT + (m / 60) * HOUR_HEIGHT;
};

export function StudentCalendar() {
  const { token } = useAuthStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedInstructor, setSelectedInstructor] = useState("");
  const [dbSlots, setDbSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<Slot | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !Array.isArray(data)) return;
        const insts = data.filter((u: any) => u.role === "instructor" || u.role === "admin");
        if (insts.length > 0) setSelectedInstructor(insts[0].id);
      })
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    if (selectedInstructor) fetchCalendarData();
  }, [selectedInstructor, currentDate]);

  useEffect(() => {
    const socket = io({ auth: { token } });
    socket.on("calendar_update", (data) => {
      if (!data.instructorId || data.instructorId === selectedInstructor || data.instructorId === "all") {
        fetchCalendarData();
      }
    });
    return () => { socket.disconnect(); };
  }, [selectedInstructor, currentDate]);

  const fetchCalendarData = async () => {
    setLoading(true);
    try {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const startStr = format(weekStart, "yyyy-MM-dd");
      const endStr = format(addDays(weekStart, 6), "yyyy-MM-dd");

      const res = await fetch(`/api/calendar/slots?instructorId=${selectedInstructor}&startDate=${startStr}&endDate=${endStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDbSlots(data.slots.map((s: any) => ({
          id: s.id,
          time: s.startTime,
          endTime: s.endTime,
          date: s.date,
          isAvailable: !s.isBooked,
          isMine: !!s.lesson?.isMine,
          lesson: s.lesson,
        })));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getDaySlots = (date: Date): Slot[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    return dbSlots
      .filter(s => s.date === dateStr)
      .sort((a, b) => a.time.localeCompare(b.time));
  };

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const handleSlotClick = (slot: Slot) => {
    if (!slot.isAvailable && !slot.isMine) return;
    setBookingSlot(slot);
    setIsBookingOpen(true);
  };

  const handleBookSlot = async () => {
    if (!bookingSlot) return;

    if (bookingSlot.isMine && bookingSlot.lesson) {
      const res = await fetch(`/api/calendar/cancel-lesson/${bookingSlot.lesson.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setIsBookingOpen(false);
        fetchCalendarData();
      } else {
        toastError("Failed to cancel lesson");
      }
      return;
    }

    try {
      const res = await fetch("/api/calendar/book", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slotId: bookingSlot.id })
      });
      if (res.ok) {
        setIsBookingOpen(false);
        fetchCalendarData();
      } else {
        const body = await res.json();
        toastError(body.error || "Booking failed");
      }
    } catch (err) {
      console.error("Booking error:", err);
    }
  };

  const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);
  const totalHeight = hours.length * HOUR_HEIGHT;

  return (
    <div className="space-y-4 h-full flex flex-col pb-4">
      <div className="flex justify-between items-center shrink-0">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">Book Lessons</h1>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
          <button onClick={() => setCurrentDate(addDays(currentDate, -7))} className="p-2 hover:bg-gray-100 rounded text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium px-3">
            {format(weekStart, "MMM d")} - {format(addDays(weekStart, 6), "MMM d, yyyy")}
          </span>
          <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="p-2 hover:bg-gray-100 rounded text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Time grid */}
      <div className="flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-gray-200 overflow-auto">
        <div className="flex min-w-[800px]">
          {/* Time gutter */}
          <div className="w-14 shrink-0 border-r border-gray-100" style={{ height: totalHeight + 60 }}>
            <div className="h-[60px] border-b border-gray-100" />
            {hours.map(h => (
              <div key={h} style={{ height: HOUR_HEIGHT }} className="relative border-b border-gray-50">
                <span className="absolute -top-2.5 left-2 text-[10px] text-gray-400 font-medium">
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="grid grid-cols-7 flex-1 divide-x divide-gray-100">
            {weekDays.map((d, i) => {
              const isToday = isSameDay(d, new Date());
              const slotList = getDaySlots(d);

              return (
                <div key={i} className="flex flex-col">
                  {/* Day header */}
                  <div className={clsx(
                    "h-[60px] border-b border-gray-100 text-center shrink-0 flex flex-col items-center justify-center",
                    isToday ? "bg-blue-50" : "bg-white"
                  )}>
                    <div className={clsx("text-xs font-medium", isToday ? "text-blue-600" : "text-gray-600")}>{format(d, "EEE")}</div>
                    <div className={clsx("text-lg font-light", isToday && "font-semibold text-blue-600")}>{format(d, "d")}</div>
                  </div>

                  {/* Grid body */}
                  <div className="relative" style={{ height: totalHeight }}>
                    {/* Hour lines */}
                    {hours.map(h => (
                      <div key={h} className="absolute left-0 right-0 border-b border-gray-50" style={{ top: (h - GRID_START_HOUR) * HOUR_HEIGHT }} />
                    ))}

                    {/* Slots */}
                    {slotList.map((slot, idx) => {
                      const slotTop = timeToY(slot.time);
                      const slotHeight = timeToY(slot.endTime) - slotTop;
                      const isPending = slot.lesson?.status === "reschedule_pending";
                      const isClickable = slot.isAvailable || slot.isMine;

                      return (
                        <button
                          key={idx}
                          disabled={!isClickable}
                          onClick={() => handleSlotClick(slot)}
                          className={clsx(
                            "absolute left-1 right-1 rounded text-left text-[10px] border transition-colors",
                            isPending && slot.isMine
                              ? "bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-300 border-dashed cursor-pointer"
                              : slot.isAvailable
                                ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-200 cursor-pointer"
                                : slot.isMine
                                  ? "bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300 cursor-pointer"
                                  : "bg-gray-50 text-gray-400 cursor-not-allowed border-gray-100"
                          )}
                          style={{ top: slotTop, height: slotHeight - 2 }}
                        >
                          <div className="px-1.5 py-0.5 font-bold">{slot.time}–{slot.endTime}</div>
                          <div className="px-1.5 pb-0.5">
                            {slot.isAvailable ? "Book" : isPending && slot.isMine ? "Move Pending" : slot.isMine ? "My Lesson" : "Taken"}
                          </div>
                          {isPending && slot.isMine && slot.lesson?.proposedDate && (
                            <div className="px-1.5 pb-0.5 text-[9px] text-amber-600 font-medium">
                              → {slot.lesson.proposedDate} {slot.lesson.proposedStartTime}–{slot.lesson.proposedEndTime}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Booking dialog */}
      {isBookingOpen && bookingSlot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6">
            <h3 className="text-lg font-bold mb-2">
              {bookingSlot.isMine ? "Cancel Lesson?" : "Confirm booking?"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {bookingSlot.date} at {bookingSlot.time}–{bookingSlot.endTime}
            </p>
            {bookingSlot.isMine && (() => {
              const slotDate = bookingSlot.date;
              const slotTime = bookingSlot.time;
              const slotStart = new Date(`${slotDate}T${slotTime}`).getTime();
              const now = Date.now();
              const hoursUntilLesson = (slotStart - now) / (1000 * 60 * 60);
              if (hoursUntilLesson < 24) {
                return (
                  <div className="p-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                    Uzmanību! Atceļot mazāk nekā 24 stundas pirms nodarbības, var tikt piemērots sods.
                  </div>
                );
              }
              return null;
            })()}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setIsBookingOpen(false)} className="px-4 py-2 text-gray-600">No, go back</button>
              <button
                onClick={handleBookSlot}
                className={clsx(
                  "px-4 py-2 rounded font-medium text-white",
                  bookingSlot.isMine ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
                )}
              >
                {bookingSlot.isMine ? "Yes, Cancel" : "Yes, Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
