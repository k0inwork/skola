import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { users } from "../db/schema";
import { compare, hash } from "bcryptjs";
import { generateTokenPair, verifyToken, requireAuth } from "../middleware/auth";
import { validate, loginSchema } from "../lib/validation";
import { students } from "../db/schema";
import crypto from "crypto";

const router = Router();

router.get("/google/url", (req, res) => {
  const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "email profile",
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

router.get("/google/callback", async (req, res) => {
  const { code } = req.query;
  const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
  
  if (!code) {
    res.status(400).send("Missing code");
    return;
  }
  
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
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
    
    let user = await db.query.users?.findFirst({
      where: eq(users.email, userInfo.email),
    });
    
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
    }

    const { accessToken, refreshToken } = generateTokenPair({
      userId: user.id,
      role: user.role,
    });
    
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', payload: { accessToken: '${accessToken}', refreshToken: '${refreshToken}', role: '${user.role}' } }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
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
