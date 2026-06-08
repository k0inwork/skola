import { useState, useEffect } from "react";
import { format, addDays, startOfWeek, isSameDay, subDays } from "date-fns";
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
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [rescheduleFromSlot, setRescheduleFromSlot] = useState<Slot | null>(null);
  const [isMobileDayView, setIsMobileDayView] = useState(false);

  // Detect mobile on mount and resize
  useEffect(() => {
    const check = () => setIsMobileDayView(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Touch swipe for mobile day navigation
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = e.changedTouches[0].clientX - touchStart;
    if (Math.abs(diff) > 60) {
      setCurrentDate(diff > 0 ? subDays(currentDate, 1) : addDays(currentDate, 1));
    }
    setTouchStart(null);
  };

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
    if (rescheduleMode) {
      if (slot.isAvailable) {
        setBookingSlot(slot);
        setIsBookingOpen(true);
      }
      return;
    }
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

  const handleStartReschedule = () => {
    setRescheduleFromSlot(bookingSlot);
    setRescheduleMode(true);
    setIsBookingOpen(false);
  };

  const handleReschedule = async () => {
    if (!rescheduleFromSlot?.lesson || !bookingSlot) return;
    try {
      const res = await fetch(`/api/calendar/reschedule-lesson/${rescheduleFromSlot.lesson.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetSlotId: bookingSlot.id })
      });
      if (res.ok) {
        setIsBookingOpen(false);
        setRescheduleMode(false);
        setRescheduleFromSlot(null);
        fetchCalendarData();
      } else {
        const body = await res.json();
        toastError(body.error || "Reschedule failed");
      }
    } catch (err) {
      console.error("Reschedule error:", err);
    }
  };

  const handleCancelPendingReschedule = async () => {
    if (!bookingSlot?.lesson) return;
    try {
      const res = await fetch(`/api/calendar/cancel-reschedule/${bookingSlot.lesson.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setIsBookingOpen(false);
        fetchCalendarData();
      } else {
        const body = await res.json();
        toastError(body.error || "Failed to cancel reschedule");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);
  const totalHeight = hours.length * HOUR_HEIGHT;

  const renderDayView = () => {
    const slotList = getDaySlots(currentDate);
    return (
      <div
        className="flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-gray-200 overflow-auto"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="p-4 border-b border-gray-100 text-center">
          <div className="text-lg font-bold text-gray-900">{format(currentDate, "EEEE, MMMM d")}</div>
        </div>
        <div className="p-3 space-y-3">
          {slotList.length === 0 && (
            <div className="text-sm text-center text-gray-400 py-8">No slots available this day</div>
          )}
          {slotList.map((slot, idx) => {
            const isPending = slot.lesson?.status === "reschedule_pending";
            const isClickable = rescheduleMode ? slot.isAvailable : (slot.isAvailable || slot.isMine);
            return (
              <button
                key={idx}
                disabled={!isClickable}
                onClick={() => handleSlotClick(slot)}
                className={clsx(
                  "w-full rounded-lg text-left border transition-colors p-4 min-h-[60px]",
                  isPending && slot.isMine && !rescheduleMode
                    ? "bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-300 border-dashed"
                    : slot.isAvailable
                      ? rescheduleMode
                        ? "bg-emerald-200 hover:bg-emerald-300 text-emerald-900 border-emerald-400 ring-2 ring-emerald-400/50"
                        : "bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-200"
                      : slot.isMine && !rescheduleMode
                        ? "bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300"
                        : "bg-gray-50 text-gray-400 cursor-not-allowed border-gray-100"
                )}
              >
                <div className="font-bold text-sm">{slot.time}–{slot.endTime}</div>
                <div className="text-sm mt-1">
                  {rescheduleMode && slot.isAvailable ? "Move Here" : slot.isAvailable ? "Book" : isPending && slot.isMine && !rescheduleMode ? "Move Pending" : slot.isMine && !rescheduleMode ? "My Lesson" : "Taken"}
                </div>
                {isPending && slot.isMine && slot.lesson?.proposedDate && (
                  <div className="text-xs text-amber-600 font-medium mt-1">
                    → {slot.lesson.proposedDate} {slot.lesson.proposedStartTime}–{slot.lesson.proposedEndTime}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeekView = () => (
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
                    const isClickable = rescheduleMode ? slot.isAvailable : (slot.isAvailable || slot.isMine);

                    return (
                      <button
                        key={idx}
                        disabled={!isClickable}
                        onClick={() => handleSlotClick(slot)}
                        className={clsx(
                          "absolute left-1 right-1 rounded text-left text-[10px] border transition-colors",
                          isPending && slot.isMine && !rescheduleMode
                            ? "bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-300 border-dashed cursor-pointer"
                            : slot.isAvailable
                              ? rescheduleMode
                                ? "bg-emerald-200 hover:bg-emerald-300 text-emerald-900 border-emerald-400 cursor-pointer ring-2 ring-emerald-400/50"
                                : "bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-200 cursor-pointer"
                              : slot.isMine && !rescheduleMode
                                ? "bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300 cursor-pointer"
                                : "bg-gray-50 text-gray-400 cursor-not-allowed border-gray-100"
                        )}
                        style={{ top: slotTop, height: slotHeight - 2 }}
                      >
                        <div className="px-1.5 py-0.5 font-bold">{slot.time}–{slot.endTime}</div>
                        <div className="px-1.5 pb-0.5">
                          {rescheduleMode && slot.isAvailable ? "Move Here" : slot.isAvailable ? "Book" : isPending && slot.isMine && !rescheduleMode ? "Move Pending" : slot.isMine && !rescheduleMode ? "My Lesson" : "Taken"}
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
  );

  return (
    <div className="space-y-4 h-full flex flex-col pb-4">
      <div className="flex justify-between items-center shrink-0">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">Book Lessons</h1>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
          <button onClick={() => setCurrentDate(isMobileDayView ? subDays(currentDate, 1) : addDays(currentDate, -7))} className="p-2 hover:bg-gray-100 rounded text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium px-3">
            {isMobileDayView
              ? format(currentDate, "MMM d, yyyy")
              : `${format(weekStart, "MMM d")} - ${format(addDays(weekStart, 6), "MMM d, yyyy")}`}
          </span>
          <button onClick={() => setCurrentDate(isMobileDayView ? addDays(currentDate, 1) : addDays(currentDate, 7))} className="p-2 hover:bg-gray-100 rounded text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Reschedule mode banner */}
      {rescheduleMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-amber-800">Select a new time slot</p>
            <p className="text-xs text-amber-600">
              Moving from {rescheduleFromSlot?.date} {rescheduleFromSlot?.time}–{rescheduleFromSlot?.endTime}
            </p>
          </div>
          <button
            onClick={() => { setRescheduleMode(false); setRescheduleFromSlot(null); }}
            className="text-amber-700 text-sm font-medium hover:text-amber-900"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Calendar body */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm text-gray-400">Loading calendar...</span>
          </div>
        </div>
      ) : isMobileDayView ? renderDayView() : renderWeekView()}

      {/* Booking/Reschedule dialog */}
      {isBookingOpen && bookingSlot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6">
            {rescheduleMode ? (
              <>
                <h3 className="text-lg font-bold mb-2">Confirm Reschedule?</h3>
                <p className="text-sm text-gray-400 mb-1">
                  <span className="line-through">{rescheduleFromSlot?.date} {rescheduleFromSlot?.time}–{rescheduleFromSlot?.endTime}</span>
                </p>
                <p className="text-sm text-emerald-700 font-medium mb-4">
                  → {bookingSlot.date} {bookingSlot.time}–{bookingSlot.endTime}
                </p>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => { setIsBookingOpen(false); setRescheduleMode(false); setRescheduleFromSlot(null); }} className="px-4 py-2 text-gray-600">Cancel</button>
                  <button onClick={handleReschedule} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium">
                    Yes, Reschedule
                  </button>
                </div>
              </>
            ) : bookingSlot.isMine && bookingSlot.lesson?.status === "reschedule_pending" ? (
              <>
                <h3 className="text-lg font-bold mb-2">Pending Reschedule</h3>
                <p className="text-sm text-gray-500 mb-1">
                  {bookingSlot.date} at {bookingSlot.time}–{bookingSlot.endTime}
                </p>
                {bookingSlot.lesson.proposedDate && (
                  <p className="text-sm text-amber-700 font-medium mb-4">
                    Requested move to: {bookingSlot.lesson.proposedDate} {bookingSlot.lesson.proposedStartTime}–{bookingSlot.lesson.proposedEndTime}
                  </p>
                )}
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setIsBookingOpen(false)} className="px-4 py-2 text-gray-600">Go back</button>
                  <button onClick={handleCancelPendingReschedule} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium">
                    Cancel Request
                  </button>
                </div>
              </>
            ) : bookingSlot.isMine ? (
              <>
                <h3 className="text-lg font-bold mb-2">Your Lesson</h3>
                <p className="text-sm text-gray-500 mb-4">
                  {bookingSlot.date} at {bookingSlot.time}–{bookingSlot.endTime}
                </p>
                {(() => {
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
                  <button onClick={() => setIsBookingOpen(false)} className="px-4 py-2 text-gray-600">Go back</button>
                  <button onClick={handleStartReschedule} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium">
                    Reschedule
                  </button>
                  <button onClick={handleBookSlot} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium">
                    Cancel Lesson
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold mb-2">Confirm booking?</h3>
                <p className="text-sm text-gray-500 mb-4">
                  {bookingSlot.date} at {bookingSlot.time}–{bookingSlot.endTime}
                </p>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setIsBookingOpen(false)} className="px-4 py-2 text-gray-600">No, go back</button>
                  <button onClick={handleBookSlot} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium">
                    Yes, Confirm
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
