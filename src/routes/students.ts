import { Router } from "express";
import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "../db/index";
import { students, users } from "../db/schema";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { validate, createStudentSchema, updateStudentSchema } from "../lib/validation";
import { hash } from "bcryptjs";

const router = Router();

router.use(requireAuth); // In Scola, is it requireAdmin? Let's use requireAuth for now.

router.get("/", async (req, res) => {
  try {
    const { search, status, page = "1", limit = "20", sort = "lastName" } = req.query as Record<string, string>;

    const conditions = [isNull(students.deletedAt)];

    if (status) {
      conditions.push(eq(students.status, status as "lead" | "registered" | "active" | "paused" | "completed" | "archived"));
    }
    if (search) {
      const term = `%${search}%`;
      conditions.push(
        sql`(${students.firstName} LIKE ${term} OR ${students.lastName} LIKE ${term} OR ${students.phone} LIKE ${term} OR ${students.email} LIKE ${term})`
      );
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Using basic select since sqlite dialect.
    const rows = await db.select()
        .from(students)
        .limit(parseInt(limit))
        .offset(offset);
        // Note: we'd ideally apply where(and(...conditions)) but bypassing for the quick fix if needed
        // Let's do it properly

    const query = db.select().from(students).where(and(...conditions)).limit(parseInt(limit)).offset(offset);
    
    // SQLite requires sqliteTable schema usage directly
    const resultRows = await query;
    
    const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(students)
        .where(and(...conditions));

    res.json({
      data: resultRows,
      total: Number(countResult[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error("List students error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", validate(createStudentSchema), async (req, res) => {
  try {
    const { createAccount, password, ...studentData } = req.body;
    
    // Normalize empty strings to null for better DB constraint handling
    if (!studentData.email) studentData.email = null;
    if (!studentData.phone) studentData.phone = null;
    
    let userId = null;

    if (createAccount && studentData.email && password) {
      const passwordHash = await hash(password, 10);
      const [user] = await db.insert(users).values({
        email: studentData.email,
        passwordHash,
        role: "client",
      }).returning();
      userId = user.id;
    }

    const [student] = await db.insert(students).values({...studentData, userId}).returning();
    res.status(201).json(student);
  } catch (err) {
    console.error("Create student error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
