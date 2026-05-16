import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { config } from "../lib/config.js";

const SECRET = config.JWT_SECRET || "fallback_secret_for_development";
const REFRESH_SECRET = config.JWT_REFRESH_SECRET || "fallback_refresh_secret";

export function generateTokenPair(payload: { userId: string; role: string }) {
  const accessToken = jwt.sign(payload, SECRET, { expiresIn: "8h" });
  const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: "7d" });
  return { accessToken, refreshToken };
}

export function verifyToken(token: string, isRefresh = false) {
  return jwt.verify(token, isRefresh ? REFRESH_SECRET : SECRET) as { userId: string; role: string };
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
      user?: any;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    req.userRole = payload.role;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.userRole !== "admin") {
      res.status(403).json({ error: "Forbidden: Admin required" });
      return;
    }
    next();
  });
}
