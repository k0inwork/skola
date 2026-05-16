import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { users } from "../db/schema";
import { compare, hash } from "bcryptjs";
import { generateTokenPair, verifyToken, requireAuth } from "../middleware/auth";
import { validate, loginSchema } from "../lib/validation";
import { students } from "../db/schema";
import crypto from "crypto";

import { config } from "../lib/config.js";

const router = Router();

router.get("/google/url", (req, res) => {
  const googleClientId = config.GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    console.error("Missing GOOGLE_CLIENT_ID environment variable.");
    res.status(500).json({ error: "Google OAuth is not configured. Please add GOOGLE_CLIENT_ID to your secrets." });
    return;
  }
  const baseUrl = config.HOST === '0.0.0.0' ? `${req.protocol}://${req.get("host")}` : `http://${config.HOST}:${config.PORT}`;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "email profile",
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

router.get("/google/callback", async (req, res) => {
  const { code } = req.query;
  const clientId = config.GOOGLE_CLIENT_ID;
  const clientSecret = config.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    res.status(500).send("OAuth configuration missing on server.");
    return;
  }

  const baseUrl = config.HOST === '0.0.0.0' ? `${req.protocol}://${req.get("host")}` : `http://${config.HOST}:${config.PORT}`;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  
  if (!code) {
    res.status(400).send("Missing code");
    return;
  }
  
  try {
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
    
    const { access_token } = await tokenRes.json();
    
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userInfo = await userRes.json();
    
    if (!userInfo.email) {
      res.status(400).send("No email found in Google account");
      return;
    }
    
    let [user] = await db.select().from(users).where(eq(users.email, userInfo.email)).limit(1);
    
    if (!user) {
      // create user as client
      const fakePw = await hash(crypto.randomUUID(), 10);
      const [newUser] = await db.insert(users).values({
        email: userInfo.email,
        passwordHash: fakePw,
        role: "client"
      }).returning();
      user = newUser;
      
      // Also create a student profile
      await db.insert(students).values({
        userId: user.id,
        firstName: userInfo.given_name || "Student",
        lastName: userInfo.family_name || "",
        email: userInfo.email,
      });
    } else if (user.role === "client") {
      // Check if student profile needs creating for existing client
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

    const { accessToken, refreshToken } = generateTokenPair({
      userId: user.id,
      role: user.role,
    });
    
    res.send(`
      <html>
        <body>
          <script>
            (function() {
              const payload = ${JSON.stringify({ accessToken, refreshToken, role: user.role })};
              if (window.opener) {
                // Allow both ai.studio and Render origins
                const allowedOrigins = [
                  "https://accounts.google.com", 
                  "https://ais-dev-ligkvq4zk6tql2qp7vyfk7-588853010945.us-east1.run.app",
                  "https://ais-pre-ligkvq4zk6tql2qp7vyfk7-588853010945.us-east1.run.app"
                ];
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', payload: payload }, '*'); 
                window.close();
              } else {
                window.location.href = '/';
              }
            })();
          </script>
          <p>Logged in! You can close this window now.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.status(500).send("Internal server error during OAuth");
  }
});

router.post("/login", validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

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
