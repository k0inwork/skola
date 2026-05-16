import { useState, useEffect } from "react";
import { format, addDays, startOfWeek, isSameDay, parseISO, isAfter, isBefore, addMinutes, startOfDay } from "date-fns";
import { useAuthStore } from "../lib/store";
import { ChevronLeft, ChevronRight, User as UserIcon } from "lucide-react";
import clsx from "clsx";

interface WorkingDay {
  id: string;
  date: string;
  isWorking: boolean;
  startTime: string;
  endTime: string;
  slotDurationMin: number;
}

interface BookedLesson {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  studentId: string | null;
  studentFirstName: string;
  studentLastName: string;
  studentEmail?: string | null;
  studentPhone?: string | null;
  isMine?: boolean;
}

interface Slot {
  time: string;
  endTime: string;
  date: string;
  isAvailable: boolean;
  lesson?: BookedLesson;
}

export function CalendarView() {
  const { token, role } = useAuthStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [instructors, setInstructors] = useState<any[]>([]);
  const [selectedInstructor, setSelectedInstructor] = useState("");
  
  const [workingDays, setWorkingDays] = useState<WorkingDay[]>([]);
  const [bookedLessons, setBookedLessons] = useState<BookedLesson[]>([]);
  const [loading, setLoading] = useState(false);

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingDate, setEditingDate] = useState<Date | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    isWorking: true,
    startTime: "09:00",
    endTime: "17:00",
    slotDurationMin: 90
  });

  // Booking Modal State
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<Slot | null>(null);

  useEffect(() => {
    // Fetch instructors (users with role instructor or admin for now, but let's just get all users and filter assuming admin=instructor)
    fetch("/api/users")
      .then(r => r.json())
      .then(data => {
        // filter by instructor or admin for testing
        const insts = data.filter((u: any) => u.role === "instructor" || u.role === "admin");
        setInstructors(insts);
        if (insts.length > 0) setSelectedInstructor(insts[0].id);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedInstructor) {
      fetchCalendarData();
    }
  }, [selectedInstructor, currentDate]);

  const fetchCalendarData = async () => {
    setLoading(true);
    try {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
      const weekEnd = addDays(weekStart, 6);
      
      const startStr = format(weekStart, "yyyy-MM-dd");
      const endStr = format(weekEnd, "yyyy-MM-dd");

      const res = await fetch(`/api/calendar/slots?instructorId=${selectedInstructor}&startDate=${startStr}&endDate=${endStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWorkingDays(data.workingDays);
        setBookedLessons(data.bookedLessons);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getDaySlots = (date: Date): Slot[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    const workingDay = workingDays.find(d => d.date === dateStr);
    
    if (!workingDay || !workingDay.isWorking) return [];

    const slots: Slot[] = [];
    const baseDate = startOfDay(date);
    
    // Parse start and end times
    const [startH, startM] = workingDay.startTime.split(":").map(Number);
    const [endH, endM] = workingDay.endTime.split(":").map(Number);
    
    let current = addMinutes(baseDate, startH * 60 + startM);
    const end = addMinutes(baseDate, endH * 60 + endM);

    while (isBefore(current, end) || current.getTime() === end.getTime()) {
      const timeStr = format(current, "HH:mm");
      const nextTime = addMinutes(current, workingDay.slotDurationMin);
      const endTimeStr = format(nextTime, "HH:mm");
      
      if (isAfter(nextTime, end)) break;
      
      // check if overlapping a lesson
      const lesson = bookedLessons.find(l => l.date === dateStr && l.startTime < endTimeStr && l.endTime > timeStr);
      
      slots.push({
        date: dateStr,
        time: timeStr,
        endTime: endTimeStr,
        isAvailable: !lesson,
        lesson
      });
      
      current = nextTime;
    }

    return slots;
  };

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const handleDayClick = (date: Date) => {
    if (role === "admin" || role === "instructor") {
      const dateStr = format(date, "yyyy-MM-dd");
      const existing = workingDays.find(d => d.date === dateStr);
      setEditingDate(date);
      if (existing) {
        setSettingsForm({
          isWorking: existing.isWorking,
          startTime: existing.startTime,
          endTime: existing.endTime,
          slotDurationMin: existing.slotDurationMin
        });
      } else {
        setSettingsForm({ isWorking: true, startTime: "09:00", endTime: "17:00", slotDurationMin: 90 });
      }
      setIsSettingsOpen(true);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDate || !selectedInstructor) return;
    try {
      const res = await fetch("/api/calendar/working-days", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          instructorId: selectedInstructor,
          date: format(editingDate, "yyyy-MM-dd"),
          ...settingsForm
        })
      });
      if (res.ok) {
        setIsSettingsOpen(false);
        fetchCalendarData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSlotClick = (slot: Slot) => {
    if (!slot.isAvailable) return;
    setBookingSlot(slot);
    setIsBookingOpen(true);
  };

  const handleBookSlot = async () => {
    if (!bookingSlot) return;
    try {
      const res = await fetch("/api/calendar/book", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          instructorId: selectedInstructor,
          date: bookingSlot.date,
          startTime: bookingSlot.time,
          endTime: bookingSlot.endTime,
        })
      });
      
      if (res.ok) {
        setIsBookingOpen(false);
        fetchCalendarData();
      } else {
        const body = await res.json();
        alert(body.error || "Booking failed");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col pb-8">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Calendar</h1>
          <p className="mt-1 text-gray-500">Manage instructor availability and lessons.</p>
        </div>
        <div className="flex gap-4">
          <select 
            value={selectedInstructor}
            onChange={(e) => setSelectedInstructor(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 outline-none"
          >
            {instructors.map(ins => (
              <option key={ins.id} value={ins.id}>{ins.email} ({ins.role})</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-sm transition"
            >
              Today
            </button>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-md p-1 shadow-sm">
              <button onClick={() => setCurrentDate(addDays(currentDate, -7))} className="p-1 hover:bg-gray-100 rounded text-gray-600">
                <ChevronLeft className="w-5 h-5"/>
              </button>
              <span className="text-sm font-medium px-4">
                {format(weekStart, "MMM d")} - {format(addDays(weekStart, 6), "MMM d, yyyy")}
              </span>
              <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="p-1 hover:bg-gray-100 rounded text-gray-600">
                <ChevronRight className="w-5 h-5"/>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-gray-200 overflow-auto">
        <div className="grid grid-cols-7 min-w-[800px] divide-x divide-gray-100 min-h-full">
          {weekDays.map((d, i) => {
            const isToday = isSameDay(d, new Date());
            const slotList = getDaySlots(d);
            const dateStr = format(d, "yyyy-MM-dd");
            const wDay = workingDays.find(wd => wd.date === dateStr);
            const isWork = wDay?.isWorking;

            return (
              <div key={i} className="flex flex-col min-h-full">
                <div 
                  onClick={() => handleDayClick(d)}
                  className={clsx(
                    "p-4 border-b border-gray-100 text-center sticky top-0 bg-white z-10",
                    (role === "admin" || role === "instructor") && "cursor-pointer hover:bg-gray-50",
                    isToday ? "text-blue-600" : "text-gray-900"
                  )}
                >
                  <div className="text-sm font-medium">{format(d, "EEE")}</div>
                  <div className={clsx("text-2xl font-light mt-1", isToday && "font-semibold")}>
                    {format(d, "d")}
                  </div>
                  {(role === "admin" || role === "instructor") && (
                    <div className="mt-2 text-xs">
                      {isWork ? (
                        <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">Working</span>
                      ) : (
                        <span className="text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full font-medium">Off</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex-1 p-2 space-y-2 bg-gray-50/30">
                  {!isWork && (
                    <div className="text-xs text-center text-gray-400 py-4">No slots</div>
                  )}
                  {slotList.map((slot, idx) => (
                      <div 
                      key={idx}
                      onClick={() => handleSlotClick(slot)}
                      className={clsx(
                        "p-2.5 text-xs rounded-lg transition-all duration-200 relative group overflow-hidden border",
                        slot.isAvailable 
                          ? "bg-white hover:bg-emerald-50/50 cursor-pointer shadow-sm border-gray-200 hover:border-emerald-200" 
                          : (role === "client" && slot.lesson?.isMine)
                            ? "bg-emerald-50 border-emerald-200 shadow-sm opacity-100"
                            : "bg-gray-50 border-gray-100 shadow-sm opacity-90"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={clsx(
                          "w-2.5 h-2.5 rounded-full shadow-sm shrink-0",
                          slot.isAvailable || (role === "client" && slot.lesson?.isMine) ? "bg-emerald-500 shadow-emerald-500/40" : "bg-gray-800 shadow-gray-900/40"
                        )} />
                        <span className={clsx("font-semibold", slot.isAvailable || (role === "client" && slot.lesson?.isMine) ? "text-gray-900" : "text-gray-500 line-through decoration-gray-300")}>
                          {slot.time} - {slot.endTime}
                        </span>
                      </div>
                      
                      {!slot.isAvailable && slot.lesson && (role === "admin" || role === "instructor") && (
                        <div className="mt-2 flex flex-col gap-1 text-gray-700 ml-4 bg-white rounded p-2 border border-gray-200 shadow-sm">
                          <div className="flex items-center gap-1.5 font-medium text-gray-900">
                            <UserIcon className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                            <span className="truncate">{slot.lesson.studentFirstName} {slot.lesson.studentLastName}</span>
                          </div>
                          {(slot.lesson.studentPhone || slot.lesson.studentEmail) && (
                            <div className="text-[10px] text-gray-500 pl-5 flex flex-col">
                              {slot.lesson.studentPhone && <span>{slot.lesson.studentPhone}</span>}
                              {slot.lesson.studentEmail && <span className="truncate">{slot.lesson.studentEmail}</span>}
                            </div>
                          )}
                        </div>
                      )}
                      {!slot.isAvailable && slot.lesson && role === "client" && (
                        <div className="mt-1 flex flex-col gap-1 ml-4 pl-1">
                          <span className={clsx("font-medium", slot.lesson.isMine ? "text-emerald-700" : "text-gray-400")}>
                            {slot.lesson.isMine ? "Your Booking" : "Booked"}
                          </span>
                        </div>
                      )}
                      {slot.isAvailable && (
                        <div className="mt-1 text-emerald-600 font-medium pl-4">Available</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isSettingsOpen && editingDate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6 relative">
            <h2 className="text-lg font-bold text-gray-900 mb-2">
              Settings for {format(editingDate, "MMM d, yyyy")}
            </h2>
            <form onSubmit={handleSaveSettings} className="space-y-4 py-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={settingsForm.isWorking}
                  onChange={(e) => setSettingsForm({...settingsForm, isWorking: e.target.checked})}
                  className="rounded text-blue-600 focus:ring-blue-500" 
                />
                <span className="text-sm font-medium text-gray-700">Set as working day</span>
              </label>

              {settingsForm.isWorking && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                    <input 
                      type="time" 
                      required
                      value={settingsForm.startTime}
                      onChange={(e) => setSettingsForm({...settingsForm, startTime: e.target.value})}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-blue-500" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">End Time</label>
                    <input 
                      type="time" 
                      required
                      value={settingsForm.endTime}
                      onChange={(e) => setSettingsForm({...settingsForm, endTime: e.target.value})}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-blue-500" 
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Slot Duration (minutes)</label>
                    <input 
                      type="number" 
                      required
                      min={15}
                      step={15}
                      value={settingsForm.slotDurationMin}
                      onChange={(e) => setSettingsForm({...settingsForm, slotDurationMin: Number(e.target.value)})}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-blue-500" 
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsSettingsOpen(false)} className="text-gray-500 text-sm hover:text-gray-700 font-medium">Cancel</button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-md text-sm font-medium">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isBookingOpen && bookingSlot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6 relative">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Book Slot</h2>
            <p className="text-sm text-gray-600 mb-6">
              Confirm booking for {format(parseISO(bookingSlot.date), "MMM d")} from {bookingSlot.time} to {bookingSlot.endTime}?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setIsBookingOpen(false)} className="text-gray-500 text-sm hover:text-gray-700 font-medium">Cancel</button>
              <button onClick={handleBookSlot} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-md text-sm font-medium">Confirm Booking</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
