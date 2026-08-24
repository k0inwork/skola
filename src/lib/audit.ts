import { Request } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

/**
 * Audit logger — records every authorization / business-rule decision
 * as a single JSON line on stdout. In production these go to journald:
 *
 *   journalctl -u skola -o cat | grep AUDIT
 *   journalctl -u skola -o cat | jq 'select(.event=="booking_denied_unpaid_limit")'
 *
 * Each line includes who (userId, email, role, IP), what route, which
 * decision (event), and the relevant context (data).
 */

const userCache = new Map<string, { email: string; role: string }>();

async function resolveUser(userId?: string) {
  if (!userId) return null;
  const cached = userCache.get(userId);
  if (cached) return cached;
  const [u] = await db
    .select({ email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (u) userCache.set(userId, u);
  return u ?? null;
}

export async function audit(req: Request, event: string, data: Record<string, unknown> = {}) {
  try {
    const user = await resolveUser(req.userId);
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      level: "AUDIT",
      event,
      userId: req.userId ?? null,
      userEmail: user?.email ?? null,
      role: req.userRole ?? user?.role ?? null,
      ip: req.ip ?? null,
      method: req.method,
      path: req.originalUrl,
      data,
    }));
  } catch (err) {
    // Audit logging must never break a request
    console.error("AUDIT_LOG_FAILED", event, err instanceof Error ? err.message : err);
  }
}
