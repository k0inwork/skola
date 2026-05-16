import { Router } from "express";
import { sql, eq, and, or } from "drizzle-orm";
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
        const now = new Date().toISOString();
        const currentDate = now.split('T')[0];
        const currentTime = now.split('T')[1].substring(0, 5);
        
        const scheduledLessonsResult = await db.select({ count: sql<number>`count(*)` })
          .from(lessons)
          .where(
            and(
              eq(lessons.studentId, studentId),
              eq(lessons.status, "scheduled"),
              or(
                sql`${lessons.date} > ${currentDate}`,
                and(
                  eq(lessons.date, currentDate),
                  sql`${lessons.startTime} > ${currentTime}`
                )
              )
            )
          );
        const scheduledLessons = Number(scheduledLessonsResult[0].count);
        
        res.json({
            activeStudents: 0,
            scheduledLessons,
            pendingPayments: 0
        });
    } else {
        // Instructor/Admin view: Fetch all
        const activeStudentsResult = await db.select({ count: sql<number>`count(*)` })
          .from(students)
          .where(eq(students.status, "active"));
        const activeStudents = Number(activeStudentsResult[0].count);

        const now = new Date().toISOString();
        const currentDate = now.split('T')[0];
        const currentTime = now.split('T')[1].substring(0, 5);

        const scheduledLessonsResult = await db.select({ count: sql<number>`count(*)` })
          .from(lessons)
          .where(
            and(
              eq(lessons.status, "scheduled"),
              or(
                sql`${lessons.date} > ${currentDate}`,
                and(
                  eq(lessons.date, currentDate),
                  sql`${lessons.startTime} > ${currentTime}`
                )
              )
            )
          );
        const scheduledLessons = Number(scheduledLessonsResult[0].count);

        res.json({
          activeStudents,
          scheduledLessons,
          pendingPayments: 0
        });
    }
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
