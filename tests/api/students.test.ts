import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock db
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../../src/db/index.js", () => ({
  db: {
    select: () => mockSelect(),
    insert: () => mockInsert(),
    update: () => mockUpdate(),
  },
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
import studentRoutes from "../../src/routes/students";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/students", studentRoutes);
  return app;
}

describe("Students API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/students", () => {
    it("blocks client role from listing all students", async () => {
      const app = createApp();
      const { accessToken } = generateTokenPair({ userId: "client-1", role: "client" });
      const res = await request(app)
        .get("/api/students")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/students/me", () => {
    it("returns 401 without token", async () => {
      const app = createApp();
      const res = await request(app).get("/api/students/me");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/students", () => {
    it("rejects invalid data", async () => {
      const app = createApp();
      const { accessToken } = generateTokenPair({ userId: "admin-1", role: "admin" });
      const res = await request(app)
        .post("/api/students")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ firstName: "" }); // missing required lastName
      expect(res.status).toBe(422);
    });

    it("accepts valid student data", async () => {
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "s1", firstName: "Anna", lastName: "Berzina", email: "anna@test.com", status: "lead",
          }]),
        }),
      });

      const app = createApp();
      const { accessToken } = generateTokenPair({ userId: "admin-1", role: "admin" });
      const res = await request(app)
        .post("/api/students")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          firstName: "Anna",
          lastName: "Berzina",
          email: "anna@test.com",
          phone: "+371 12345678",
        });
      expect(res.status).toBe(201);
      expect(res.body.firstName).toBe("Anna");
    });
  });
});
