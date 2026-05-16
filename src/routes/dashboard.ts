import { Router } from "express";
import { sql, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { students, lessons, payments } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/stats", async (req, res) => {
  try {
    const student = await db.select().from(students).where(eq(students.userId, req.userId)).limit(1);
    const isStudent = req.userRole === "client";

    if (isStudent && student.length > 0) {
        // Student view: Fetch only their data
        const studentId = student[0].id;
        
        const scheduledLessonsResult = await db.select({ count: sql<number>`count(*)` })
          .from(lessons)
          .where(eq(lessons.studentId, studentId));
        const scheduledLessons = Number(scheduledLessonsResult[0].count);
        
        res.json({
            activeStudents: 0, // Not applicable
            scheduledLessons,
            pendingPayments: 0 // Not applicable or fetched differently
        });
    } else {
        // Instructor/Admin view: Fetch all
        const activeStudentsResult = await db.select({ count: sql<number>`count(*)` })
          .from(students)
          .where(eq(students.status, "active"));
        const activeStudents = Number(activeStudentsResult[0].count);

        const scheduledLessonsResult = await db.select({ count: sql<number>`count(*)` })
          .from(lessons)
          .where(eq(lessons.status, "scheduled"));
        const scheduledLessons = Number(scheduledLessonsResult[0].count);

        const pendingPaymentsResult = await db.select({ count: sql<number>`count(*)` })
          .from(payments)
          .where(eq(payments.status, "pending"));
        const pendingPayments = Number(pendingPaymentsResult[0].count);

        res.json({
          activeStudents,
          scheduledLessons,
          pendingPayments
        });
    }
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
