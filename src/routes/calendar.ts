import { Router } from "express";
import { eq, and, gte, lte, inArray, desc, isNull, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { instructorWorkingDays, lessons, users, students, enrollments, slots } from "../db/schema.js";
import { locations } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { sendNewMessageEmail } from "../lib/mail.js";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "../lib/google-calendar.js";

const router = Router();

router.use(requireAuth);

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

  const slotDuration = workingDay.slotDurationMin || 60;
  const [startH, startM] = workingDay.startTime.split(":").map(Number);
  const [endH, endM] = workingDay.endTime.split(":").map(Number);
  const workStartMin = startH * 60 + startM;
  const workEndMin = endH * 60 + endM;

  // Delete existing unbooked slots for this day
  await db.delete(slots).where(and(
    eq(slots.instructorId, instructorId),
    eq(slots.date, date),
    isNull(slots.lessonId),
    eq(slots.isBooked, false)
  ));

  // Generate new slots
  const values = [];
  for (let mins = workStartMin; mins + slotDuration <= workEndMin; mins += slotDuration) {
    const sH = String(Math.floor(mins / 60)).padStart(2, "0");
    const sM = String(mins % 60).padStart(2, "0");
    const eMin = mins + slotDuration;
    const eH = String(Math.floor(eMin / 60)).padStart(2, "0");
    const eM = String(eMin % 60).padStart(2, "0");

    values.push({
      instructorId,
      date,
      startTime: `${sH}:${sM}`,
      endTime: `${eH}:${eM}`,
      isBooked: false,
    });
  }

  if (values.length > 0) {
    await db.insert(slots).values(values);
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
router.post("/working-days", async (req, res) => {
  try {
    const { instructorId, date, isWorking, startTime, endTime, slotDurationMin } = req.body;

    if (req.userRole !== "admin" && req.userRole !== "instructor") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const existing = await db.select().from(instructorWorkingDays).where(and(
      eq(instructorWorkingDays.instructorId, instructorId),
      eq(instructorWorkingDays.date, date)
    ));

    if (existing.length > 0) {
      await db.update(instructorWorkingDays)
        .set({ isWorking, startTime, endTime, slotDurationMin })
        .where(eq(instructorWorkingDays.id, existing[0].id));
    } else {
      await db.insert(instructorWorkingDays).values({
        instructorId, date, isWorking, startTime, endTime, slotDurationMin
      });
    }

    // Regenerate slots for this day
    await generateSlotsForDay(instructorId, date);

    const io = req.app.get("io");
    if (io) {
      io.emit("calendar_update", { instructorId, date });
    }

    res.json({ success: true });
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

    // Get slots with optional lesson info
    const slotRows = await db.select({
      id: slots.id,
      date: slots.date,
      startTime: slots.startTime,
      endTime: slots.endTime,
      isBooked: slots.isBooked,
      lessonId: slots.lessonId,
      // lesson fields (via join)
      lessonStudentId: lessons.studentId,
      lessonStatus: lessons.status,
      lessonPaid: lessons.paid,
      lessonAmount: lessons.amount,
      lessonNotes: lessons.notes,
      lessonLocation: lessons.location,
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
        lesson: s.lessonId ? {
          id: s.lessonId,
          status: s.lessonStatus,
          paid: s.lessonPaid,
          amount: s.lessonAmount,
          notes: hideDetails ? null : s.lessonNotes,
          location: hideDetails ? null : s.lessonLocation,
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

    res.json({ workingDays, slots: result });
  } catch (err) {
    console.error("Get slots error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Book a slot by slotId
router.post("/book", async (req, res) => {
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

    instructorId = slot.instructorId;

    if (req.userRole === "client") {
      const [student] = await db.select().from(students).where(eq(students.userId, req.userId));
      if (!student) {
        res.status(400).json({ error: "Student profile not found for this user." });
        return;
      }
      studentId = student.id;
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

    const [lesson] = await db.insert(lessons).values({
      enrollmentId,
      studentId,
      instructorId,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      durationMin: durationMin || 90,
      status: "scheduled"
    }).returning();

    // Mark slot as booked
    await db.update(slots)
      .set({ isBooked: true, lessonId: lesson.id })
      .where(eq(slots.id, slotId));

    // Sync to Google Calendar (instructor)
    try {
      const [studentRow] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
      const studentName = studentRow ? `${studentRow.firstName} ${studentRow.lastName}` : "Student";
      const startISO = `${slot.date}T${slot.startTime}:00`;
      const endISO = `${slot.date}T${slot.endTime}:00`;
      const [studentUser] = studentRow?.userId
        ? await db.select().from(users).where(eq(users.id, studentRow.userId)).limit(1)
        : [null];

      const gEventId = await createCalendarEvent(instructorId, {
        summary: `Braukšanas mācība — ${studentName}`,
        startTime: startISO,
        endTime: endISO,
        location: undefined,
        attendeeEmail: studentUser?.email || undefined,
      });

      if (gEventId) {
        await db.update(lessons).set({ googleEventId: gEventId }).where(eq(lessons.id, lesson.id));
      }
    } catch (calErr) {
      console.error("Google Calendar sync error (book):", calErr);
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("calendar_update", { instructorId, date: slot.date });
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
      io.emit("calendar_update", { instructorId: "all", lessonId });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Mark lesson paid error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/update-lesson/:lessonId", async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { notes, location, amount } = req.body;

    if (req.userRole !== "admin" && req.userRole !== "instructor") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await db.update(lessons)
      .set({ notes, location, amount: amount || null })
      .where(eq(lessons.id, lessonId));

    const io = req.app.get("io");
    if (io) {
      io.emit("calendar_update", { lessonId });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Update lesson error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/cancel-lesson/:lessonId", async (req, res) => {
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

    // Delete Google Calendar event
    if (lesson.googleEventId) {
      try {
        await deleteCalendarEvent(lesson.instructorId, lesson.googleEventId);
      } catch (calErr) {
        console.error("Google Calendar sync error (cancel):", calErr);
      }
    }

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
      io.emit("calendar_update", { instructorId: lesson.instructorId, date: lesson.date });
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
router.post("/reschedule-lesson/:lessonId", async (req, res) => {
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
        io.emit("calendar_update", { instructorId: lesson.instructorId, date: newDate });
        if (oldDate !== newDate) io.emit("calendar_update", { instructorId: lesson.instructorId, date: oldDate });
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

      // Sync Google Calendar
      try {
        if (lesson.googleEventId) {
          const startISO = `${newDate}T${targetSlot.startTime}:00`;
          const endISO = `${newDate}T${targetSlot.endTime}:00`;
          const [studentRow] = lesson.studentId
            ? await db.select().from(students).where(eq(students.id, lesson.studentId)).limit(1)
            : [null];
          const studentName = studentRow ? `${studentRow.firstName} ${studentRow.lastName}` : "Student";
          await updateCalendarEvent(lesson.instructorId, lesson.googleEventId, {
            summary: `Braukšanas mācība — ${studentName}`,
            startTime: startISO,
            endTime: endISO,
          });
        }
      } catch (calErr) {
        console.error("Google Calendar sync error (reschedule):", calErr);
      }

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
        io.emit("calendar_update", { instructorId: lesson.instructorId, date: oldDate });
        if (oldDate !== newDate) io.emit("calendar_update", { instructorId: lesson.instructorId, date: newDate });
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
router.post("/reschedule-lesson/:lessonId/respond", async (req, res) => {
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
        io.emit("calendar_update", { instructorId: lesson.instructorId, date: lesson.date });
        if (lesson.date !== lesson.proposedDate) io.emit("calendar_update", { instructorId: lesson.instructorId, date: lesson.proposedDate });
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
        io.emit("calendar_update", { instructorId: lesson.instructorId, date: lesson.date });
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

// Locations CRUD
router.get("/locations", async (req, res) => {
  try {
    const allLocations = await db.select().from(locations).orderBy(locations.name);
    res.json(allLocations);
  } catch (err) {
    console.error("List locations error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/locations", async (req, res) => {
  try {
    if (req.userRole !== "admin" && req.userRole !== "instructor") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const { name, address, lat, lng } = req.body;
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    const [loc] = await db.insert(locations).values({ name, address, lat, lng }).returning();
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
