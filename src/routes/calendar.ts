import { Router } from "express";
import { eq, and, gte, lte, inArray, desc, isNull, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { instructorWorkingDays, lessons, users, students, enrollments, slots, instructorWorkingDayCities } from "../db/schema.js";
import { locations } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { validate, bookSlotSchema, rescheduleSchema, respondRescheduleSchema, cancelLessonSchema, updateLessonSchema, moveSlotSchema, workingDaySchema, copyWeekSchema, createLocationSchema } from "../lib/validation.js";
import { sendNewMessageEmail, sendLocationChangedEmail } from "../lib/mail.js";

const router = Router();

// Tile proxy for Leaflet maps (no auth needed)
router.get("/tiles/:z/:x/:y", async (req, res) => {
  try {
    const { z, x, y } = req.params;
    const tileRes = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
      headers: { "User-Agent": "OlainesAutoskola/1.0" },
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    const buf = Buffer.from(await tileRes.arrayBuffer());
    res.send(buf);
  } catch {
    res.status(500).send("Tile fetch failed");
  }
});

router.use(requireAuth);

// --- Helpers ---

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Broadcast a calendar_update. Includes senderId so each client can skip
 * the notification badge bump when the action originated from itself
 * (avoids the instructor's own edits incrementing their own bell).
 */
function emitCalendarUpdate(io: any, req: any, payload: Record<string, unknown>) {
  if (!io) return;
  io.emit("calendar_update", { ...payload, senderId: req.userId });
}


// --- Slot generation helper ---

async function generateSlotsForDay(instructorId: string, date: string) {
  // Get working day config
  const [workingDay] = await db.select().from(instructorWorkingDays).where(and(
    eq(instructorWorkingDays.instructorId, instructorId),
    eq(instructorWorkingDays.date, date),
    eq(instructorWorkingDays.isWorking, true)
  )).limit(1);

  if (!workingDay || !workingDay.startTime || !workingDay.endTime) {
    // Not a working day — delete all unbooked slots for this day
    await db.delete(slots).where(and(
      eq(slots.instructorId, instructorId),
      eq(slots.date, date),
      isNull(slots.lessonId),
      eq(slots.isBooked, false)
    ));
    return;
  }

  // Resolve the day's ordered cities (child table first, fall back to scalar cache)
  const cityRows = await db.select().from(instructorWorkingDayCities)
    .where(eq(instructorWorkingDayCities.workingDayId, workingDay.id))
    .orderBy(instructorWorkingDayCities.position);
  const dayCities = cityRows.length > 0
    ? cityRows.map(r => r.city)
    : (workingDay.city ? [workingDay.city] : []);
  const defaultCity = dayCities[0] || null;

  const slotDuration = workingDay.slotDurationMin || 90;
  const [startH, startM] = workingDay.startTime.split(":").map(Number);
  const [endH, endM] = workingDay.endTime.split(":").map(Number);
  const workStartMin = startH * 60 + startM;
  const workEndMin = endH * 60 + endM;

  // Load existing unbooked slots for this day keyed by startTime (preserve city/location)
  const existingUnbooked = await db.select().from(slots).where(and(
    eq(slots.instructorId, instructorId),
    eq(slots.date, date),
    isNull(slots.lessonId),
    eq(slots.isBooked, false)
  ));
  const existingByStart = new Map(existingUnbooked.map(s => [s.startTime, s]));

  // Build the set of generated start times
  const generatedStarts = new Set<string>();
  for (let mins = workStartMin; mins + slotDuration <= workEndMin; mins += slotDuration) {
    const sH = String(Math.floor(mins / 60)).padStart(2, "0");
    const sM = String(mins % 60).padStart(2, "0");
    const eMin = mins + slotDuration;
    const eH = String(Math.floor(eMin / 60)).padStart(2, "0");
    const eM = String(eMin % 60).padStart(2, "0");
    const startTime = `${sH}:${sM}`;
    const endTime = `${eH}:${eM}`;
    generatedStarts.add(startTime);

    const existing = existingByStart.get(startTime);
    if (existing) {
      // Keep the existing row as-is — instructor's per-slot city/location overrides survive
      continue;
    }

    await db.insert(slots).values({
      instructorId,
      date,
      startTime,
      endTime,
      isBooked: false,
      city: defaultCity,
      location: null,
    });
  }

  // Delete unbooked slots whose startTime is no longer in the generated set
  const orphans = existingUnbooked.filter(s => !generatedStarts.has(s.startTime));
  for (const orphan of orphans) {
    await db.delete(slots).where(eq(slots.id, orphan.id));
  }
}

// --- Routes ---

// Get working days for a month (by start and end dates)
router.get("/working-days", async (req, res) => {
  try {
    const { startDate, endDate, instructorId } = req.query as Record<string, string>;
    if (!startDate || !endDate || !instructorId) {
      res.status(400).json({ error: "Missing required parameters" });
      return;
    }

    const workingDays = await db.select()
      .from(instructorWorkingDays)
      .where(and(
        eq(instructorWorkingDays.instructorId, instructorId),
        gte(instructorWorkingDays.date, startDate),
        lte(instructorWorkingDays.date, endDate)
      ));

    res.json(workingDays);
  } catch (err) {
    console.error("Get working days error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Upsert working day — regenerates slots for that day
router.post("/working-days", validate(workingDaySchema), async (req, res) => {
  try {
    const { instructorId, date, isWorking, startTime, endTime, location, vehicle } = req.body;
    // cities[] is the new multi-city list. Legacy scalar `city` (if the client still
    // sends one) is merged in only when cities is absent.
    const rawCities: string[] | undefined = req.body.cities;
    const legacyCity: string | undefined = req.body.city;
    const cities = Array.isArray(rawCities) && rawCities.length > 0
      ? rawCities.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      : (legacyCity ? [legacyCity] : []);
    const slotDurationMin = req.body.slotDurationMin || 90;
    const primaryCity = cities[0] || null;

    if (req.userRole !== "admin" && req.userRole !== "instructor") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const existing = await db.select().from(instructorWorkingDays).where(and(
      eq(instructorWorkingDays.instructorId, instructorId),
      eq(instructorWorkingDays.date, date)
    ));

    const dayData = { isWorking, startTime, endTime, slotDurationMin, location: location || null, vehicle: vehicle || null, city: primaryCity };

    let workingDayId: string;
    if (existing.length > 0) {
      await db.update(instructorWorkingDays)
        .set(dayData)
        .where(eq(instructorWorkingDays.id, existing[0].id));
      workingDayId = existing[0].id;
    } else {
      const [inserted] = await db.insert(instructorWorkingDays).values({
        instructorId, date, ...dayData
      }).returning();
      workingDayId = inserted.id;
    }

    // Sync the child cities table: load old list, compute diff, replace rows, auto-reassign.
    const oldCityRows = await db.select().from(instructorWorkingDayCities)
      .where(eq(instructorWorkingDayCities.workingDayId, workingDayId))
      .orderBy(instructorWorkingDayCities.position);
    const oldCities = oldCityRows.map(r => r.city);
    const newCitySet = new Set(cities);
    const removed = oldCities.filter(c => !newCitySet.has(c));

    let moved = 0;
    const movedTo = primaryCity;
    if (removed.length > 0 && primaryCity) {
      // Reassign all slots (empty + booked) using a removed city to the new primary
      const movedSlots = await db.update(slots)
        .set({ city: primaryCity })
        .where(and(
          eq(slots.instructorId, instructorId),
          eq(slots.date, date),
          inArray(slots.city, removed)
        ))
        .returning({ id: slots.id });
      moved += movedSlots.length;

      // Reassign booked lessons' city too (keep their location — decision #4)
      const movedLessons = await db.update(lessons)
        .set({ city: primaryCity })
        .where(and(
          eq(lessons.instructorId, instructorId),
          eq(lessons.date, date),
          inArray(lessons.city, removed)
        ))
        .returning({ id: lessons.id });
      moved += movedLessons.length;
    }

    // Replace child-table rows with the new ordered list
    await db.delete(instructorWorkingDayCities)
      .where(eq(instructorWorkingDayCities.workingDayId, workingDayId));
    if (cities.length > 0) {
      await db.insert(instructorWorkingDayCities).values(
        cities.map((city, position) => ({ workingDayId, city, position }))
      );
    }

    // Regenerate slots for this day (preserves per-slot city via upsert)
    await generateSlotsForDay(instructorId, date);

    const io = req.app.get("io");
    if (io) {
      emitCalendarUpdate(io, req, { instructorId, date });
    }

    res.json({ success: true, moved, movedTo });
  } catch (err) {
    console.error("Upsert working days error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get slots for a date range — returns generated slots with booking info
router.get("/slots", async (req, res) => {
  try {
    const { startDate, endDate, instructorId } = req.query as Record<string, string>;

    // Get working days in range
    const workingDays = await db.select()
      .from(instructorWorkingDays)
      .where(and(
        eq(instructorWorkingDays.instructorId, instructorId),
        gte(instructorWorkingDays.date, startDate),
        lte(instructorWorkingDays.date, endDate)
      ));

    // Fetch ordered cities per working day in range (one query, grouped in JS)
    const dayIds = workingDays.map(wd => wd.id);
    const cityRows = dayIds.length > 0
      ? await db.select({
          workingDayId: instructorWorkingDayCities.workingDayId,
          city: instructorWorkingDayCities.city,
          position: instructorWorkingDayCities.position,
        })
          .from(instructorWorkingDayCities)
          .where(inArray(instructorWorkingDayCities.workingDayId, dayIds))
          .orderBy(instructorWorkingDayCities.workingDayId, instructorWorkingDayCities.position)
      : [];
    const citiesByDayId = new Map<string, string[]>();
    for (const r of cityRows) {
      const arr = citiesByDayId.get(r.workingDayId) ?? [];
      arr.push(r.city);
      citiesByDayId.set(r.workingDayId, arr);
    }
    const workingDaysWithCities = workingDays.map(wd => ({
      ...wd,
      cities: citiesByDayId.get(wd.id) ?? (wd.city ? [wd.city] : []),
    }));

    // Get slots with optional lesson info
    const slotRows = await db.select({
      id: slots.id,
      date: slots.date,
      startTime: slots.startTime,
      endTime: slots.endTime,
      isBooked: slots.isBooked,
      lessonId: slots.lessonId,
      slotCity: slots.city,
      slotLocation: slots.location,
      // lesson fields (via join)
      lessonStudentId: lessons.studentId,
      lessonStatus: lessons.status,
      lessonPaid: lessons.paid,
      lessonAmount: lessons.amount,
      lessonNotes: lessons.notes,
      lessonLocation: lessons.location,
      lessonCity: lessons.city,
      lessonProposedDate: lessons.proposedDate,
      lessonProposedStartTime: lessons.proposedStartTime,
      lessonProposedEndTime: lessons.proposedEndTime,
      lessonCreatedAt: lessons.createdAt,
      // student fields
      studentFirstName: students.firstName,
      studentLastName: students.lastName,
      studentEmail: students.email,
      studentPhone: students.phone,
    })
      .from(slots)
      .leftJoin(lessons, eq(slots.lessonId, lessons.id))
      .leftJoin(students, eq(lessons.studentId, students.id))
      .where(and(
        eq(slots.instructorId, instructorId),
        gte(slots.date, startDate),
        lte(slots.date, endDate)
      ))
      .orderBy(slots.date, slots.startTime);

    const userStudentId = req.userRole === "client"
      ? (await db.select().from(students).where(eq(students.userId, req.userId)))[0]?.id
      : null;

    // Shape response
    const result = slotRows.map(s => {
      const isMine = req.userRole === "client" ? s.lessonStudentId === userStudentId : undefined;
      const hideDetails = req.userRole === "client" && s.lessonStudentId && s.lessonStudentId !== userStudentId;

      return {
        id: s.id,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        isBooked: s.isBooked,
        city: s.slotCity,
        location: s.slotLocation,
        lesson: s.lessonId ? {
          id: s.lessonId,
          status: s.lessonStatus,
          paid: s.lessonPaid,
          amount: s.lessonAmount,
          notes: hideDetails ? null : s.lessonNotes,
          location: hideDetails ? null : s.lessonLocation,
          city: hideDetails ? null : s.lessonCity,
          proposedDate: s.lessonProposedDate,
          proposedStartTime: s.lessonProposedStartTime,
          proposedEndTime: s.lessonProposedEndTime,
          createdAt: s.lessonCreatedAt,
          studentId: hideDetails ? null : s.lessonStudentId,
          studentFirstName: hideDetails ? "Student" : s.studentFirstName,
          studentLastName: hideDetails ? "" : s.studentLastName,
          studentEmail: hideDetails ? null : s.studentEmail,
          studentPhone: hideDetails ? null : s.studentPhone,
          isMine,
        } : null,
      };
    });

    res.json({ workingDays: workingDaysWithCities, slots: result });
  } catch (err) {
    console.error("Get slots error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Book a slot by slotId
router.post("/book", validate(bookSlotSchema), async (req, res) => {
  try {
    let { slotId, enrollmentId, studentId, instructorId, durationMin } = req.body;

    if (!slotId) {
      res.status(400).json({ error: "slotId is required" });
      return;
    }

    // Fetch the slot
    const [slot] = await db.select().from(slots).where(eq(slots.id, slotId)).limit(1);
    if (!slot) {
      res.status(404).json({ error: "Slot not found" });
      return;
    }
    if (slot.isBooked) {
      res.status(409).json({ error: "Slot is already booked." });
      return;
    }

    // Atomically claim the slot — prevents double-booking race condition
    const claimed = await db.update(slots)
      .set({ isBooked: true })
      .where(and(eq(slots.id, slotId), eq(slots.isBooked, false)))
      .returning();
    if (!claimed.length) {
      res.status(409).json({ error: "Slot was just booked by someone else." });
      return;
    }

    instructorId = slot.instructorId;

    if (req.userRole === "client") {
      const [student] = await db.select().from(students).where(eq(students.userId, req.userId));
      if (!student) {
        res.status(400).json({ error: "Student profile not found for this user." });
        return;
      }
      if (student.status === "blocked") {
        res.status(403).json({ error: "Your account has been restricted. Please contact your instructor." });
        return;
      }
      studentId = student.id;

      // Unpaid students can only book 1 lesson at a time
      const paidLessons = await db.select({ id: lessons.id }).from(lessons).where(
        and(eq(lessons.studentId, studentId), eq(lessons.paid, true))
      ).limit(1);
      if (paidLessons.length === 0) {
        const activeBookings = await db.select({ id: slots.id }).from(slots)
          .leftJoin(lessons, eq(slots.lessonId, lessons.id))
          .where(and(
            eq(lessons.studentId, studentId),
            eq(slots.isBooked, true),
            ne(lessons.status, "canceled")
          ));
        if (activeBookings.length >= 1) {
          res.status(403).json({ error: "You can only book 1 lesson at a time until your first lesson is paid." });
          return;
        }
      }
    } else if (!studentId) {
      let [firstStudent] = await db.select().from(students).limit(1);
      if (!firstStudent) {
        const [inserted] = await db.insert(students).values({
          firstName: "Demo",
          lastName: "Student",
          email: "demo@example.com",
        }).returning();
        firstStudent = inserted;
      }
      studentId = firstStudent.id;
    }

    if (!enrollmentId) {
      const [existingEnrollment] = await db.select().from(enrollments).where(eq(enrollments.studentId, studentId)).limit(1);
      if (existingEnrollment) {
        enrollmentId = existingEnrollment.id;
      } else {
        try {
          const [newEnrollment] = await db.insert(enrollments).values({
            studentId,
            courseTypeId: "default-course-type",
            startDate: slot.date,
            status: "active"
          }).returning();
          enrollmentId = newEnrollment.id;
        } catch (e) {
          console.error("Failed to create enrollment:", e);
          throw e;
        }
      }
    }

    // Inherit location/vehicle from working day
    const [workingDay] = await db.select().from(instructorWorkingDays).where(and(
      eq(instructorWorkingDays.instructorId, instructorId),
      eq(instructorWorkingDays.date, slot.date)
    )).limit(1);

    const [lesson] = await db.insert(lessons).values({
      enrollmentId,
      studentId,
      instructorId,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      durationMin: durationMin || 90,
      status: "scheduled",
      location: slot.location || workingDay?.location || null,
      city: slot.city || workingDay?.city || null,
      vehicle: workingDay?.vehicle || null,
    }).returning();

    // Mark slot as booked
    await db.update(slots)
      .set({ isBooked: true, lessonId: lesson.id })
      .where(eq(slots.id, slotId));

    const io = req.app.get("io");
    if (io) {
      emitCalendarUpdate(io, req, { instructorId, date: slot.date });
    }

    res.json(lesson);
  } catch (err) {
    console.error("Book lesson error:", err);
    res.status(500).json({ error: "Internal server error: " + (err instanceof Error ? err.message : String(err)) });
  }
});

router.post("/mark-lesson-paid", async (req, res) => {
  try {
    const { lessonId, studentId } = req.body;

    if (req.userRole !== "admin" && req.userRole !== "instructor") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await db.update(lessons)
      .set({ paid: true })
      .where(eq(lessons.id, lessonId));

    await db.update(students)
      .set({ status: "active" })
      .where(eq(students.id, studentId));

    const io = req.app.get("io");
    if (io) {
      emitCalendarUpdate(io, req, { instructorId: "all", lessonId });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Mark lesson paid error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/update-lesson/:lessonId", validate(updateLessonSchema), async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { notes, location, city, amount } = req.body;

    if (req.userRole !== "admin" && req.userRole !== "instructor") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [existing] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }

    await db.update(lessons)
      .set({ notes, location, city, amount: amount || null })
      .where(eq(lessons.id, lessonId));

    // Notify student if location changed
    if (location && location !== existing.location) {
      const [student] = await db.select().from(students).where(eq(students.id, existing.studentId)).limit(1);
      const [user] = student ? await db.select().from(users).where(eq(users.id, student.userId)).limit(1) : [];
      if (user?.email) {
        try {
          await sendLocationChangedEmail(user.email, existing.date, existing.startTime, existing.endTime, existing.location || null, location);
        } catch (mailErr) {
          console.error("Location change email failed:", mailErr);
        }
      }
    }

    const io = req.app.get("io");
    if (io) {
      emitCalendarUpdate(io, req, { lessonId });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Update lesson error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/cancel-lesson/:lessonId", validate(cancelLessonSchema), async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { reason } = req.body as { reason?: string };

    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    if (!lesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }

    if (req.userRole === "client") {
      const [student] = await db.select().from(students).where(eq(students.userId, req.userId)).limit(1);
      if (!student || lesson.studentId !== student.id) {
        res.status(403).json({ error: "Forbidden: You can only cancel your own lessons" });
        return;
      }
    }

    await db.update(lessons)
      .set({ status: "canceled" })
      .where(eq(lessons.id, lessonId));

    // Free up the slot
    await db.update(slots)
      .set({ isBooked: false, lessonId: null })
      .where(eq(slots.lessonId, lessonId));

    const { messages: msgs } = await import("../db/schema.js");
    const [student] = lesson.studentId
      ? await db.select().from(students).where(eq(students.id, lesson.studentId)).limit(1)
      : [null];

    let senderId = req.userId!;
    let recipientId: string;
    let cancelledBy: string;

    if (req.userRole === "client") {
      recipientId = lesson.instructorId;
      cancelledBy = student ? `${student.firstName} ${student.lastName}` : "Student";
    } else {
      recipientId = student?.userId!;
      cancelledBy = "Instructor";
    }

    const content = reason
      ? `Lesson on ${lesson.date} (${lesson.startTime}-${lesson.endTime}) cancelled by ${cancelledBy}. Reason: ${reason}`
      : `Lesson on ${lesson.date} (${lesson.startTime}-${lesson.endTime}) cancelled by ${cancelledBy}.`;

    const [msg] = await db.insert(msgs).values({
      senderId,
      recipientId,
      content,
      type: "lesson_cancelled",
      lessonId: lessonId,
    }).returning();

    const io = req.app.get("io");
    if (io && msg) {
      io.emit("new_message", { message: msg, recipientId });
      emitCalendarUpdate(io, req, { instructorId: lesson.instructorId, date: lesson.date });
    }

    try {
      if (req.userRole !== "client") {
        if (student?.userId) {
          const [studentUser] = await db.select().from(users).where(eq(users.id, student.userId)).limit(1);
          if (studentUser?.email) {
            await sendNewMessageEmail(studentUser.email, "Instructors", content);
          }
        }
      }
    } catch (mailErr) {
      console.error("Email notification error:", mailErr);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Cancel lesson error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reschedule — must target an existing free slot
router.post("/reschedule-lesson/:lessonId", validate(rescheduleSchema), async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { targetSlotId } = req.body;

    if (!targetSlotId) {
      res.status(400).json({ error: "targetSlotId is required — pick an existing free slot" });
      return;
    }

    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    if (!lesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }

    if (req.userRole === "client") {
      const [student] = await db.select().from(students).where(eq(students.userId, req.userId)).limit(1);
      if (!student || lesson.studentId !== student.id) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    // Validate target slot exists and is free
    const [targetSlot] = await db.select().from(slots).where(eq(slots.id, targetSlotId)).limit(1);
    if (!targetSlot) {
      res.status(404).json({ error: "Target slot not found" });
      return;
    }
    if (targetSlot.isBooked) {
      res.status(409).json({ error: "Target slot is already booked." });
      return;
    }
    if (targetSlot.instructorId !== lesson.instructorId) {
      res.status(400).json({ error: "Target slot belongs to a different instructor" });
      return;
    }

    const oldDate = lesson.date;
    const oldTime = `${lesson.startTime}-${lesson.endTime}`;
    const newDate = targetSlot.date;
    const newTime = `${targetSlot.startTime}-${targetSlot.endTime}`;
    const { messages: msgs } = await import("../db/schema.js");

    if (req.userRole === "client") {
      // Student requests reschedule — instructor must approve
      await db.update(lessons)
        .set({
          status: "reschedule_pending",
          proposedDate: targetSlot.date,
          proposedStartTime: targetSlot.startTime,
          proposedEndTime: targetSlot.endTime,
        })
        .where(eq(lessons.id, lessonId));

      // Temporarily mark the target slot so nobody else grabs it
      await db.update(slots)
        .set({ isBooked: true, lessonId: lessonId })
        .where(eq(slots.id, targetSlotId));

      const [student] = lesson.studentId
        ? await db.select().from(students).where(eq(students.id, lesson.studentId)).limit(1)
        : [null];

      const studentName = student ? `${student.firstName} ${student.lastName}` : "Student";
      const content = `${studentName} requested to reschedule: ${oldDate} (${oldTime}) → ${newDate} (${newTime})`;

      const [msg] = await db.insert(msgs).values({
        senderId: req.userId!,
        recipientId: lesson.instructorId,
        content,
        type: "reschedule_request",
        lessonId: lessonId,
        proposedDate: targetSlot.date,
        proposedStartTime: targetSlot.startTime,
        proposedEndTime: targetSlot.endTime,
      }).returning();

      const io = req.app.get("io");
      if (io) {
        if (msg) io.emit("new_message", { message: msg, recipientId: lesson.instructorId });
        emitCalendarUpdate(io, req, { instructorId: lesson.instructorId, date: newDate });
        if (oldDate !== newDate) emitCalendarUpdate(io, req, { instructorId: lesson.instructorId, date: oldDate });
      }

      res.json({ success: true, pending: true });
    } else {
      // Instructor/admin reschedules instantly
      // Free old slot
      await db.update(slots)
        .set({ isBooked: false, lessonId: null })
        .where(and(eq(slots.lessonId, lessonId), eq(slots.isBooked, true)));

      // Book new slot
      await db.update(slots)
        .set({ isBooked: true, lessonId: lessonId })
        .where(eq(slots.id, targetSlotId));

      // Update lesson
      await db.update(lessons)
        .set({ date: newDate, startTime: targetSlot.startTime, endTime: targetSlot.endTime, status: "rescheduled" })
        .where(eq(lessons.id, lessonId));

      const [student] = lesson.studentId
        ? await db.select().from(students).where(eq(students.id, lesson.studentId)).limit(1)
        : [null];

      const content = `Lesson rescheduled by Instructor: ${oldDate} (${oldTime}) → ${newDate} (${newTime})`;

      const [msg] = await db.insert(msgs).values({
        senderId: req.userId!,
        recipientId: student?.userId!,
        content,
        type: "reschedule_approved",
        lessonId: lessonId,
      }).returning();

      const io = req.app.get("io");
      if (io) {
        if (msg) io.emit("new_message", { message: msg, recipientId: student?.userId! });
        emitCalendarUpdate(io, req, { instructorId: lesson.instructorId, date: oldDate });
        if (oldDate !== newDate) emitCalendarUpdate(io, req, { instructorId: lesson.instructorId, date: newDate });
      }

      try {
        if (student?.userId) {
          const [studentUser] = await db.select().from(users).where(eq(users.id, student.userId)).limit(1);
          if (studentUser?.email) {
            await sendNewMessageEmail(studentUser.email, "Instructors", content);
          }
        }
      } catch (mailErr) {
        console.error("Email notification error:", mailErr);
      }

      res.json({ success: true });
    }
  } catch (err) {
    console.error("Reschedule lesson error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Instructor approves/declines a pending reschedule
router.post("/reschedule-lesson/:lessonId/respond", validate(respondRescheduleSchema), async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { action } = req.body;

    if (!action || !["approve", "decline"].includes(action)) {
      res.status(400).json({ error: "action must be 'approve' or 'decline'" });
      return;
    }

    if (req.userRole !== "admin" && req.userRole !== "instructor") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    if (!lesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }

    if (lesson.status !== "reschedule_pending") {
      res.status(400).json({ error: "Lesson is not pending reschedule" });
      return;
    }

    const { messages: msgs } = await import("../db/schema.js");
    const [student] = lesson.studentId
      ? await db.select().from(students).where(eq(students.id, lesson.studentId)).limit(1)
      : [null];

    const oldSlot = `${lesson.date} (${lesson.startTime}-${lesson.endTime})`;
    const newSlot = `${lesson.proposedDate} (${lesson.proposedStartTime}-${lesson.proposedEndTime})`;

    if (action === "approve") {
      // Find the slot that was held for this pending reschedule
      const [heldSlot] = await db.select().from(slots).where(and(
        eq(slots.lessonId, lessonId),
        eq(slots.date, lesson.proposedDate!),
        eq(slots.startTime, lesson.proposedStartTime!)
      )).limit(1);

      if (!heldSlot) {
        res.status(409).json({ error: "Target slot no longer available." });
        return;
      }

      // Free old slot
      await db.update(slots)
        .set({ isBooked: false, lessonId: null })
        .where(and(eq(slots.lessonId, lessonId), ne(slots.id, heldSlot.id)));

      // Confirm the held slot
      await db.update(slots)
        .set({ isBooked: true, lessonId: lessonId })
        .where(eq(slots.id, heldSlot.id));

      // Update lesson
      await db.update(lessons)
        .set({
          date: lesson.proposedDate!,
          startTime: lesson.proposedStartTime!,
          endTime: lesson.proposedEndTime!,
          status: "rescheduled",
          proposedDate: null,
          proposedStartTime: null,
          proposedEndTime: null,
        })
        .where(eq(lessons.id, lessonId));

      const content = `Reschedule approved! ${oldSlot} → ${newSlot}`;

      const [msg] = await db.insert(msgs).values({
        senderId: req.userId!,
        recipientId: student?.userId!,
        content,
        type: "reschedule_approved",
        lessonId,
      }).returning();

      const io = req.app.get("io");
      if (io) {
        if (msg) io.emit("new_message", { message: msg, recipientId: student?.userId! });
        emitCalendarUpdate(io, req, { instructorId: lesson.instructorId, date: lesson.date });
        if (lesson.date !== lesson.proposedDate) emitCalendarUpdate(io, req, { instructorId: lesson.instructorId, date: lesson.proposedDate });
      }

      try {
        if (student?.userId) {
          const [studentUser] = await db.select().from(users).where(eq(users.id, student.userId)).limit(1);
          if (studentUser?.email) {
            await sendNewMessageEmail(studentUser.email, "Instructors", content);
          }
        }
      } catch (mailErr) {
        console.error("Email notification error:", mailErr);
      }
    } else {
      // Decline — revert lesson and free the held slot
      await db.update(lessons)
        .set({
          status: "scheduled",
          proposedDate: null,
          proposedStartTime: null,
          proposedEndTime: null,
        })
        .where(eq(lessons.id, lessonId));

      // Free the slot that was held
      await db.update(slots)
        .set({ isBooked: false, lessonId: null })
        .where(and(eq(slots.lessonId, lessonId), eq(slots.isBooked, true)));

      // Re-link old slot to lesson
      const [oldSlotRow] = await db.select().from(slots).where(and(
        eq(slots.instructorId, lesson.instructorId),
        eq(slots.date, lesson.date),
        eq(slots.startTime, lesson.startTime),
        eq(slots.isBooked, false)
      )).limit(1);

      if (oldSlotRow) {
        await db.update(slots)
          .set({ isBooked: true, lessonId: lessonId })
          .where(eq(slots.id, oldSlotRow.id));
      }

      const content = `Reschedule request declined. ${oldSlot} → ${newSlot} was not approved.`;

      const [msg] = await db.insert(msgs).values({
        senderId: req.userId!,
        recipientId: student?.userId!,
        content,
        type: "reschedule_declined",
        lessonId,
      }).returning();

      const io = req.app.get("io");
      if (io) {
        if (msg) io.emit("new_message", { message: msg, recipientId: student?.userId! });
        emitCalendarUpdate(io, req, { instructorId: lesson.instructorId, date: lesson.date });
      }

      try {
        if (student?.userId) {
          const [studentUser] = await db.select().from(users).where(eq(users.id, student.userId)).limit(1);
          if (studentUser?.email) {
            await sendNewMessageEmail(studentUser.email, "Instructors", content);
          }
        }
      } catch (mailErr) {
        console.error("Email notification error:", mailErr);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Respond to reschedule error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Student cancels their own pending reschedule request
router.post("/cancel-reschedule/:lessonId", async (req, res) => {
  try {
    const { lessonId } = req.params;

    if (req.userRole !== "client") {
      res.status(403).json({ error: "Only students can cancel pending reschedules" });
      return;
    }

    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    if (!lesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }

    if (lesson.status !== "reschedule_pending") {
      res.status(400).json({ error: "Lesson is not pending reschedule" });
      return;
    }

    // Verify student owns this lesson
    const [student] = await db.select().from(students).where(eq(students.userId, req.userId)).limit(1);
    if (!student || lesson.studentId !== student.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { messages: msgs } = await import("../db/schema.js");

    // Free the held target slot
    await db.update(slots)
      .set({ isBooked: false, lessonId: null })
      .where(and(eq(slots.lessonId, lessonId), eq(slots.isBooked, true)));

    // Revert lesson
    await db.update(lessons)
      .set({
        status: "scheduled",
        proposedDate: null,
        proposedStartTime: null,
        proposedEndTime: null,
      })
      .where(eq(lessons.id, lessonId));

    // Re-link original slot
    const [originalSlot] = await db.select().from(slots).where(and(
      eq(slots.instructorId, lesson.instructorId),
      eq(slots.date, lesson.date),
      eq(slots.startTime, lesson.startTime),
      eq(slots.isBooked, false)
    )).limit(1);

    if (originalSlot) {
      await db.update(slots)
        .set({ isBooked: true, lessonId: lessonId })
        .where(eq(slots.id, originalSlot.id));
    }

    // Notify instructor
    const [st] = await db.select().from(students).where(eq(students.id, lesson.studentId)).limit(1);
    const studentName = st ? `${st.firstName} ${st.lastName}` : "Student";
    const content = `${studentName} cancelled their reschedule request for ${lesson.date} (${lesson.startTime}-${lesson.endTime}).`;

    const [msg] = await db.insert(msgs).values({
      senderId: req.userId!,
      recipientId: lesson.instructorId,
      content,
      type: "lesson_cancelled",
      lessonId,
    }).returning();

    const io = req.app.get("io");
    if (io) {
      if (msg) io.emit("new_message", { message: msg, recipientId: lesson.instructorId });
      emitCalendarUpdate(io, req, { instructorId: lesson.instructorId, date: lesson.date });
      if (lesson.proposedDate && lesson.proposedDate !== lesson.date) {
        emitCalendarUpdate(io, req, { instructorId: lesson.instructorId, date: lesson.proposedDate });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Cancel reschedule error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get recent calendar notifications (for admin/instructor)
router.get("/notifications", async (req, res) => {
  try {
    if (req.userRole !== "admin" && req.userRole !== "instructor") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 15, 30);

    const recentLessons = await db.select({
      id: lessons.id,
      date: lessons.date,
      startTime: lessons.startTime,
      endTime: lessons.endTime,
      status: lessons.status,
      studentFirstName: students.firstName,
      studentLastName: students.lastName,
      createdAt: lessons.createdAt,
      updatedAt: lessons.updatedAt,
    })
      .from(lessons)
      .leftJoin(students, eq(lessons.studentId, students.id))
      .orderBy(desc(lessons.updatedAt || lessons.createdAt))
      .limit(limit);

    const notifications = recentLessons.map(l => {
      let type: "booked" | "cancelled" | "rescheduled" | "reschedule_pending";
      if (l.status === "canceled") {
        type = "cancelled";
      } else if (l.status === "reschedule_pending") {
        type = "reschedule_pending";
      } else if (l.status === "rescheduled") {
        type = "rescheduled";
      } else {
        type = "booked";
      }

      return {
        id: l.id,
        type,
        date: l.date,
        startTime: l.startTime,
        endTime: l.endTime,
        studentName: `${l.studentFirstName} ${l.studentLastName}`,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      };
    });

    res.json(notifications);
  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Copy working days from one week to another
router.post("/copy-week", validate(copyWeekSchema), async (req, res) => {
  try {
    const { instructorId, sourceWeekStart, targetWeekStart } = req.body as {
      instructorId: string;
      sourceWeekStart: string; // e.g. "2026-05-18"
      targetWeekStart: string; // e.g. "2026-05-25"
    };

    if (!instructorId || !sourceWeekStart || !targetWeekStart) {
      res.status(400).json({ error: "instructorId, sourceWeekStart, targetWeekStart required" });
      return;
    }

    if (req.userRole !== "admin" && req.userRole !== "instructor") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Use UTC-safe parsing to compute day offset
    const srcStart = new Date(sourceWeekStart + "T00:00:00Z");
    const tgtStart = new Date(targetWeekStart + "T00:00:00Z");
    const dayOffset = Math.round((tgtStart.getTime() - srcStart.getTime()) / 86400000);

    // Clear all existing unbooked slots in the target week first
    // (keep booked slots that have active lessons)
    await db.delete(slots).where(and(
      eq(slots.instructorId, instructorId),
      gte(slots.date, targetWeekStart),
      lte(slots.date, addDaysToDate(targetWeekStart, 6)),
      eq(slots.isBooked, false)
    ));

    // Copy working days config (for future manual edits to work)
    const sourceDays = await db.select().from(instructorWorkingDays).where(and(
      eq(instructorWorkingDays.instructorId, instructorId),
      gte(instructorWorkingDays.date, sourceWeekStart),
      lte(instructorWorkingDays.date, addDaysToDate(sourceWeekStart, 6))
    ));

    for (const day of sourceDays) {
      const newDate = addDaysToDate(day.date, dayOffset);
      const existing = await db.select().from(instructorWorkingDays).where(and(
        eq(instructorWorkingDays.instructorId, instructorId),
        eq(instructorWorkingDays.date, newDate)
      ));

      // Fetch this source day's ordered cities (child table) to carry them forward
      const srcCities = await db.select().from(instructorWorkingDayCities)
        .where(eq(instructorWorkingDayCities.workingDayId, day.id))
        .orderBy(instructorWorkingDayCities.position);
      const citiesToCopy = srcCities.map(c => c.city);
      const primaryCity = citiesToCopy[0] ?? day.city ?? null;

      let targetDayId: string;
      if (existing.length > 0) {
        await db.update(instructorWorkingDays)
          .set({ isWorking: day.isWorking, startTime: day.startTime, endTime: day.endTime, slotDurationMin: day.slotDurationMin || 90, location: day.location, vehicle: day.vehicle, city: primaryCity })
          .where(eq(instructorWorkingDays.id, existing[0].id));
        targetDayId = existing[0].id;
      } else {
        const [inserted] = await db.insert(instructorWorkingDays).values({
          instructorId, date: newDate, isWorking: day.isWorking,
          startTime: day.startTime, endTime: day.endTime, slotDurationMin: day.slotDurationMin || 90,
          location: day.location, vehicle: day.vehicle, city: primaryCity,
        }).returning();
        targetDayId = inserted.id;
      }

      // Mirror the source day's ordered cities onto the target day
      await db.delete(instructorWorkingDayCities)
        .where(eq(instructorWorkingDayCities.workingDayId, targetDayId));
      if (citiesToCopy.length > 0) {
        await db.insert(instructorWorkingDayCities).values(
          citiesToCopy.map((city, position) => ({ workingDayId: targetDayId, city, position }))
        );
      }
    }

    // Copy actual source slots (preserving manually moved positions), all as free
    const sourceSlots = await db.select().from(slots).where(and(
      eq(slots.instructorId, instructorId),
      gte(slots.date, sourceWeekStart),
      lte(slots.date, addDaysToDate(sourceWeekStart, 6))
    ));

    // Fetch existing booked slots in target week to check overlaps
    const targetBooked = await db.select().from(slots).where(and(
      eq(slots.instructorId, instructorId),
      gte(slots.date, targetWeekStart),
      lte(slots.date, addDaysToDate(targetWeekStart, 6)),
      eq(slots.isBooked, true)
    ));

    let copied = 0;
    for (const slot of sourceSlots) {
      const newDate = addDaysToDate(slot.date, dayOffset);
      const [sH, sM] = slot.startTime.split(":").map(Number);
      const [eH, eM] = slot.endTime.split(":").map(Number);
      const newStart = sH * 60 + sM;
      const newEnd = eH * 60 + eM;

      // Skip if overlaps any existing booked slot in target week
      const overlaps = targetBooked.some(b => {
        if (b.date !== newDate) return false;
        const [bSH, bSM] = b.startTime.split(":").map(Number);
        const [bEH, bEM] = b.endTime.split(":").map(Number);
        const bStart = bSH * 60 + bSM;
        const bEnd = bEH * 60 + bEM;
        return Math.min(newEnd, bEnd) > Math.max(newStart, bStart);
      });
      if (overlaps) continue;

      await db.insert(slots).values({
        instructorId,
        date: newDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
        isBooked: false,
        city: slot.city,
        location: slot.location,
      });
      copied++;
    }

    const io = req.app.get("io");
    if (io) {
      emitCalendarUpdate(io, req, { instructorId });
    }

    res.json({ success: true, copied });
  } catch (err) {
    console.error("Copy week error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Move a slot (update start/end time, optionally date; optionally update city/location)
router.patch("/slots/:slotId", validate(moveSlotSchema), async (req, res) => {
  try {
    const { slotId } = req.params;
    const { startTime, endTime, date, city, location } = req.body;
    const isCityOrLocUpdate = city !== undefined || location !== undefined;

    if (!startTime || !endTime) {
      // Allow city/location-only updates without a time change
      if (!isCityOrLocUpdate) {
        res.status(400).json({ error: "startTime and endTime required" });
        return;
      }
    }

    if (req.userRole !== "admin" && req.userRole !== "instructor") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [slot] = await db.select().from(slots).where(eq(slots.id, slotId)).limit(1);
    if (!slot) {
      res.status(404).json({ error: "Slot not found" });
      return;
    }

    // Note: per product decision #4, we do NOT validate that the city is in the
    // day's city list — instructors can drop a pin anywhere and we accept it.
    // The frontend chip selector already limits manual city edits to day cities.

    const targetDate = date || slot.date;
    const effectiveStart = startTime || slot.startTime;
    const effectiveEnd = endTime || slot.endTime;

    // Overlap check only matters when changing time/date
    if (startTime && endTime) {
      const [newSH, newSM] = effectiveStart.split(":").map(Number);
      const [newEH, newEM] = effectiveEnd.split(":").map(Number);
      const newStartMin = newSH * 60 + newSM;
      const newEndMin = newEH * 60 + newEM;

      const overlapConditions = [
        eq(slots.instructorId, slot.instructorId),
        eq(slots.date, targetDate),
        ne(slots.id, slotId),
      ];
      if (slot.isBooked) {
        overlapConditions.push(eq(slots.isBooked, true));
      }
      const daySlots = await db.select().from(slots).where(and(...overlapConditions));

      for (const s of daySlots) {
        const [sH, sM] = s.startTime.split(":").map(Number);
        const [eH, eM] = s.endTime.split(":").map(Number);
        const sStart = sH * 60 + sM;
        const sEnd = eH * 60 + eM;
        if (newStartMin < sEnd && newEndMin > sStart) {
          res.status(409).json({ error: "Slot overlaps with another slot" });
          return;
        }
      }
    }

    const slotUpdate: { startTime?: string; endTime?: string; date: string; city?: string | null; location?: string | null; updatedAt: Date } = {
      date: targetDate,
      updatedAt: new Date(),
    };
    if (startTime) slotUpdate.startTime = effectiveStart;
    if (endTime) slotUpdate.endTime = effectiveEnd;
    if (city !== undefined) slotUpdate.city = city;
    if (location !== undefined) slotUpdate.location = location;
    await db.update(slots).set(slotUpdate).where(eq(slots.id, slotId));

    // If booked, sync city/location to the lesson (and reuse the existing reschedule path for time changes)
    if (slot.isBooked && slot.lessonId) {
      const lessonUpdate: { startTime?: string; endTime?: string; date?: string; status?: string; city?: string | null; location?: string | null } = {};
      if (city !== undefined) lessonUpdate.city = city;
      if (location !== undefined) lessonUpdate.location = location;

      if (startTime && endTime) {
        lessonUpdate.startTime = effectiveStart;
        lessonUpdate.endTime = effectiveEnd;
        lessonUpdate.date = targetDate;
        lessonUpdate.status = "rescheduled";
      }

      if (Object.keys(lessonUpdate).length > 0) {
        const [lesson] = await db.select().from(lessons).where(eq(lessons.id, slot.lessonId)).limit(1);
        await db.update(lessons)
          .set(lessonUpdate)
          .where(eq(lessons.id, slot.lessonId));

        // Existing notification path: only fires on time/date change
        if (startTime && endTime && lesson?.studentId) {
          const { messages: msgs } = await import("../db/schema.js");
          const [student] = await db.select().from(students).where(eq(students.id, lesson.studentId)).limit(1);
          const oldTime = `${lesson.date} (${lesson.startTime}-${lesson.endTime})`;
          const newTime = `${targetDate} (${effectiveStart}-${effectiveEnd})`;
          const content = `Lesson rescheduled by Instructor: ${oldTime} → ${newTime}`;

          const [msg] = await db.insert(msgs).values({
            senderId: req.userId!,
            recipientId: student?.userId!,
            content,
            type: "reschedule_approved",
            lessonId: lesson.id,
          }).returning();

          const msgIo = req.app.get("io");
          if (msgIo && msg) {
            msgIo.emit("new_message", { message: msg, recipientId: student?.userId! });
          }

          // Send email notification
          try {
            if (student?.userId) {
              const [studentUser] = await db.select().from(users).where(eq(users.id, student.userId)).limit(1);
              if (studentUser?.email) {
                await sendNewMessageEmail(studentUser.email, "Instructors", content);
              }
            }
          } catch (mailErr) {
            console.error("Email notification error:", mailErr);
          }
        }
      }
    }

    const io = req.app.get("io");
    if (io) {
      emitCalendarUpdate(io, req, { instructorId: slot.instructorId, date: slot.date });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Move slot error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete an individual unbooked slot
router.delete("/slots/:slotId", async (req, res) => {
  try {
    const { slotId } = req.params;

    if (req.userRole !== "admin" && req.userRole !== "instructor") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [slot] = await db.select().from(slots).where(eq(slots.id, slotId)).limit(1);
    if (!slot) {
      res.status(404).json({ error: "Slot not found" });
      return;
    }

    if (slot.isBooked) {
      res.status(409).json({ error: "Cannot delete a booked slot" });
      return;
    }

    await db.delete(slots).where(eq(slots.id, slotId));

    const io = req.app.get("io");
    if (io) {
      emitCalendarUpdate(io, req, { instructorId: slot.instructorId, date: slot.date });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Delete slot error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Predefined cities
router.get("/locations/cities", (_req, res) => {
  res.json(["Olaine", "Rīga", "Jelgava"]);
});

// Locations CRUD
router.get("/locations", async (req, res) => {
  try {
    const city = req.query.city as string | undefined;
    let query = db.select().from(locations).orderBy(locations.name);
    if (city) {
      const allLocations = await db.select().from(locations).where(eq(locations.city, city)).orderBy(locations.name);
      res.json(allLocations);
    } else {
      const allLocations = await query;
      res.json(allLocations);
    }
  } catch (err) {
    console.error("List locations error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/locations", validate(createLocationSchema), async (req, res) => {
  try {
    if (req.userRole !== "admin" && req.userRole !== "instructor") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const { name, address, lat, lng, city } = req.body;
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    const [loc] = await db.insert(locations).values({ name, address, lat, lng, city: city || "Olaine" }).returning();
    res.status(201).json(loc);
  } catch (err) {
    console.error("Create location error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/locations/:id", async (req, res) => {
  try {
    if (req.userRole !== "admin" && req.userRole !== "instructor") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db.delete(locations).where(eq(locations.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error("Delete location error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
