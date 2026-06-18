import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createStudentSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(20).optional().nullable().or(z.literal('')),
  email: z.string().email().max(255).optional().nullable().or(z.literal('')),
  language: z.string().max(5).default("lv"),
  contactMethod: z.string().max(20).optional(),
  source: z.string().max(50).optional(),
  status: z.enum(["lead", "registered", "active", "paused", "completed", "archived", "blocked"]).default("lead"),
  notes: z.string().optional(),
  createAccount: z.boolean().optional(),
  password: z.string().min(6).optional().or(z.literal('')),
});

export const updateStudentSchema = createStudentSchema.partial();

export const createPaymentSchema = z.object({
  studentId: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  paidAt: z.string().date(),
  method: z.string().max(30).optional(),
  reference: z.string().max(100).optional(),
  comment: z.string().optional(),
  status: z.enum(["pending", "paid", "partial", "overdue", "refunded"]).default("pending"),
});

export const updatePaymentSchema = z.object({
  method: z.string().max(30).optional(),
  reference: z.string().max(100).optional(),
  comment: z.string().optional(),
  status: z.enum(["pending", "paid", "partial", "overdue", "refunded"]).optional(),
});

export const bookSlotSchema = z.object({
  slotId: z.string().uuid(),
  enrollmentId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  instructorId: z.string().uuid().optional(),
  durationMin: z.number().int().min(15).max(480).optional(),
});

export const rescheduleSchema = z.object({
  targetSlotId: z.string().uuid(),
});

export const respondRescheduleSchema = z.object({
  action: z.enum(["approve", "decline"]),
});

export const cancelLessonSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const updateLessonSchema = z.object({
  notes: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().or(z.literal("")),
});

export const moveSlotSchema = z.object({
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  city: z.string().max(100).optional(),
  location: z.string().max(200).nullable().optional(),
});

export const workingDaySchema = z.object({
  instructorId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isWorking: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  slotDurationMin: z.number().int().min(15).max(480).optional(),
  location: z.string().max(200).optional().nullable(),
  vehicle: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  cities: z.array(z.string().max(100)).max(10).optional(),
});

export const copyWeekSchema = z.object({
  instructorId: z.string().uuid(),
  sourceWeekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetWeekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const createLocationSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  city: z.string().max(100).optional(),
});

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(422).json({
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
