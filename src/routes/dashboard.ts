import { Router } from "express";
import { sql, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { students, lessons, payments } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/stats", async (req, res) => {
  try {
    const activeStudentsResult = await db.select({ count: sql<number>`count(*)` })
      .from(students)
      .where(eq(students.status, "active"));
    const activeStudents = Number(activeStudentsResult[0].count);

    const scheduledLessonsResult = await db.select({ count: sql<number>`count(*)` })
      .from(lessons)
      .where(eq(lessons.status, "scheduled"));
    const scheduledLessons = Number(scheduledLessonsResult[0].count);

    // we treat "pending" payments as pending total amount maybe? Or count.
    // Let's do the count of pending payments.
    const pendingPaymentsResult = await db.select({ count: sql<number>`count(*)` })
      .from(payments)
      .where(eq(payments.status, "pending"));
    const pendingPayments = Number(pendingPaymentsResult[0].count);

    res.json({
      activeStudents,
      scheduledLessons,
      pendingPayments
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
