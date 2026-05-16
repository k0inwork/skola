import { Router } from "express";
import { eq, and, isNull, sql, ne, or, desc } from "drizzle-orm";
import { db } from "../db/index";
import { students, users, notes, lessons } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { validate, createStudentSchema, updateStudentSchema } from "../lib/validation";
import { hash } from "bcryptjs";

const router = Router();

router.use(requireAuth); 

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

    const result = await db.select({ student: students })
        .from(students)
        .leftJoin(users, eq(students.userId, users.id))
        .where(
            and(
                ...conditions,
                or(isNull(users.role), ne(users.role, 'admin'))
            )
        )
        .limit(parseInt(limit))
        .offset(offset);
    
    const resultRows = result.map(r => r.student);
    
    const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(students)
        .leftJoin(users, eq(students.userId, users.id))
        .where(
            and(
                ...conditions,
                or(isNull(users.role), ne(users.role, 'admin'))
            )
        );

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

router.get("/me", async (req, res) => {
  try {
    const userId = (req as any).userId;
    let [student] = await db.select().from(students).where(eq(students.userId, userId)).limit(1);
    
    if (!student) {
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user) return res.status(404).json({ error: "User not found" });
        
        const email = user.email;
        const [firstName, lastName] = email.split('@')[0].split('.');
        
        [student] = await db.insert(students).values({
            userId: userId,
            firstName: firstName || "Student",
            lastName: lastName || "User",
            email: email,
            status: "registered"
        }).returning();
    }
    res.json(student);
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal error" });
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

router.get("/:id", async (req, res) => {
  try {
    const student = await db.select().from(students).where(eq(students.id, req.params.id)).limit(1);
    if (student.length === 0) {
      res.status(404).json({ error: "Student not found" });
      return;
    }
    res.json(student[0]);
  } catch (err) {
    console.error("Get student error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id", validate(updateStudentSchema), async (req, res) => {
  try {
    const studentData = req.body;
    const [updated] = await db
      .update(students)
      .set({ ...studentData, updatedAt: new Date() })
      .where(eq(students.id, req.params.id))
      .returning();
    
    if (!updated) {
      res.status(404).json({ error: "Student not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error("Update student error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/lessons", async (req, res) => {
  try {
    const studentLessons = await db.select()
        .from(lessons)
        .where(eq(lessons.studentId, req.params.id))
        .orderBy(desc(lessons.date), desc(lessons.startTime));
    res.json(studentLessons);
  } catch (err) {
    console.error("List lessons error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
