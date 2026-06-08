import jwt from "jsonwebtoken";

// Use a fixed secret for tests
const TEST_SECRET = "test-jwt-secret-for-testing-only";
const TEST_REFRESH_SECRET = "test-refresh-secret-for-testing-only";

export function makeToken(payload: { userId: string; role: string }) {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: "1h" });
}

export function makeAdminToken(userId = "admin-001") {
  return makeToken({ userId, role: "admin" });
}

export function makeInstructorToken(userId = "instructor-001") {
  return makeToken({ userId, role: "instructor" });
}

export function makeClientToken(userId = "client-001") {
  return makeToken({ userId, role: "client" });
}

// Re-export TEST_SECRET so the mock auth middleware can use it
export { TEST_SECRET, TEST_REFRESH_SECRET };
