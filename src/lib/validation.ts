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
