import { Router } from "express";
import { eq, sql, and, gte, lte, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { payments, students, lessons, enrollments } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { validate, createPaymentSchema, updatePaymentSchema } from "../lib/validation.js";

const router = Router();

router.use(requireAuth);

// Get payments with optional filters
router.get("/", async (req, res) => {
  try {
    const { studentId, status, startDate, endDate } = req.query as Record<string, string>;

    const conditions = [];
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
    const totalPaid = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(${payments.amount} AS DECIMAL)), 0)`,
    })
      .from(payments)
      .where(eq(payments.status, "paid"));

    const totalPending = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(${payments.amount} AS DECIMAL)), 0)`,
    })
      .from(payments)
      .where(eq(payments.status, "pending"));

    // Unpaid lessons count
    const unpaidLessons = await db.select({
      count: sql<number>`count(*)`,
    })
      .from(lessons)
      .where(eq(lessons.paid, false));

    // Paid lessons total (using amount field or default 30)
    const paidLessonsTotal = await db.select({
      total: sql<string>`COALESCE(SUM(CASE WHEN ${lessons.amount} IS NOT NULL THEN CAST(${lessons.amount} AS DECIMAL) ELSE 30 END), 0)`,
    })
      .from(lessons)
      .where(eq(lessons.paid, true));

    res.json({
      totalRevenue: Number(totalPaid[0]?.total || 0) + Number(paidLessonsTotal[0]?.total || 0),
      pendingPayments: Number(totalPending[0]?.total || 0),
      paidLessonsTotal: Number(paidLessonsTotal[0]?.total || 0),
      unpaidLessonsCount: Number(unpaidLessons[0]?.count || 0),
    });
  } catch (err) {
    console.error("Payment stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", validate(createPaymentSchema), async (req, res) => {
  try {
    const [payment] = await db.insert(payments).values(req.body).returning();
    res.status(201).json(payment);
  } catch (err) {
    console.error("Create payment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id", validate(updatePaymentSchema), async (req, res) => {
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
