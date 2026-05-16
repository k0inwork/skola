import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createStudentSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(20).optional(),
  email: z.string().email().max(255).optional(),
  language: z.string().max(5).default("lv"),
  contactMethod: z.string().max(20).optional(),
  source: z.string().max(50).optional(),
  status: z.enum(["lead", "registered", "active", "paused", "completed", "archived"]).default("lead"),
  notes: z.string().optional(),
});

export const updateStudentSchema = createStudentSchema.partial();

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
