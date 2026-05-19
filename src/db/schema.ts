import { pgTable, text, timestamp, boolean, integer, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("client"), // Enum check moved to validation logic for simplicity or use custom pgEnum
  createdAt: timestamp("created_at")
    .notNull()
    .defaultNow(),
});

export const students = pgTable("students", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  language: text("language").default("lv"),
  contactMethod: text("contact_method"),
  source: text("source"),
  status: text("status").default("lead"),
  notes: text("notes"),
  userId: uuid("user_id").references(() => users.id),
  createdAt: timestamp("created_at")
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at"),
  deletedAt: timestamp("deleted_at"),
});

export const enrollments = pgTable("enrollments", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id),
  courseTypeId: text("course_type_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  expiryDate: text("expiry_date"),
  status: text("status").default("draft"),
  packagePrice: text("package_price").default("0"),
  createdAt: timestamp("created_at")
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const lessons = pgTable("lessons", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  enrollmentId: uuid("enrollment_id")
    .notNull()
    .references(() => enrollments.id),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id),
  instructorId: uuid("instructor_id")
    .references(() => users.id),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  durationMin: integer("duration_min").notNull().default(60),
  location: text("location"),
  vehicle: text("vehicle"),
  notes: text("notes"),
  status: text("status").default("scheduled"), // scheduled, rescheduled, reschedule_pending, canceled
  paid: boolean("paid").default(false),
  amount: text("amount"),
  outcome: text("outcome"),
  proposedDate: text("proposed_date"),
  proposedStartTime: text("proposed_start_time"),
  proposedEndTime: text("proposed_end_time"),
  createdAt: timestamp("created_at")
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const instructorWorkingDays = pgTable("instructor_working_days", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  instructorId: uuid("instructor_id")
    .notNull()
    .references(() => users.id),
  date: text("date").notNull(),
  isWorking: boolean("is_working").notNull().default(true),
  startTime: text("start_time").default("09:00"),
  endTime: text("end_time").default("17:00"),
  slotDurationMin: integer("slot_duration_min").default(60),
});

export const payments = pgTable("payments", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id),
  enrollmentId: uuid("enrollment_id")
    .notNull()
    .references(() => enrollments.id),
  amount: text("amount").notNull(),
  paidAt: text("paid_at").notNull(),
  method: text("method"),
  reference: text("reference"),
  comment: text("comment"),
  status: text("status").default("pending"),
});

export const progress = pgTable("progress", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id),
  enrollmentId: uuid("enrollment_id")
    .notNull()
    .references(() => enrollments.id),
  type: text("type").notNull(),
  milestone: text("milestone").notNull(),
  result: text("result"),
  achievedAt: text("achieved_at"),
  comment: text("comment"),
});

export const locations = pgTable("locations", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  name: text("name").notNull(),
  address: text("address"),
  lat: text("latitude"),
  lng: text("longitude"),
  createdAt: timestamp("created_at")
    .notNull()
    .defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => users.id),
  recipientId: uuid("recipient_id")
    .notNull()
    .references(() => users.id),
  lessonId: uuid("lesson_id")
    .references(() => lessons.id),
  content: text("content").notNull(),
  type: text("type").default("chat"), // chat, reschedule_request, reschedule_approved, reschedule_declined
  proposedDate: text("proposed_date"),
  proposedStartTime: text("proposed_start_time"),
  proposedEndTime: text("proposed_end_time"),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at")
    .notNull()
    .defaultNow(),
});

export const notes = pgTable("notes", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id),
  content: text("content").notNull(),
  type: text("type").default("general"),
  createdAt: timestamp("created_at")
    .notNull()
    .defaultNow(),
});

export const slots = pgTable("slots", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  instructorId: uuid("instructor_id")
    .notNull()
    .references(() => users.id),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  isBooked: boolean("is_booked").default(false),
  lessonId: uuid("lesson_id")
    .references(() => lessons.id),
  createdAt: timestamp("created_at")
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at"),
});
