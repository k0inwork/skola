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
}

interface Slot {
  time: string;
  endTime: string;
  date: string;
  isAvailable: boolean;
  lesson?: BookedLesson;
}

export function StudentCalendar() {
  const { token } = useAuthStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedInstructor, setSelectedInstructor] = useState("");
  
  const [workingDays, setWorkingDays] = useState<WorkingDay[]>([]);
  const [bookedLessons, setBookedLessons] = useState<BookedLesson[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<Slot | null>(null);

  useEffect(() => {
    fetch("/api/users")
      .then(r => r.json())
      .then(data => {
        const insts = data.filter((u: any) => u.role === "instructor" || u.role === "admin");
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
    
    // Always generate 6 slots
    const slots: Slot[] = [];
    const baseDate = startOfDay(date);
    
    // Default hours if no workingDay
    const startH = workingDay ? Number(workingDay.startTime.split(":")[0]) : 9;
    const startM = workingDay ? Number(workingDay.startTime.split(":")[1]) : 0;
    const slotDuration = workingDay ? workingDay.slotDurationMin : 60;
    
    let current = addMinutes(baseDate, startH * 60 + startM);

    for (let i = 0; i < 6; i++) {
        const timeStr = format(current, "HH:mm");
        const nextTime = addMinutes(current, slotDuration);
        const endTimeStr = format(nextTime, "HH:mm");
        
        const isAvailable = workingDay?.isWorking !== false && !bookedLessons.find(l => l.date === dateStr && l.startTime < endTimeStr && l.endTime > timeStr);
        const lesson = bookedLessons.find(l => l.date === dateStr && l.startTime < endTimeStr && l.endTime > timeStr);

        slots.push({
            date: dateStr,
            time: timeStr,
            endTime: endTimeStr,
            isAvailable: isAvailable,
            lesson
        });
        
        current = nextTime;
    }
    return slots;
  };

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const handleSlotClick = (slot: Slot) => {
    if (!slot.isAvailable) return;
    setBookingSlot(slot);
    setIsBookingOpen(true);
  };

  const handleBookSlot = async () => {
    if (!bookingSlot) return;
    console.log("Booking slot:", bookingSlot);
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
      console.log("Response:", res.status, res.statusText);
      if (res.ok) {
        setIsBookingOpen(false);
        fetchCalendarData();
      } else {
        const body = await res.json();
        console.error("Booking error body:", body);
        alert(body.error || "Booking failed");
      }
    } catch (err) {
      console.error("Booking catch error:", err);
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col pb-8">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Book Lessons</h1>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
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

      {/* Grid of slots */}
      <div className="flex-1 overflow-auto bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="grid grid-cols-7 min-w-[800px] divide-x divide-gray-100 min-h-full">
          {weekDays.map((d, i) => {
            const slotList = getDaySlots(d);
            return (
              <div key={i} className="flex flex-col p-2 gap-2">
                 <div className="text-sm font-medium text-center p-2 border-b border-gray-100">{format(d, "EEE d")}</div>
                 {slotList.map((slot, idx) => (
                    <button 
                      key={idx}
                      disabled={!slot.isAvailable}
                      onClick={() => handleSlotClick(slot)}
                      className={clsx(
                        "p-2 text-xs rounded-lg text-left",
                        slot.isAvailable ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-800" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      )}
                    >
                      {slot.time} {slot.isAvailable ? "Book" : "Taken"}
                    </button>
                 ))}
              </div>
            )
          })}
        </div>
      </div>
      
      {isBookingOpen && bookingSlot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6 relative">
             Confirm booking?
             <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setIsBookingOpen(false)}>Cancel</button>
                <button onClick={handleBookSlot} className="bg-blue-600 text-white px-3 py-1 rounded">Confirm</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
