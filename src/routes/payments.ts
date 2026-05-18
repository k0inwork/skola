import { Router } from "express";
import { eq, sql, and, gte, lte, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { payments, students, lessons, enrollments } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { validate, createPaymentSchema, updatePaymentSchema } from "../lib/validation.js";

async function getClientStudentId(req: any): Promise<string | null> {
  if (req.userRole !== "client") return null;
  const [student] = await db.select().from(students).where(eq(students.userId, req.userId)).limit(1);
  return student?.id || null;
}

const router = Router();

router.use(requireAuth);

// Get payments with optional filters
router.get("/", async (req, res) => {
  try {
    const { studentId, status, startDate, endDate } = req.query as Record<string, string>;

    const conditions = [];

    // Client can only see own payments
    if (req.userRole === "client") {
      const ownStudentId = await getClientStudentId(req);
      if (!ownStudentId) {
        res.json([]);
        return;
      }
      conditions.push(eq(payments.studentId, ownStudentId));
    }
    if (studentId) conditions.push(eq(payments.studentId, studentId));
    if (status) conditions.push(eq(payments.status, status));
    if (startDate) conditions.push(gte(payments.paidAt, startDate));
    if (endDate) conditions.push(lte(payments.paidAt, endDate));

    const result = await db.select({
      id: payments.id,
      studentId: payments.studentId,
      enrollmentId: payments.enrollmentId,
      amount: payments.amount,
      paidAt: payments.paidAt,
      method: payments.method,
      reference: payments.reference,
      comment: payments.comment,
      status: payments.status,
      studentFirstName: students.firstName,
      studentLastName: students.lastName,
    })
      .from(payments)
      .leftJoin(students, eq(payments.studentId, students.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(payments.paidAt));

    res.json(result);
  } catch (err) {
    console.error("List payments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Payment stats (revenue summary)
router.get("/stats", async (req, res) => {
  try {
    let totalPaidAmount = 0;
    let totalPendingAmount = 0;
    let paidLessonsTotal = 0;
    let unpaidLessonsCount = 0;

    try {
      const totalPaid = await db.select({
        total: sql<string>`COALESCE(SUM(CAST(${payments.amount} AS DECIMAL)), 0)`,
      })
        .from(payments)
        .where(eq(payments.status, "paid"));
      totalPaidAmount = Number(totalPaid[0]?.total || 0);
    } catch {}

    try {
      const totalPending = await db.select({
        total: sql<string>`COALESCE(SUM(CAST(${payments.amount} AS DECIMAL)), 0)`,
      })
        .from(payments)
        .where(eq(payments.status, "pending"));
      totalPendingAmount = Number(totalPending[0]?.total || 0);
    } catch {}

    try {
      const unpaid = await db.select({
        count: sql<number>`count(*)`,
      })
        .from(lessons)
        .where(eq(lessons.paid, false));
      unpaidLessonsCount = Number(unpaid[0]?.count || 0);
    } catch {}

    try {
      const paidTotal = await db.select({
        total: sql<string>`COALESCE(SUM(CASE WHEN ${lessons.amount} IS NOT NULL AND ${lessons.amount} != '' THEN CAST(${lessons.amount} AS DECIMAL) ELSE 30 END), 0)`,
      })
        .from(lessons)
        .where(eq(lessons.paid, true));
      paidLessonsTotal = Number(paidTotal[0]?.total || 0);
    } catch {}

    res.json({
      totalRevenue: totalPaidAmount + paidLessonsTotal,
      pendingPayments: totalPendingAmount,
      paidLessonsTotal,
      unpaidLessonsCount,
    });
  } catch (err) {
    console.error("Payment stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  if (req.userRole !== "admin" && req.userRole !== "instructor") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const { studentId, amount, paidAt, method, reference, comment, status } = req.body;

    if (!studentId || !amount || !paidAt) {
      res.status(400).json({ error: "studentId, amount, and paidAt are required" });
      return;
    }

    // Find or create enrollment for the student
    const [existingEnrollment] = await db.select().from(enrollments)
      .where(eq(enrollments.studentId, studentId)).limit(1);

    let enrollmentId = existingEnrollment?.id;
    if (!enrollmentId) {
      const [newEnrollment] = await db.insert(enrollments).values({
        studentId,
        courseTypeId: "default-course-type",
        startDate: paidAt,
        status: "active",
      }).returning();
      enrollmentId = newEnrollment.id;
    }

    const [payment] = await db.insert(payments).values({
      studentId,
      enrollmentId,
      amount,
      paidAt,
      method: method || null,
      reference: reference || null,
      comment: comment || null,
      status: status || "paid",
    }).returning();

    res.status(201).json(payment);
  } catch (err) {
    console.error("Create payment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id", validate(updatePaymentSchema), async (req, res) => {
  if (req.userRole !== "admin" && req.userRole !== "instructor") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const [updated] = await db.update(payments)
      .set(req.body)
      .where(eq(payments.id, req.params.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error("Update payment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (req.userRole !== "admin" && req.userRole !== "instructor") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db.delete(payments).where(eq(payments.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error("Delete payment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
