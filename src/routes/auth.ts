import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { users, googleTokens, students } from "../db/schema";
import { generateTokenPair, requireAuth, verifyToken } from "../middleware/auth";
import crypto from "crypto";

import { config } from "../lib/config.js";

const router = Router();

// --- Google OAuth: generate auth URL ---
router.get("/google/url", (req, res) => {
  const googleClientId = config.GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    res.status(500).json({ error: "Google OAuth is not configured." });
    return;
  }
  const baseUrl = config.APP_URL || `${req.protocol}://${req.get("host")}`;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("oauth_state", state, { httpOnly: true, maxAge: 600000, sameSite: "lax" });
  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "email profile https://www.googleapis.com/auth/calendar",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

// --- Google OAuth: callback ---
router.get("/google/callback", async (req, res) => {
  const { code, state } = req.query;
  const clientId = config.GOOGLE_CLIENT_ID;
  const clientSecret = config.GOOGLE_CLIENT_SECRET;

  const savedState = req.cookies?.oauth_state;
  if (!savedState || !state || savedState !== state) {
    res.status(400).send("Invalid OAuth state.");
    return;
  }
  res.clearCookie("oauth_state");

  if (!clientId || !clientSecret) {
    res.status(500).send("OAuth configuration missing.");
    return;
  }

  const baseUrl = config.APP_URL || `${req.protocol}://${req.get("host")}`;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  if (!code) {
    res.status(400).send("Missing code");
    return;
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code as string,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      console.error(await tokenRes.text());
      res.status(400).send("Failed to exchange code for token");
      return;
    }

    const tokenData = await tokenRes.json();
    const { access_token, refresh_token, expires_in, scope } = tokenData;

    // Get user info
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userInfo = await userRes.json();

    if (!userInfo.email) {
      res.status(400).send("No email found in Google account");
      return;
    }

    // Determine role — admin emails from config
    const isAdmin = config.ADMIN_EMAILS.includes(userInfo.email);

    let [user] = await db.select().from(users).where(eq(users.email, userInfo.email)).limit(1);

    if (!user) {
      const [newUser] = await db.insert(users).values({
        email: userInfo.email,
        role: isAdmin ? "admin" : "client",
      }).returning();
      user = newUser;

      // Create student profile for non-admin
      if (!isAdmin) {
        await db.insert(students).values({
          userId: user.id,
          firstName: userInfo.given_name || "Student",
          lastName: userInfo.family_name || "",
          email: userInfo.email,
        });
      }
    } else {
      // Update role if admin list changed
      if (isAdmin && user.role === "client") {
        await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
        user = { ...user, role: "admin" };
      }

      // Ensure student profile exists for clients
      if (user.role === "client") {
        const [existingStudent] = await db.select().from(students).where(eq(students.userId, user.id));
        if (!existingStudent) {
          await db.insert(students).values({
            userId: user.id,
            firstName: userInfo.given_name || "Student",
            lastName: userInfo.family_name || "",
            email: userInfo.email,
          });
        }
      }
    }

    // Store/upsdate Google tokens
    const [existingToken] = await db.select().from(googleTokens).where(eq(googleTokens.userId, user.id)).limit(1);
    const expiryDate = expires_in ? new Date(Date.now() + expires_in * 1000) : null;

    if (existingToken) {
      await db.update(googleTokens).set({
        accessToken: access_token,
        refreshToken: refresh_token || existingToken.refreshToken,
        expiryDate,
        scope,
        updatedAt: new Date(),
      }).where(eq(googleTokens.id, existingToken.id));
    } else {
      await db.insert(googleTokens).values({
        userId: user.id,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiryDate,
        scope,
      });
    }

    const { accessToken, refreshToken } = generateTokenPair({
      userId: user.id,
      role: user.role,
    });

    const appUrl = config.APP_URL || "/";
    const params = new URLSearchParams({ accessToken, refreshToken, role: user.role });
    res.redirect(`${appUrl}/oauth-callback?${params.toString()}`);
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.status(500).send("Internal server error during OAuth");
  }
});

// --- Token refresh ---
router.post("/refresh", (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(401).json({ error: "Missing refresh token" });
    return;
  }

  try {
    const decoded = verifyToken(refreshToken, true);
    const { accessToken, refreshToken: newRefresh } = generateTokenPair({
      userId: decoded.userId,
      role: decoded.role,
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
