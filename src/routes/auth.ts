import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { users } from "../db/schema";
import { compare, hash } from "bcryptjs";
import { generateTokenPair, verifyToken, requireAuth } from "../middleware/auth";
import { validate, loginSchema } from "../lib/validation";

const router = Router();

router.post("/login", validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await db.query.users?.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const { accessToken, refreshToken } = generateTokenPair({
      userId: user.id,
      role: user.role,
    });

    res.json({ accessToken, refreshToken, role: user.role });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/refresh", (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(401).json({ error: "Missing refresh token" });
    return;
  }

  try {
    const payload = verifyToken(refreshToken, true);
    const { accessToken, refreshToken: newRefresh } = generateTokenPair({
      userId: payload.userId,
      role: payload.role,
    });
    res.json({ accessToken, refreshToken: newRefresh });
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ userId: req.userId, role: req.userRole });
});

export default router;
