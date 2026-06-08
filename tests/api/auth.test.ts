import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

// Mock the db module before importing routes
vi.mock("../../src/db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock mail
vi.mock("../../src/lib/mail.js", () => ({
  sendNewMessageEmail: vi.fn(),
}));

// Mock config to provide test JWT secrets
vi.mock("../../src/lib/config.js", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret-for-testing-only",
    JWT_REFRESH_SECRET: "test-refresh-secret-for-testing-only",
    GOOGLE_CLIENT_ID: null,
    GOOGLE_CLIENT_SECRET: null,
    ADMIN_EMAILS: ["admin@test.com"],
    PORT: 3001,
    HOST: "0.0.0.0",
    APP_URL: "http://localhost:5173",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  },
}));

import { requireAuth, requireAdmin, generateTokenPair, verifyToken } from "../../src/middleware/auth";

describe("Auth middleware", () => {
  function createApp() {
    const app = express();
    app.use(express.json());

    app.get("/protected", requireAuth, (req, res) => {
      res.json({ userId: req.userId, role: req.userRole });
    });

    app.get("/admin-only", requireAdmin, (req, res) => {
      res.json({ ok: true });
    });

    return app;
  }

  it("rejects requests without token", async () => {
    const app = createApp();
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });

  it("rejects malformed token", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer garbage-token");
    expect(res.status).toBe(401);
  });

  it("accepts valid token", async () => {
    const app = createApp();
    const { accessToken } = generateTokenPair({ userId: "user-1", role: "admin" });
    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: "user-1", role: "admin" });
  });

  it("requireAdmin rejects client role", async () => {
    const app = createApp();
    const { accessToken } = generateTokenPair({ userId: "user-1", role: "client" });
    const res = await request(app)
      .get("/admin-only")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("requireAdmin accepts admin role", async () => {
    const app = createApp();
    const { accessToken } = generateTokenPair({ userId: "admin-1", role: "admin" });
    const res = await request(app)
      .get("/admin-only")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it("requireAdmin rejects instructor role", async () => {
    const app = createApp();
    const { accessToken } = generateTokenPair({ userId: "inst-1", role: "instructor" });
    const res = await request(app)
      .get("/admin-only")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe("Token generation", () => {
  it("generates valid access and refresh tokens", () => {
    const { accessToken, refreshToken } = generateTokenPair({ userId: "u1", role: "client" });

    const accessPayload = verifyToken(accessToken);
    expect(accessPayload.userId).toBe("u1");
    expect(accessPayload.role).toBe("client");

    const refreshPayload = verifyToken(refreshToken, true);
    expect(refreshPayload.userId).toBe("u1");
  });

  it("rejects refresh token with wrong verification", () => {
    const { accessToken } = generateTokenPair({ userId: "u1", role: "client" });
    expect(() => verifyToken(accessToken, true)).toThrow();
  });
});
