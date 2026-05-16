import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "instructor", "client"] }).notNull().default("client"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const students = sqliteTable("students", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  language: text("language").default("lv"),
  contactMethod: text("contact_method"),
  source: text("source"),
  status: text("status", { enum: ["lead", "registered", "active", "paused", "completed", "archived"] }).default("lead"),
  notes: text("notes"),
  userId: text("user_id").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const enrollments = sqliteTable("enrollments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id),
  courseTypeId: text("course_type_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  expiryDate: text("expiry_date"),
  status: text("status", { enum: ["draft", "active", "paused", "finished", "expired", "archived"] }).default("draft"),
  packagePrice: text("package_price").default("0"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const lessons = sqliteTable("lessons", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  enrollmentId: text("enrollment_id")
    .notNull()
    .references(() => enrollments.id),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  durationMin: integer("duration_min").notNull().default(60),
  location: text("location"),
  vehicle: text("vehicle"),
  notes: text("notes"),
  status: text("status", { enum: ["scheduled", "completed", "canceled", "missed", "rescheduled"] }).default("scheduled"),
  outcome: text("outcome"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const payments = sqliteTable("payments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id),
  enrollmentId: text("enrollment_id")
    .notNull()
    .references(() => enrollments.id),
  amount: text("amount").notNull(),
  paidAt: text("paid_at").notNull(),
  method: text("method"),
  reference: text("reference"),
  comment: text("comment"),
  status: text("status", { enum: ["pending", "paid", "partial", "overdue", "refunded"] }).default("pending"),
});

export const progress = sqliteTable("progress", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id),
  enrollmentId: text("enrollment_id")
    .notNull()
    .references(() => enrollments.id),
  type: text("type", { enum: ["theory", "practice"] }).notNull(),
  milestone: text("milestone").notNull(),
  result: text("result"),
  achievedAt: text("achieved_at"),
  comment: text("comment"),
});

export const notes = sqliteTable("notes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id),
  content: text("content").notNull(),
  type: text("type", { enum: ["general", "call", "email", "meeting"] }).default("general"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
