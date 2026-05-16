import { Router } from "express";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { instructorWorkingDays, lessons, users, students } from "../db/schema.js";
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
    
    // fetch working days in range
    const workingDays = await db.select()
      .from(instructorWorkingDays)
      .where(and(
        eq(instructorWorkingDays.instructorId, instructorId),
        gte(instructorWorkingDays.date, startDate),
        lte(instructorWorkingDays.date, endDate),
        eq(instructorWorkingDays.isWorking, true)
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
    })
    .from(lessons)
    .leftJoin(students, eq(lessons.studentId, students.id))
    .where(and(
      eq(lessons.instructorId, instructorId),
      gte(lessons.date, startDate),
      lte(lessons.date, endDate),
      inArray(lessons.status, ["scheduled", "rescheduled"])
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
      // Mock enrollment
      enrollmentId = "dummy-enrollment-id"; // since better-sqlite3 might not enforce by default
    }

    // Check for overlap
    const existing = await db.select().from(lessons).where(and(
      eq(lessons.instructorId, instructorId),
      eq(lessons.date, date),
      inArray(lessons.status, ["scheduled", "rescheduled"])
    ));

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

    res.json(lesson);
  } catch (err) {
    console.error("Book lesson error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
