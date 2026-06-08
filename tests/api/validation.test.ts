import { describe, it, expect } from "vitest";
import {
  createStudentSchema,
  createPaymentSchema,
  bookSlotSchema,
  rescheduleSchema,
  respondRescheduleSchema,
  cancelLessonSchema,
  updateLessonSchema,
  moveSlotSchema,
  workingDaySchema,
  createLocationSchema,
} from "../../src/lib/validation";

describe("Validation schemas", () => {
  describe("createStudentSchema", () => {
    it("accepts valid student data", () => {
      const result = createStudentSchema.safeParse({
        firstName: "John",
        lastName: "Doe",
        phone: "+371 12345678",
        email: "john@example.com",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing firstName", () => {
      const result = createStudentSchema.safeParse({
        lastName: "Doe",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid email", () => {
      const result = createStudentSchema.safeParse({
        firstName: "John",
        lastName: "Doe",
        email: "not-an-email",
      });
      expect(result.success).toBe(false);
    });

    it("allows empty strings for optional fields", () => {
      const result = createStudentSchema.safeParse({
        firstName: "John",
        lastName: "Doe",
        email: "",
        phone: "",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("bookSlotSchema", () => {
    it("accepts valid slotId", () => {
      const result = bookSlotSchema.safeParse({
        slotId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing slotId", () => {
      const result = bookSlotSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects non-UUID slotId", () => {
      const result = bookSlotSchema.safeParse({ slotId: "not-a-uuid" });
      expect(result.success).toBe(false);
    });

    it("accepts optional durationMin", () => {
      const result = bookSlotSchema.safeParse({
        slotId: "550e8400-e29b-41d4-a716-446655440000",
        durationMin: 60,
      });
      expect(result.success).toBe(true);
    });

    it("rejects durationMin below 15", () => {
      const result = bookSlotSchema.safeParse({
        slotId: "550e8400-e29b-41d4-a716-446655440000",
        durationMin: 5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("rescheduleSchema", () => {
    it("accepts valid targetSlotId", () => {
      const result = rescheduleSchema.safeParse({
        targetSlotId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing targetSlotId", () => {
      const result = rescheduleSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("respondRescheduleSchema", () => {
    it("accepts approve", () => {
      const result = respondRescheduleSchema.safeParse({ action: "approve" });
      expect(result.success).toBe(true);
    });

    it("accepts decline", () => {
      const result = respondRescheduleSchema.safeParse({ action: "decline" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid action", () => {
      const result = respondRescheduleSchema.safeParse({ action: "maybe" });
      expect(result.success).toBe(false);
    });
  });

  describe("cancelLessonSchema", () => {
    it("accepts empty body", () => {
      const result = cancelLessonSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts reason", () => {
      const result = cancelLessonSchema.safeParse({ reason: "Sick" });
      expect(result.success).toBe(true);
    });

    it("rejects reason over 500 chars", () => {
      const result = cancelLessonSchema.safeParse({ reason: "x".repeat(501) });
      expect(result.success).toBe(false);
    });
  });

  describe("updateLessonSchema", () => {
    it("accepts valid update", () => {
      const result = updateLessonSchema.safeParse({
        notes: "Good progress",
        location: "Riga",
        amount: "30.00",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid amount format", () => {
      const result = updateLessonSchema.safeParse({ amount: "thirty" });
      expect(result.success).toBe(false);
    });
  });

  describe("moveSlotSchema", () => {
    it("accepts valid time range", () => {
      const result = moveSlotSchema.safeParse({
        startTime: "09:00",
        endTime: "10:30",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing startTime", () => {
      const result = moveSlotSchema.safeParse({ endTime: "10:30" });
      expect(result.success).toBe(false);
    });

    it("rejects invalid time format", () => {
      const result = moveSlotSchema.safeParse({
        startTime: "9:00",
        endTime: "10:30",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("workingDaySchema", () => {
    it("accepts valid working day", () => {
      const result = workingDaySchema.safeParse({
        instructorId: "550e8400-e29b-41d4-a716-446655440000",
        date: "2026-05-25",
        isWorking: true,
        startTime: "09:00",
        endTime: "17:00",
      });
      expect(result.success).toBe(true);
    });

    it("accepts nullable times for non-working day", () => {
      const result = workingDaySchema.safeParse({
        instructorId: "550e8400-e29b-41d4-a716-446655440000",
        date: "2026-05-25",
        isWorking: false,
        startTime: null,
        endTime: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("createPaymentSchema", () => {
    it("accepts valid payment", () => {
      const result = createPaymentSchema.safeParse({
        studentId: "550e8400-e29b-41d4-a716-446655440000",
        enrollmentId: "550e8400-e29b-41d4-a716-446655440001",
        amount: "30.00",
        paidAt: "2026-05-23",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid amount", () => {
      const result = createPaymentSchema.safeParse({
        studentId: "550e8400-e29b-41d4-a716-446655440000",
        enrollmentId: "550e8400-e29b-41d4-a716-446655440001",
        amount: "30.999",
        paidAt: "2026-05-23",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createLocationSchema", () => {
    it("accepts valid location", () => {
      const result = createLocationSchema.safeParse({
        name: "Riga Center",
        address: "Brivibas 1",
        lat: 56.95,
        lng: 24.1,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing name", () => {
      const result = createLocationSchema.safeParse({ address: "Brivibas 1" });
      expect(result.success).toBe(false);
    });

    it("rejects lat out of range", () => {
      const result = createLocationSchema.safeParse({
        name: "Test",
        lat: 100,
      });
      expect(result.success).toBe(false);
    });
  });
});
