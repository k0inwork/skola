# Skola

Driving school management app for Olaines autoskola. Live at **[skola.ddns.net](https://skola.ddns.net)**.

Express + React (Vite) SPA with Socket.IO real-time messaging, PostgreSQL via drizzle-orm, and Google Calendar integration.

## Features

- **Google OAuth login** — full-page redirect flow, returning-user welcome
- **Instructor calendar** — working day management, multi-city slots, drag-to-edit
- **Student calendar** — self-service booking, cancellation, reschedule requests
- **Phone capture gate** — students must provide a phone number before their first booking
- **24-hour cancellation policy** — amber warning shown when cancelling within 24h
- **Rescheduling workflow** — propose / approve / decline via in-app messages
- **Real-time messaging** — Socket.IO between students and instructors, unread badges
- **Payments tracking** — per-enrollment payment records
- **Student blocking** — instructors can block/unblock students
- **Unpaid booking limit** — students with no paid lessons can hold at most one slot
- **Email notifications** — nodemailer to students on new messages
- **Mobile-responsive** — bottom bar layout for phones

## Roles

- `admin` — full access
- `instructor` — calendar management, messaging
- `client` (student) — view bookings, request reschedules, message instructor

## Tech Stack

- **Backend:** Express 4, Socket.IO, JWT (httpOnly cookies) + refresh tokens, drizzle-orm
- **Frontend:** React 19, Vite 6, Zustand, react-router-dom, Tailwind CSS 4, lucide-react
- **DB:** PostgreSQL 16 (`pg_dump -Fc` backups, `drizzle-kit` migrations)
- **Auth:** Google OAuth 2.0, bcryptjs for email/password fallback
- **Maps:** Leaflet + react-leaflet for location picking

## Project Structure

```
server.ts               Express entry — serves API + Vite dev middleware
src/routes/             API: auth, students, payments, dashboard, calendar, messages
src/pages/              React pages (role-specific dashboards & calendars)
src/db/schema.ts        drizzle-orm schema (users, students, enrollments, lessons, ...)
src/middleware/auth.ts  JWT auth + role guards + IDOR checks
src/lib/                Config, Zustand store, validation (zod)
scripts/deploy.sh       Auto-deploy webhook target
```

## Run Locally

**Prerequisites:** Node.js 20+, PostgreSQL 14+

1. Install dependencies:
   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in values (DATABASE_URL, JWT secrets, Google OAuth credentials, SMTP, etc.).

3. Push the schema to your database:
   ```sh
   npx drizzle-kit push
   ```

4. Start the dev server:
   ```sh
   npm run dev
   ```

The app runs on `http://localhost:3000`.

## Scripts

| Command               | Description                                      |
| --------------------- | ------------------------------------------------ |
| `npm run dev`         | Dev server with Vite HMR                         |
| `npm run build`       | `vite build` + `esbuild` server bundle to `dist/`|
| `npm start`           | Run production server (`node dist/server.cjs`)   |
| `npm run lint`        | TypeScript type-check (`tsc --noEmit`)           |
| `npm test`            | Vitest test runner                               |

## Deployment

Production runs on a RackNerd VPS behind Caddy (auto-TLS):

- **Domain:** skola.ddns.net
- **Services:** `skola.service` + `caddy.service` (systemd)
- **Auto-deploy:** GitHub webhook → `POST /webhook` → `scripts/deploy.sh` (run via `systemd-run` to survive the service restart)
- **DB backups:** daily 03:00 server time via cron, 7 daily + 4 weekly retention (`/var/backups/skola-db/`)
