import React, { useState, useEffect, FormEvent } from "react";
import { format, addDays, startOfWeek, isSameDay, parseISO, isAfter, isBefore, addMinutes, startOfDay, subDays } from "date-fns";
import { useAuthStore } from "../lib/store";
import { ChevronLeft, ChevronRight, User as UserIcon, CheckCircle2, MapPin, GripVertical, XCircle, X } from "lucide-react";
import clsx from "clsx";
import { io } from "socket.io-client";

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
  paid?: boolean | null;
  amount?: string | null;
  notes?: string | null;
  location?: string | null;
}

interface Location {
  id: string;
  name: string;
  address: string | null;
  lat: string | null;
  lng: string | null;
}

interface Slot {
  time: string;
  endTime: string;
  date: string;
  isAvailable: boolean;
  lesson?: BookedLesson;
}

export function InstructorCalendar() {
  const { token, role } = useAuthStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedInstructor, setSelectedInstructor] = useState("");
  const [isMobileDayView, setIsMobileDayView] = useState(false);

  const [workingDays, setWorkingDays] = useState<WorkingDay[]>([]);
  const [bookedLessons, setBookedLessons] = useState<BookedLesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Locations
  const [locations, setLocations] = useState<Location[]>([]);

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingDate, setEditingDate] = useState<Date | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    isWorking: true,
    startTime: "09:00",
    endTime: "17:00",
    slotDurationMin: 90
  });

  // Reschedule state
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleLesson, setRescheduleLesson] = useState<BookedLesson | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: "", startTime: "", endTime: "" });

  // Cancel state
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancelLesson, setCancelLesson] = useState<BookedLesson | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Detect mobile on mount and resize
  useEffect(() => {
    const check = () => setIsMobileDayView(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch("/api/users", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !Array.isArray(data)) return;
        const insts = data.filter((u: any) => u.role === "instructor" || u.role === "admin");
        if (insts.length > 0) setSelectedInstructor(insts[0].id);
      })
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    if (selectedInstructor) {
      fetchCalendarData();
    }
  }, [selectedInstructor, currentDate]);

  useEffect(() => {
    fetch("/api/calendar/locations", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : [])
      .then(setLocations)
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    const socket = io();
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

    // Explicitly set as off → only show existing booked lessons, no empty slots
    if (workingDay && !workingDay.isWorking) {
      const dayLessons = bookedLessons.filter(l => l.date === dateStr);
      return dayLessons.map(l => ({
        date: dateStr,
        time: l.startTime,
        endTime: l.endTime,
        isAvailable: false,
        lesson: l,
      }));
    }

    const slots: Slot[] = [];
    const baseDate = startOfDay(date);

    // Use configured times if working day is set, otherwise defaults
    const startTimeStr = workingDay ? workingDay.startTime : "09:00";
    const endTimeStr = workingDay ? workingDay.endTime : "18:00";
    const duration = workingDay ? workingDay.slotDurationMin : 90;

    const [startH, startM] = startTimeStr.split(":").map(Number);
    const [endH, endM] = endTimeStr.split(":").map(Number);

    let current = addMinutes(baseDate, startH * 60 + startM);
    const end = addMinutes(baseDate, endH * 60 + endM);

    while (isBefore(current, end) || current.getTime() === end.getTime()) {
      const timeStr = format(current, "HH:mm");
      const nextTime = addMinutes(current, duration);
      const endSlotTime = format(nextTime, "HH:mm");

      if (isAfter(nextTime, end)) break;

      const lesson = bookedLessons.find(l => l.date === dateStr && l.startTime < endSlotTime && l.endTime > timeStr);

      slots.push({ date: dateStr, time: timeStr, endTime: endSlotTime, isAvailable: !lesson, lesson });
      current = nextTime;
    }
    return slots;
  };

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const handleDayClick = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const existing = workingDays.find(d => d.date === dateStr);
    setEditingDate(date);
    if (existing) {
      setSettingsForm({ isWorking: existing.isWorking, startTime: existing.startTime, endTime: existing.endTime, slotDurationMin: existing.slotDurationMin });
    } else {
      setSettingsForm({ isWorking: true, startTime: "09:00", endTime: "17:00", slotDurationMin: 90 });
    }
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingDate || !selectedInstructor) return;
    try {
      const res = await fetch("/api/calendar/working-days", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ instructorId: selectedInstructor, date: format(editingDate, "yyyy-MM-dd"), ...settingsForm })
      });
      if (res.ok) {
        setIsSettingsOpen(false);
        await fetchCalendarData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save settings");
      }
    } catch (err) { console.error(err); alert("Error saving settings"); }
  };

  const handleMarkPaid = async (lessonId: string, studentId: string | null) => {
    if (!studentId) return;
    try {
      const res = await fetch("/api/calendar/mark-lesson-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lessonId, studentId })
      });
      if (res.ok) { fetchCalendarData(); } else { alert("Failed to mark as paid"); }
    } catch (err) { console.error(err); alert("Error marking as paid"); }
  };

  const handleUpdateLesson = async (lessonId: string, notes: string, location: string, amount: string) => {
    try {
      const res = await fetch(`/api/calendar/update-lesson/${lessonId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes, location, amount })
      });
      if (res.ok) { fetchCalendarData(); } else { alert("Failed to update lesson"); }
    } catch (err) { console.error(err); alert("Error updating lesson"); }
  };

  const handleReschedule = async () => {
    if (!rescheduleLesson) return;
    try {
      const res = await fetch(`/api/calendar/reschedule-lesson/${rescheduleLesson.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(rescheduleForm)
      });
      if (res.ok) { setIsRescheduleOpen(false); setRescheduleLesson(null); setSelectedSlot(null); fetchCalendarData(); }
      else { const data = await res.json(); alert(data.error || "Failed to reschedule"); }
    } catch (err) { console.error(err); alert("Error rescheduling lesson"); }
  };

  // Drag & drop handlers
  const [draggedLesson, setDraggedLesson] = useState<BookedLesson | null>(null);

  const handleDragStart = (e: React.DragEvent, lesson: BookedLesson) => {
    setDraggedLesson(lesson);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", lesson.id);
  };

  const handleDrop = async (e: React.DragEvent, targetSlot: Slot) => {
    e.preventDefault();
    if (!draggedLesson || !selectedInstructor) return;
    if (!targetSlot.isAvailable) { alert("This slot is already booked"); return; }
    if (draggedLesson.date === targetSlot.date && draggedLesson.startTime === targetSlot.time) return;
    try {
      const res = await fetch(`/api/calendar/reschedule-lesson/${draggedLesson.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date: targetSlot.date, startTime: targetSlot.time, endTime: targetSlot.endTime })
      });
      if (res.ok) { fetchCalendarData(); } else { const data = await res.json(); alert(data.error || "Failed to reschedule"); }
    } catch (err) { console.error(err); alert("Error rescheduling"); }
    setDraggedLesson(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

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

  // --- RENDER ---

  const renderSlot = (slot: Slot, idx: number) => (
    <div
      key={idx}
      draggable={!!slot.lesson && !isMobileDayView}
      onDragStart={(e) => slot.lesson && handleDragStart(e, slot.lesson)}
      onDrop={(e) => handleDrop(e, slot)}
      onDragOver={handleDragOver}
      onClick={() => slot.lesson && setSelectedSlot(slot)}
      className={clsx(
        "rounded-lg transition-all duration-200 relative group overflow-hidden border",
        isMobileDayView ? "p-3" : "p-2.5 text-xs",
        slot.isAvailable
          ? draggedLesson
            ? "bg-white shadow-sm border-dashed border-blue-300 cursor-drop hover:border-blue-400 hover:bg-blue-50/30"
            : "bg-white shadow-sm border-gray-200 cursor-default"
          : "bg-gray-50 border-gray-100 shadow-sm opacity-90 cursor-pointer hover:bg-gray-100",
        slot.lesson && !isMobileDayView && "cursor-grab active:cursor-grabbing"
      )}
    >
      <div className={clsx("flex items-center gap-2 mb-1", isMobileDayView && "mb-2")}>
        <div className={clsx(
          "rounded-full shadow-sm shrink-0",
          isMobileDayView ? "w-3 h-3" : "w-2.5 h-2.5",
          slot.isAvailable ? "bg-emerald-500 shadow-emerald-500/40" : "bg-gray-800 shadow-gray-900/40"
        )} />
        <span className={clsx(
          "font-semibold",
          isMobileDayView ? "text-sm" : "text-xs",
          slot.isAvailable ? "text-gray-900" : "text-gray-500 line-through decoration-gray-300"
        )}>
          {slot.time} - {slot.endTime}
        </span>
        {slot.lesson && !isMobileDayView && (
          <GripVertical className="w-3 h-3 text-gray-400 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>

      {!slot.isAvailable && slot.lesson && (
        <div className={clsx(
          "flex flex-col gap-1 text-gray-700 bg-white rounded p-2 border border-blue-100 shadow-sm",
          !isMobileDayView && "ml-4"
        )}>
          <div className="flex items-center gap-1.5 font-medium text-gray-900">
            <UserIcon className={clsx("shrink-0 text-blue-400", isMobileDayView ? "w-4 h-4" : "w-3.5 h-3.5")} />
            <span className="truncate">{slot.lesson.studentFirstName} {slot.lesson.studentLastName}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {slot.lesson.paid && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
            {slot.lesson.amount && (
              <span className={clsx("text-gray-500", isMobileDayView ? "text-xs" : "text-[10px]")}>{slot.lesson.amount} EUR</span>
            )}
            {slot.lesson.location && (
              <span className={clsx("text-gray-500 flex items-center gap-0.5", isMobileDayView ? "text-xs" : "text-[10px]")}>
                <MapPin className={isMobileDayView ? "w-3 h-3" : "w-2.5 h-2.5"} />{slot.lesson.location}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderWeekView = () => (
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
                  "p-4 border-b border-gray-100 text-center sticky top-0 bg-white z-10 cursor-pointer hover:bg-gray-50",
                  isToday ? "text-blue-600" : "text-gray-900"
                )}
              >
                <div className="text-sm font-medium">{format(d, "EEE")}</div>
                <div className={clsx("text-2xl font-light mt-1", isToday && "font-semibold")}>{format(d, "d")}</div>
                <div className="mt-2 text-xs">
                  {isWork ? (
                    <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">Working</span>
                  ) : (
                    <span className="text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full font-medium">Off</span>
                  )}
                </div>
              </div>
              <div className="flex-1 p-2 space-y-2 bg-gray-50/30">
                {!isWork && <div className="text-xs text-center text-gray-400 py-4">No slots</div>}
                {slotList.map((slot, idx) => renderSlot(slot, idx))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderDayView = () => {
    const slotList = getDaySlots(currentDate);
    const dateStr = format(currentDate, "yyyy-MM-dd");
    const wDay = workingDays.find(wd => wd.date === dateStr);
    const isWork = wDay?.isWorking;

    return (
      <div
        className="flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-gray-200 overflow-auto"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Day header - tap to open settings */}
        <div
          onClick={() => handleDayClick(currentDate)}
          className={clsx(
            "p-4 border-b border-gray-100 text-center bg-white cursor-pointer hover:bg-gray-50 sticky top-0 z-10"
          )}
        >
          <div className="text-lg font-bold text-gray-900">{format(currentDate, "EEEE, MMMM d")}</div>
          <div className="mt-1 text-xs">
            {isWork ? (
              <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">Working</span>
            ) : (
              <span className="text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full font-medium">Off</span>
            )}
          </div>
        </div>

        <div className="p-3 space-y-3">
          {!isWork && <div className="text-sm text-center text-gray-400 py-8">No slots — tap header to set as working day</div>}
          {slotList.map((slot, idx) => renderSlot(slot, idx))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 h-full flex flex-col pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">Calendar</h1>
          {!isMobileDayView && <p className="mt-1 text-gray-500 text-sm">Manage availability and lessons. Drag lessons to reschedule.</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition min-h-[44px]"
          >
            Today
          </button>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setCurrentDate(isMobileDayView ? subDays(currentDate, 1) : addDays(currentDate, -7))}
              className="p-2 hover:bg-gray-100 rounded text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium px-3">
              {isMobileDayView
                ? format(currentDate, "MMM d, yyyy")
                : `${format(weekStart, "MMM d")} - ${format(addDays(weekStart, 6), "MMM d, yyyy")}`}
            </span>
            <button
              onClick={() => setCurrentDate(isMobileDayView ? addDays(currentDate, 1) : addDays(currentDate, 7))}
              className="p-2 hover:bg-gray-100 rounded text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar body */}
      {isMobileDayView ? renderDayView() : renderWeekView()}

      {/* Lesson detail — full screen on mobile, modal on desktop */}
      {selectedSlot && selectedSlot.lesson && (
        isMobileDayView ? (
          // Full-screen sheet on mobile
          <div className="fixed inset-0 bg-white z-50 flex flex-col overflow-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Lesson Details</h3>
              <button onClick={() => setSelectedSlot(null)} className="p-2 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 p-4 space-y-4 overflow-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Student</p>
                  <p className="font-medium text-gray-900">{selectedSlot.lesson.studentFirstName} {selectedSlot.lesson.studentLastName}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Time</p>
                  <p className="font-medium text-gray-900">{selectedSlot.time} - {selectedSlot.endTime}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Status</p>
                  <p className="font-medium">{selectedSlot.lesson.paid ? <span className="text-emerald-600">Paid</span> : <span className="text-amber-600">Unpaid</span>}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Amount</p>
                  <input
                    type="text"
                    value={selectedSlot.lesson.amount || ""}
                    onChange={(e) => setSelectedSlot({ ...selectedSlot, lesson: { ...selectedSlot.lesson!, amount: e.target.value } })}
                    placeholder="30"
                    className="w-full p-1.5 border rounded text-sm mt-0.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <select
                  value={selectedSlot.lesson.location || ""}
                  onChange={(e) => setSelectedSlot({ ...selectedSlot, lesson: { ...selectedSlot.lesson!, location: e.target.value } })}
                  className="w-full p-2.5 border rounded-lg text-sm mb-2 min-h-[44px]"
                >
                  <option value="">-- Custom location --</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.name}>{loc.name}{loc.address ? ` - ${loc.address}` : ""}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={selectedSlot.lesson.location || ""}
                  onChange={(e) => setSelectedSlot({ ...selectedSlot, lesson: { ...selectedSlot.lesson!, location: e.target.value } })}
                  placeholder="Or type custom location..."
                  className="w-full p-2.5 border rounded-lg text-sm min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
                <textarea
                  value={selectedSlot.lesson.notes || ""}
                  onChange={(e) => setSelectedSlot({ ...selectedSlot, lesson: { ...selectedSlot.lesson!, notes: e.target.value } })}
                  placeholder="How did the student do?"
                  className="w-full p-2.5 border rounded-lg text-sm"
                  rows={3}
                />
              </div>

              {/* Action buttons — stacked, big tap targets */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => {
                    handleUpdateLesson(selectedSlot.lesson!.id, selectedSlot.lesson!.notes || "", selectedSlot.lesson!.location || "", selectedSlot.lesson!.amount || "");
                    setSelectedSlot(null);
                  }}
                  className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg text-sm font-medium hover:bg-slate-900 transition min-h-[44px]"
                >
                  Save Details
                </button>

                {!selectedSlot.lesson.paid && (
                  <button
                    onClick={() => { handleMarkPaid(selectedSlot.lesson!.id, selectedSlot.lesson!.studentId); setSelectedSlot(null); }}
                    className="w-full bg-emerald-600 text-white px-4 py-3 rounded-lg text-sm font-medium hover:bg-emerald-700 transition min-h-[44px]"
                  >
                    Mark as Paid
                  </button>
                )}

                <button
                  onClick={() => {
                    setRescheduleLesson(selectedSlot.lesson!);
                    setRescheduleForm({ date: selectedSlot.lesson!.date, startTime: selectedSlot.time, endTime: selectedSlot.endTime });
                    setIsRescheduleOpen(true);
                  }}
                  className="w-full bg-blue-50 text-blue-600 px-4 py-3 rounded-lg text-sm font-medium hover:bg-blue-100 transition border border-blue-100 min-h-[44px]"
                >
                  Reschedule Lesson
                </button>

                <button
                  onClick={() => {
                    setCancelLesson(selectedSlot.lesson!);
                    setCancelReason("");
                    setIsCancelOpen(true);
                  }}
                  className="w-full bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm font-medium hover:bg-red-100 transition border border-red-100 min-h-[44px]"
                >
                  Cancel Lesson
                </button>
              </div>
            </div>
          </div>
        ) : (
          // Desktop modal (same as before)
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Lesson Details</h3>
              <div className="space-y-3 mb-6">
                <p><strong>Student:</strong> {selectedSlot.lesson.studentFirstName} {selectedSlot.lesson.studentLastName}</p>
                <p><strong>Time:</strong> {selectedSlot.time} - {selectedSlot.endTime}</p>
                <p><strong>Status:</strong> {selectedSlot.lesson.paid ? "Paid" : "Unpaid"}</p>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount (EUR)</label>
                  <input
                    type="text"
                    value={selectedSlot.lesson.amount || ""}
                    onChange={(e) => setSelectedSlot({ ...selectedSlot, lesson: { ...selectedSlot.lesson!, amount: e.target.value } })}
                    placeholder="30"
                    className="w-full p-2 border rounded text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                  <select
                    value={selectedSlot.lesson.location || ""}
                    onChange={(e) => setSelectedSlot({ ...selectedSlot, lesson: { ...selectedSlot.lesson!, location: e.target.value } })}
                    className="w-full p-2 border rounded text-sm mb-1"
                  >
                    <option value="">-- Custom location --</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.name}>{loc.name}{loc.address ? ` - ${loc.address}` : ""}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={selectedSlot.lesson.location || ""}
                    onChange={(e) => setSelectedSlot({ ...selectedSlot, lesson: { ...selectedSlot.lesson!, location: e.target.value } })}
                    placeholder="Or type custom location..."
                    className="w-full p-2 border rounded text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Instructor Comments</label>
                  <textarea
                    value={selectedSlot.lesson.notes || ""}
                    onChange={(e) => setSelectedSlot({ ...selectedSlot, lesson: { ...selectedSlot.lesson!, notes: e.target.value } })}
                    placeholder="How did the student do?"
                    className="w-full p-2 border rounded text-sm"
                    rows={3}
                  />
                </div>
                <button
                  onClick={() => {
                    handleUpdateLesson(selectedSlot.lesson!.id, selectedSlot.lesson!.notes || "", selectedSlot.lesson!.location || "", selectedSlot.lesson!.amount || "");
                    setSelectedSlot(null);
                  }}
                  className="w-full text-xs bg-slate-800 text-white px-2 py-2 rounded hover:bg-slate-900 transition-colors"
                >
                  Save Lesson Details
                </button>
              </div>

              {!selectedSlot.lesson.paid && (
                <button
                  onClick={() => { handleMarkPaid(selectedSlot.lesson!.id, selectedSlot.lesson!.studentId); setSelectedSlot(null); }}
                  className="w-full bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 transition"
                >
                  Mark as Paid
                </button>
              )}

              <button
                onClick={() => {
                  setRescheduleLesson(selectedSlot.lesson!);
                  setRescheduleForm({ date: selectedSlot.lesson!.date, startTime: selectedSlot.time, endTime: selectedSlot.endTime });
                  setIsRescheduleOpen(true);
                }}
                className="w-full mt-2 bg-blue-50 text-blue-600 px-4 py-2 rounded hover:bg-blue-100 transition text-sm font-medium border border-blue-100"
              >
                Reschedule Lesson
              </button>

              <button
                onClick={() => {
                  setCancelLesson(selectedSlot.lesson!);
                  setCancelReason("");
                  setIsCancelOpen(true);
                }}
                className="w-full mt-2 bg-red-50 text-red-600 px-4 py-2 rounded hover:bg-red-100 transition text-sm font-medium border border-red-100"
              >
                Cancel Lesson
              </button>

              <button onClick={() => setSelectedSlot(null)} className="w-full mt-2 text-gray-600 hover:text-gray-900">
                Close
              </button>
            </div>
          </div>
        )
      )}

      {/* Reschedule modal */}
      {isRescheduleOpen && rescheduleLesson && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl md:rounded-xl shadow-lg w-full md:max-w-md md:p-6 p-4 pb-safe max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Reschedule Lesson</h3>
            <p className="text-sm text-gray-500 mb-4">
              Current: {rescheduleLesson.date} {rescheduleLesson.startTime}-{rescheduleLesson.endTime}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Date</label>
                <input type="date" value={rescheduleForm.date} onChange={(e) => setRescheduleForm({ ...rescheduleForm, date: e.target.value })} className="w-full p-2.5 border rounded-lg text-sm min-h-[44px]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                  <input type="time" value={rescheduleForm.startTime} onChange={(e) => setRescheduleForm({ ...rescheduleForm, startTime: e.target.value })} className="w-full p-2.5 border rounded-lg text-sm min-h-[44px]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                  <input type="time" value={rescheduleForm.endTime} onChange={(e) => setRescheduleForm({ ...rescheduleForm, endTime: e.target.value })} className="w-full p-2.5 border rounded-lg text-sm min-h-[44px]" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setIsRescheduleOpen(false); setRescheduleLesson(null); }} className="flex-1 px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-900 min-h-[44px]">Cancel</button>
              <button onClick={handleReschedule} className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg text-sm font-medium hover:bg-blue-700 transition min-h-[44px]">Reschedule</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {isCancelOpen && cancelLesson && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl md:rounded-xl shadow-lg w-full md:max-w-sm md:p-6 p-4 pb-safe">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Cancel Lesson</h3>
            <p className="text-sm text-gray-500 mb-4">
              {cancelLesson.date} {cancelLesson.startTime}-{cancelLesson.endTime} with {cancelLesson.studentFirstName} {cancelLesson.studentLastName}
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Why is the lesson being cancelled?"
                className="w-full p-2.5 border rounded-lg text-sm"
                rows={3}
                autoFocus
              />
            </div>
            <p className="text-xs text-gray-400 mb-4">The student will receive a message about this cancellation.</p>
            <div className="flex gap-3">
              <button onClick={() => { setIsCancelOpen(false); setCancelLesson(null); }} className="flex-1 px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-900 min-h-[44px]">Go Back</button>
              <button
                onClick={async () => {
                  const res = await fetch(`/api/calendar/cancel-lesson/${cancelLesson.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ reason: cancelReason || undefined })
                  });
                  if (res.ok) { setIsCancelOpen(false); setCancelLesson(null); setSelectedSlot(null); fetchCalendarData(); }
                  else { const data = await res.json(); alert(data.error || "Failed to cancel lesson"); }
                }}
                className="flex-1 bg-red-600 text-white px-4 py-3 rounded-lg text-sm font-medium hover:bg-red-700 transition flex items-center justify-center gap-2 min-h-[44px]"
              >
                <XCircle className="w-4 h-4" /> Cancel Lesson
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {isSettingsOpen && editingDate && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl md:rounded-xl shadow-lg w-full md:max-w-sm md:p-6 p-4 pb-safe">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Availability for {format(editingDate, "MMM d, yyyy")}</h2>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="flex items-center gap-3">
                <input type="checkbox" id="isWorking" checked={settingsForm.isWorking} onChange={(e) => setSettingsForm({ ...settingsForm, isWorking: e.target.checked })} className="w-5 h-5 text-emerald-600 rounded border-gray-300" />
                <label htmlFor="isWorking" className="text-sm font-medium text-gray-700">Working Day</label>
              </div>
              {settingsForm.isWorking && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Start Time</label>
                      <input type="time" value={settingsForm.startTime} onChange={(e) => setSettingsForm({ ...settingsForm, startTime: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm min-h-[44px]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">End Time</label>
                      <input type="time" value={settingsForm.endTime} onChange={(e) => setSettingsForm({ ...settingsForm, endTime: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm min-h-[44px]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Slot Duration (min)</label>
                    <select value={settingsForm.slotDurationMin} onChange={(e) => setSettingsForm({ ...settingsForm, slotDurationMin: parseInt(e.target.value) })} className="w-full px-3 py-2.5 border rounded-lg text-sm min-h-[44px]">
                      <option value="45">45 min</option>
                      <option value="60">60 min</option>
                      <option value="90">90 min</option>
                      <option value="120">120 min</option>
                    </select>
                  </div>
                </>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsSettingsOpen(false)} className="flex-1 px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-900 min-h-[44px]">Cancel</button>
                <button type="submit" className="flex-1 bg-emerald-600 text-white px-4 py-3 rounded-lg text-sm font-medium hover:bg-emerald-700 transition min-h-[44px]">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
