import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mocks — vi.mock factories are hoisted, so use vi.fn() directly
vi.mock("../../src/db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../src/lib/mail.js", () => ({
  sendNewMessageEmail: vi.fn(),
}));

vi.mock("../../src/lib/config.js", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret-for-testing-only",
    JWT_REFRESH_SECRET: "test-refresh-secret-for-testing-only",
    GOOGLE_CLIENT_ID: null,
    ADMIN_EMAILS: [],
    PORT: 3001,
    HOST: "0.0.0.0",
    APP_URL: "http://localhost:5173",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  },
}));

import { generateTokenPair } from "../../src/middleware/auth";
import calendarRoutes from "../../src/routes/calendar";

function createApp() {
  const app = express();
  app.use(express.json());
  // Mock io for socket
  app.set("io", { emit: vi.fn() });
  app.use("/api/calendar", calendarRoutes);
  return app;
}

describe("Calendar API validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/calendar/book", () => {
    it("rejects missing slotId", async () => {
      const app = createApp();
      const { accessToken } = generateTokenPair({ userId: "admin-1", role: "admin" });
      const res = await request(app)
        .post("/api/calendar/book")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({});
      expect(res.status).toBe(422);
    });

    it("rejects invalid slotId format", async () => {
      const app = createApp();
      const { accessToken } = generateTokenPair({ userId: "admin-1", role: "admin" });
      const res = await request(app)
        .post("/api/calendar/book")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ slotId: "not-a-uuid" });
      expect(res.status).toBe(422);
    });
  });

  describe("POST /api/calendar/working-days", () => {
    it("rejects missing fields", async () => {
      const app = createApp();
      const { accessToken } = generateTokenPair({ userId: "admin-1", role: "admin" });
      const res = await request(app)
        .post("/api/calendar/working-days")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ instructorId: "550e8400-e29b-41d4-a716-446655440000" });
      expect(res.status).toBe(422);
    });

    it("rejects invalid date format", async () => {
      const app = createApp();
      const { accessToken } = generateTokenPair({ userId: "admin-1", role: "admin" });
      const res = await request(app)
        .post("/api/calendar/working-days")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          instructorId: "550e8400-e29b-41d4-a716-446655440000",
          date: "25-05-2026",
          isWorking: true,
          startTime: "09:00",
          endTime: "17:00",
        });
      expect(res.status).toBe(422);
    });
  });

  describe("POST /api/calendar/reschedule-lesson/:lessonId", () => {
    it("rejects missing targetSlotId", async () => {
      const app = createApp();
      const { accessToken } = generateTokenPair({ userId: "admin-1", role: "admin" });
      const res = await request(app)
        .post("/api/calendar/reschedule-lesson/lesson-1")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({});
      expect(res.status).toBe(422);
    });
  });

  describe("POST /api/calendar/reschedule-lesson/:lessonId/respond", () => {
    it("rejects invalid action", async () => {
      const app = createApp();
      const { accessToken } = generateTokenPair({ userId: "admin-1", role: "admin" });
      const res = await request(app)
        .post("/api/calendar/reschedule-lesson/lesson-1/respond")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ action: "maybe" });
      expect(res.status).toBe(422);
    });
  });

  describe("PATCH /api/calendar/slots/:slotId", () => {
    it("rejects missing startTime", async () => {
      const app = createApp();
      const { accessToken } = generateTokenPair({ userId: "admin-1", role: "admin" });
      const res = await request(app)
        .patch("/api/calendar/slots/slot-1")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ endTime: "10:30" });
      expect(res.status).toBe(422);
    });

    it("rejects invalid time format", async () => {
      const app = createApp();
      const { accessToken } = generateTokenPair({ userId: "admin-1", role: "admin" });
      const res = await request(app)
        .patch("/api/calendar/slots/slot-1")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ startTime: "9:00", endTime: "10:30" });
      expect(res.status).toBe(422);
    });
  });

  describe("POST /api/calendar/locations", () => {
    it("rejects missing name", async () => {
      const app = createApp();
      const { accessToken } = generateTokenPair({ userId: "admin-1", role: "admin" });
      const res = await request(app)
        .post("/api/calendar/locations")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ address: "Brivibas 1" });
      expect(res.status).toBe(422);
    });
  });
});
