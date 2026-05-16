import { Router } from "express";
import { eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { payments } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { validate, createPaymentSchema, updatePaymentSchema } from "../lib/validation.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const allPayments = await db.select().from(payments);
    res.json(allPayments);
  } catch (err) {
    console.error("List payments error:", err);
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

export default router;
