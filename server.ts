import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { exec } from "child_process";
import fs from "fs";
import { Server } from "socket.io";
import { db } from "./src/db/index.js";
import { users } from "./src/db/schema.js";
import { requireAuth } from "./src/middleware/auth.js";
import authRoutes from "./src/routes/auth.js";
import studentRoutes from "./src/routes/students.js";
import paymentRoutes from "./src/routes/payments.js";
import dashboardRoutes from "./src/routes/dashboard.js";
import calendarRoutes from "./src/routes/calendar.js";
import messageRoutes from "./src/routes/messages.js";

import { config } from "./src/lib/config.js";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);

  const PORT = config.PORT;
  const HOST = config.HOST;
  const APP_URL = config.APP_URL;

  const allowedOrigins = [
    APP_URL,
    "http://localhost:5173",
    "http://localhost:3000",
  ].filter(Boolean);

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"]
    }
  });

  app.set("io", io);

  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }));
  app.use(express.json());

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many login attempts. Try again in 15 minutes." },
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // --- GitHub webhook for auto-deploy ---
  app.post("/webhook", (req, res) => {
    const ref = req.body?.ref;
    if (!ref || !ref.endsWith("/main")) {
      return res.json({ status: "ignored", ref });
    }
    res.json({ status: "deploying" });
    exec("nohup bash scripts/deploy.sh > /tmp/skola-deploy-hook.log 2>&1 &", { cwd: process.env.SKOLA_DIR || "/root/skola" }, (err) => {
      if (err) console.error("deploy launch error:", err.message);
    });
  });

  // --- Deploy logs ---
  const LOGDIR = "/tmp/skola-deploy";
  app.get("/deploy/logs", (req, res) => {
    try {
      const files = fs.readdirSync(LOGDIR).filter(f => f.endsWith(".log")).sort().reverse();
      res.json({ logs: files });
    } catch {
      res.json({ logs: [] });
    }
  });
  app.get("/deploy/logs/:name", (req, res) => {
    const name = req.params.name.replace(/[^a-zA-Z0-9._-]/g, "");
    try {
      res.type("text/plain").send(fs.readFileSync(`${LOGDIR}/${name}`, "utf8"));
    } catch {
      res.status(404).json({ error: "log not found" });
    }
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/auth/login", loginLimiter);
  app.use("/api/students", studentRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/calendar", calendarRoutes);
  app.use("/api/messages", messageRoutes);

  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      // Use standard SQLite select but filter fields manually or via query
      const allUsers = await db.select({
        id: users.id,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt
      }).from(users);
      res.json(allUsers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
    // Join a room based on user ID for targeted messaging
    socket.on("join", (userId: string) => {
      socket.join(`user:${userId}`);
    });
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}

startServer();
