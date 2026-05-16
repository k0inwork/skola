import { Router } from "express";
import { eq, and, gte, lte, inArray, desc, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { instructorWorkingDays, lessons, users, students, enrollments } from "../db/schema.js";
import { locations } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

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

// Upsert working day
router.post("/working-days", async (req, res) => {
  try {
    const { instructorId, date, isWorking, startTime, endTime, slotDurationMin } = req.body;
    
    // basic check
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

// Get slots for a date (or range)
router.get("/slots", async (req, res) => {
  try {
    const { startDate, endDate, instructorId } = req.query as Record<string, string>;
    
    // fetch working days in range (include non-working days so frontend can show "Off" state)
    const workingDays = await db.select()
      .from(instructorWorkingDays)
      .where(and(
        eq(instructorWorkingDays.instructorId, instructorId),
        gte(instructorWorkingDays.date, startDate),
        lte(instructorWorkingDays.date, endDate)
      ));

    const userStudentId = req.userRole === "client" 
      ? (await db.select().from(students).where(eq(students.userId, req.userId)))[0]?.id 
      : null;

    const bookedLessonsRaw = await db.select({
      id: lessons.id,
      date: lessons.date,
      startTime: lessons.startTime,
      endTime: lessons.endTime,
      studentId: lessons.studentId,
      studentFirstName: students.firstName,
      studentLastName: students.lastName,
      studentEmail: students.email,
      studentPhone: students.phone,
      paid: lessons.paid,
      amount: lessons.amount,
      notes: lessons.notes,
      location: lessons.location,
      status: lessons.status,
      proposedDate: lessons.proposedDate,
      proposedStartTime: lessons.proposedStartTime,
      proposedEndTime: lessons.proposedEndTime,
      createdAt: lessons.createdAt,
    })
    .from(lessons)
    .leftJoin(students, eq(lessons.studentId, students.id))
    .where(and(
      eq(lessons.instructorId, instructorId),
      gte(lessons.date, startDate),
      lte(lessons.date, endDate),
      inArray(lessons.status, ["scheduled", "rescheduled", "reschedule_pending"])
    ));

    const bookedLessons = bookedLessonsRaw.map(lesson => {
      if (req.userRole === "client" && lesson.studentId !== userStudentId) {
        return {
          id: lesson.id,
          date: lesson.date,
          startTime: lesson.startTime,
          endTime: lesson.endTime,
          studentId: null,
          studentFirstName: "Student",
          studentLastName: "",
          studentEmail: null,
          studentPhone: null,
          isMine: false,
        };
      }
      return { ...lesson, isMine: req.userRole === "client" ? lesson.studentId === userStudentId : undefined };
    });

    res.json({ workingDays, bookedLessons });
  } catch (err) {
    console.error("Get slots error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Book a slot
router.post("/book", async (req, res) => {
  try {
    let { enrollmentId, studentId, instructorId, date, startTime, endTime, durationMin } = req.body;
    
    if (req.userRole === "client") {
      const [student] = await db.select().from(students).where(eq(students.userId, req.userId));
      if (!student) {
        res.status(400).json({ error: "Student profile not found for this user." });
        return;
      }
      studentId = student.id;
    } else if (!studentId) {
      // For demo purposes for admins/instructors
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
      // Find or create a default enrollment for the student
      const [existingEnrollment] = await db.select().from(enrollments).where(eq(enrollments.studentId, studentId)).limit(1);
      
      if (existingEnrollment) {
        enrollmentId = existingEnrollment.id;
      } else {
        try {
            const [newEnrollment] = await db.insert(enrollments).values({
                studentId,
                courseTypeId: "default-course-type",
                startDate: date, // start today
                status: "active"
            }).returning();
            enrollmentId = newEnrollment.id;
        } catch (e) {
            console.error("Failed to create enrollment:", e);
            throw e;
        }
      }
    }

    // Check for overlap
    const existing = await db.select().from(lessons).where(and(
      eq(lessons.instructorId, instructorId),
      eq(lessons.date, date),
      inArray(lessons.status, ["scheduled", "rescheduled"])
    ));
    
    // Check overlap
    const overlap = existing.some(l => (
      l.startTime < endTime && l.endTime > startTime
    ));

    if (overlap) {
      res.status(409).json({ error: "Slot is already booked." });
      return;
    }

    const [lesson] = await db.insert(lessons).values({
      enrollmentId,
      studentId,
      instructorId,
      date,
      startTime,
      endTime,
      durationMin: durationMin || 90,
      status: "scheduled"
    }).returning();

    const io = req.app.get("io");
    if (io) {
      io.emit("calendar_update", { instructorId, date });
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
      io.emit("calendar_update", { instructorId: "all", lessonId }); // Simplified for broad update
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

    // Permission check
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

    // Determine who cancelled and who to notify
    const { messages: msgs } = await import("../db/schema.js");
    const [student] = lesson.studentId
      ? await db.select().from(students).where(eq(students.id, lesson.studentId)).limit(1)
      : [null];

    let senderId = req.userId!;
    let recipientId: string;
    let cancelledBy: string;

    if (req.userRole === "client") {
      // Student cancelled → message goes to instructor
      recipientId = lesson.instructorId;
      cancelledBy = student ? `${student.firstName} ${student.lastName}` : "Student";
    } else {
      // Instructor/admin cancelled → message goes to student
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

    res.json({ success: true });
  } catch (err) {
    console.error("Cancel lesson error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reschedule a lesson to a new date/time
router.post("/reschedule-lesson/:lessonId", async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { date, startTime, endTime } = req.body;

    if (!date || !startTime || !endTime) {
      res.status(400).json({ error: "date, startTime, and endTime are required" });
      return;
    }

    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    if (!lesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }

    // Permission check
    if (req.userRole === "client") {
      const [student] = await db.select().from(students).where(eq(students.userId, req.userId)).limit(1);
      if (!student || lesson.studentId !== student.id) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    // Check for overlap at new time
    const existing = await db.select().from(lessons).where(and(
      eq(lessons.instructorId, lesson.instructorId),
      eq(lessons.date, date),
      inArray(lessons.status, ["scheduled", "rescheduled", "reschedule_pending"])
    ));

    const overlap = existing.some(l => (
      l.id !== lessonId && l.startTime < endTime && l.endTime > startTime
    ));

    if (overlap) {
      res.status(409).json({ error: "Target slot is already booked." });
      return;
    }

    const oldDate = lesson.date;
    const oldTime = `${lesson.startTime}-${lesson.endTime}`;
    const { messages: msgs } = await import("../db/schema.js");

    if (req.userRole === "client") {
      // Student requests reschedule — instructor must approve
      await db.update(lessons)
        .set({
          status: "reschedule_pending",
          proposedDate: date,
          proposedStartTime: startTime,
          proposedEndTime: endTime,
        })
        .where(eq(lessons.id, lessonId));

      const [student] = lesson.studentId
        ? await db.select().from(students).where(eq(students.id, lesson.studentId)).limit(1)
        : [null];

      const studentName = student ? `${student.firstName} ${student.lastName}` : "Student";
      const content = `${studentName} requested to reschedule: ${oldDate} (${oldTime}) → ${date} (${startTime}-${endTime})`;

      const [msg] = await db.insert(msgs).values({
        senderId: req.userId!,
        recipientId: lesson.instructorId,
        content,
        type: "reschedule_request",
        lessonId: lessonId,
        proposedDate: date,
        proposedStartTime: startTime,
        proposedEndTime: endTime,
      }).returning();

      const io = req.app.get("io");
      if (io) {
        if (msg) io.emit("new_message", { message: msg, recipientId: lesson.instructorId });
        io.emit("calendar_update", { instructorId: lesson.instructorId, date });
      }

      res.json({ success: true, pending: true });
    } else {
      // Instructor/admin reschedules instantly
      await db.update(lessons)
        .set({ date, startTime, endTime, status: "rescheduled" })
        .where(eq(lessons.id, lessonId));

      const [student] = lesson.studentId
        ? await db.select().from(students).where(eq(students.id, lesson.studentId)).limit(1)
        : [null];

      const content = `Lesson rescheduled by Instructor: ${oldDate} (${oldTime}) → ${date} (${startTime}-${endTime})`;

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
        io.emit("calendar_update", { instructorId: lesson.instructorId, date });
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
    const { action } = req.body; // "approve" or "decline"

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
      // Check overlap at proposed time
      const existing = await db.select().from(lessons).where(and(
        eq(lessons.instructorId, lesson.instructorId),
        eq(lessons.date, lesson.proposedDate!),
        inArray(lessons.status, ["scheduled", "rescheduled"])
      ));
      const overlap = existing.some(l => l.id !== lessonId && l.startTime < lesson.proposedEndTime! && l.endTime > lesson.proposedStartTime!);
      if (overlap) {
        res.status(409).json({ error: "Target slot is already booked." });
        return;
      }

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
        io.emit("calendar_update", { instructorId: lesson.instructorId, date: lesson.proposedDate });
      }
    } else {
      // Decline — revert lesson to original scheduled status
      await db.update(lessons)
        .set({
          status: "scheduled",
          proposedDate: null,
          proposedStartTime: null,
          proposedEndTime: null,
        })
        .where(eq(lessons.id, lessonId));

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
