import React, { useState, useEffect, FormEvent } from "react";
import { format, addDays, startOfWeek, isSameDay, parseISO, isAfter, isBefore, addMinutes, startOfDay } from "date-fns";
import { useAuthStore } from "../lib/store";
import { ChevronLeft, ChevronRight, User as UserIcon, CheckCircle2, MapPin, GripVertical } from "lucide-react";
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
    // Fetch locations
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

    return () => {
      socket.disconnect();
    };
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

    const isOff = !workingDay || !workingDay.isWorking;

    const slots: Slot[] = [];
    const baseDate = startOfDay(date);

    const startTimeStr = isOff ? "09:00" : workingDay!.startTime;
    const endTimeStr = isOff ? "18:00" : workingDay!.endTime;
    const duration = isOff ? 90 : workingDay!.slotDurationMin;

    const [startH, startM] = startTimeStr.split(":").map(Number);
    const [endH, endM] = endTimeStr.split(":").map(Number);

    let current = addMinutes(baseDate, startH * 60 + startM);
    const end = addMinutes(baseDate, endH * 60 + endM);

    let slotsCount = 0;
    while ((isBefore(current, end) || current.getTime() === end.getTime()) && (isOff ? slotsCount < 6 : true)) {
      const timeStr = format(current, "HH:mm");
      const nextTime = addMinutes(current, duration);
      const endSlotTime = format(nextTime, "HH:mm");

      if (isAfter(nextTime, end)) break;

      const lesson = bookedLessons.find(l => l.date === dateStr && l.startTime < endSlotTime && l.endTime > timeStr);

      slots.push({
        date: dateStr,
        time: timeStr,
        endTime: endSlotTime,
        isAvailable: !lesson,
        lesson
      });

      current = nextTime;
      slotsCount++;
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
  };

  const handleSaveSettings = async (e: FormEvent) => {
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

  const handleMarkPaid = async (lessonId: string, studentId: string | null) => {
    if (!studentId) return;
    try {
      const res = await fetch("/api/calendar/mark-lesson-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lessonId, studentId })
      });
      if (res.ok) {
        fetchCalendarData();
      } else {
        alert("Failed to mark as paid");
      }
    } catch (err) {
      console.error(err);
      alert("Error marking as paid");
    }
  };

  const handleUpdateLesson = async (lessonId: string, notes: string, location: string, amount: string) => {
    try {
      const res = await fetch(`/api/calendar/update-lesson/${lessonId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes, location, amount })
      });
      if (res.ok) {
        fetchCalendarData();
      } else {
        alert("Failed to update lesson");
      }
    } catch (err) {
      console.error(err);
      alert("Error updating lesson");
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleLesson) return;
    try {
      const res = await fetch(`/api/calendar/reschedule-lesson/${rescheduleLesson.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(rescheduleForm)
      });
      if (res.ok) {
        setIsRescheduleOpen(false);
        setRescheduleLesson(null);
        setSelectedSlot(null);
        fetchCalendarData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to reschedule");
      }
    } catch (err) {
      console.error(err);
      alert("Error rescheduling lesson");
    }
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

    // Don't drop on occupied slots
    if (!targetSlot.isAvailable) {
      alert("This slot is already booked");
      return;
    }

    // Don't drop on same slot
    if (draggedLesson.date === targetSlot.date && draggedLesson.startTime === targetSlot.time) {
      return;
    }

    try {
      const res = await fetch(`/api/calendar/reschedule-lesson/${draggedLesson.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          date: targetSlot.date,
          startTime: targetSlot.time,
          endTime: targetSlot.endTime,
        })
      });
      if (res.ok) {
        fetchCalendarData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to reschedule");
      }
    } catch (err) {
      console.error(err);
      alert("Error rescheduling");
    }
    setDraggedLesson(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  // Generate available slots for reschedule dropdown (next 14 days)
  const getRescheduleSlots = () => {
    const slots: { date: string; time: string; endTime: string }[] = [];
    const today = new Date();
    for (let d = 0; d < 14; d++) {
      const date = addDays(today, d);
      const dateStr = format(date, "yyyy-MM-dd");
      const workingDay = workingDays.find(wd => wd.date === dateStr);
      if (!workingDay?.isWorking) continue;

      const [startH, startM] = workingDay.startTime.split(":").map(Number);
      const [endH, endM] = workingDay.endTime.split(":").map(Number);
      const baseDate = startOfDay(date);
      let current = addMinutes(baseDate, startH * 60 + startM);
      const end = addMinutes(baseDate, endH * 60 + endM);

      while (isBefore(current, end) || current.getTime() === end.getTime()) {
        const timeStr = format(current, "HH:mm");
        const nextTime = addMinutes(current, workingDay.slotDurationMin);
        const endSlotTime = format(nextTime, "HH:mm");
        if (isAfter(nextTime, end)) break;

        // Check not occupied
        const occupied = bookedLessons.some(l =>
          l.date === dateStr && l.startTime < endSlotTime && l.endTime > timeStr &&
          (!rescheduleLesson || l.id !== rescheduleLesson.id)
        );
        if (!occupied) {
          slots.push({ date: dateStr, time: timeStr, endTime: endSlotTime });
        }
        current = nextTime;
      }
    }
    return slots;
  };

  return (
    <div className="space-y-6 h-full flex flex-col pb-8">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Instructor Calendar</h1>
          <p className="mt-1 text-gray-500">Manage availability and lessons. Drag lessons to reschedule.</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-sm transition"
            >
              Today
            </button>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-md p-1 shadow-sm">
              <button onClick={() => setCurrentDate(addDays(currentDate, -7))} className="p-1 hover:bg-gray-100 rounded text-gray-600">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-medium px-4">
                {format(weekStart, "MMM d")} - {format(addDays(weekStart, 6), "MMM d, yyyy")}
              </span>
              <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="p-1 hover:bg-gray-100 rounded text-gray-600">
                <ChevronRight className="w-5 h-5" />
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
                    "p-4 border-b border-gray-100 text-center sticky top-0 bg-white z-10 cursor-pointer hover:bg-gray-50",
                    isToday ? "text-blue-600" : "text-gray-900"
                  )}
                >
                  <div className="text-sm font-medium">{format(d, "EEE")}</div>
                  <div className={clsx("text-2xl font-light mt-1", isToday && "font-semibold")}>
                    {format(d, "d")}
                  </div>
                  <div className="mt-2 text-xs">
                    {isWork ? (
                      <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">Working</span>
                    ) : (
                      <span className="text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full font-medium">Off</span>
                    )}
                  </div>
                </div>

                <div className="flex-1 p-2 space-y-2 bg-gray-50/30">
                  {!isWork && (
                    <div className="text-xs text-center text-gray-400 py-4">No slots</div>
                  )}
                  {slotList.map((slot, idx) => (
                    <div
                      key={idx}
                      draggable={!!slot.lesson}
                      onDragStart={(e) => slot.lesson && handleDragStart(e, slot.lesson)}
                      onDrop={(e) => handleDrop(e, slot)}
                      onDragOver={handleDragOver}
                      onClick={() => slot.lesson && setSelectedSlot(slot)}
                      className={clsx(
                        "p-2.5 text-xs rounded-lg transition-all duration-200 relative group overflow-hidden border",
                        slot.isAvailable
                          ? draggedLesson
                            ? "bg-white shadow-sm border-dashed border-blue-300 cursor-drop hover:border-blue-400 hover:bg-blue-50/30"
                            : "bg-white shadow-sm border-gray-200 cursor-default"
                          : "bg-gray-50 border-gray-100 shadow-sm opacity-90 cursor-pointer hover:bg-gray-100",
                        slot.lesson && "cursor-grab active:cursor-grabbing"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={clsx(
                          "w-2.5 h-2.5 rounded-full shadow-sm shrink-0",
                          slot.isAvailable ? "bg-emerald-500 shadow-emerald-500/40" : "bg-gray-800 shadow-gray-900/40"
                        )} />
                        <span className={clsx("font-semibold", slot.isAvailable ? "text-gray-900" : "text-gray-500 line-through decoration-gray-300")}>
                          {slot.time} - {slot.endTime}
                        </span>
                        {slot.lesson && (
                          <GripVertical className="w-3 h-3 text-gray-400 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>

                      {!slot.isAvailable && slot.lesson && (
                        <div className="mt-2 flex flex-col gap-1 text-gray-700 ml-4 bg-white rounded p-2 border border-blue-100 shadow-sm">
                          <div className="flex items-center gap-1.5 font-medium text-gray-900">
                            <UserIcon className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                            <span className="truncate">{slot.lesson.studentFirstName} {slot.lesson.studentLastName}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {slot.lesson.paid && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            {slot.lesson.amount && <span className="text-[10px] text-gray-500">{slot.lesson.amount} EUR</span>}
                            {slot.lesson.location && (
                              <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                                <MapPin className="w-2.5 h-2.5" />{slot.lesson.location}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lesson detail modal */}
      {selectedSlot && selectedSlot.lesson && (
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
                onClick={() => {
                  handleMarkPaid(selectedSlot.lesson!.id, selectedSlot.lesson!.studentId);
                  setSelectedSlot(null);
                }}
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
              onClick={async () => {
                if (confirm("Are you sure you want to cancel this lesson?")) {
                  const res = await fetch(`/api/calendar/cancel-lesson/${selectedSlot.lesson!.id}`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` }
                  });
                  if (res.ok) setSelectedSlot(null);
                  else alert("Failed to cancel lesson");
                }
              }}
              className="w-full mt-2 bg-red-50 text-red-600 px-4 py-2 rounded hover:bg-red-100 transition text-sm font-medium border border-red-100"
            >
              Cancel Lesson
            </button>

            <button
              onClick={() => setSelectedSlot(null)}
              className="w-full mt-2 text-gray-600 hover:text-gray-900"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Reschedule modal */}
      {isRescheduleOpen && rescheduleLesson && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Reschedule Lesson</h3>
            <p className="text-sm text-gray-500 mb-4">
              Current: {rescheduleLesson.date} {rescheduleLesson.startTime}-{rescheduleLesson.endTime}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">New Date</label>
                <input
                  type="date"
                  value={rescheduleForm.date}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, date: e.target.value })}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={rescheduleForm.startTime}
                    onChange={(e) => setRescheduleForm({ ...rescheduleForm, startTime: e.target.value })}
                    className="w-full p-2 border rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">End Time</label>
                  <input
                    type="time"
                    value={rescheduleForm.endTime}
                    onChange={(e) => setRescheduleForm({ ...rescheduleForm, endTime: e.target.value })}
                    className="w-full p-2 border rounded text-sm"
                  />
                </div>
              </div>

              <p className="text-xs text-gray-400">Tip: You can also drag and drop lessons directly on the calendar.</p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setIsRescheduleOpen(false); setRescheduleLesson(null); }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleReschedule}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && editingDate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6 relative">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Availability for {format(editingDate, "MMM d, yyyy")}</h2>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isWorking"
                  checked={settingsForm.isWorking}
                  onChange={(e) => setSettingsForm({ ...settingsForm, isWorking: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                />
                <label htmlFor="isWorking" className="text-sm font-medium text-gray-700">Working Day</label>
              </div>

              {settingsForm.isWorking && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Start Time</label>
                      <input
                        type="time"
                        value={settingsForm.startTime}
                        onChange={(e) => setSettingsForm({ ...settingsForm, startTime: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">End Time</label>
                      <input
                        type="time"
                        value={settingsForm.endTime}
                        onChange={(e) => setSettingsForm({ ...settingsForm, endTime: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Slot Duration (min)</label>
                    <select
                      value={settingsForm.slotDurationMin}
                      onChange={(e) => setSettingsForm({ ...settingsForm, slotDurationMin: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="45">45 min</option>
                      <option value="60">60 min</option>
                      <option value="90">90 min</option>
                      <option value="120">120 min</option>
                    </select>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
