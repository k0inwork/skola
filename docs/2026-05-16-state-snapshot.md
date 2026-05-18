# Skola — State Snapshot (2026-05-16)

## 1. User Stories

### Instructor / Admin

- Log in with email/password or Google OAuth
- View dashboard with key metrics (lessons, students, revenue)
- Manage students (CRUD, link to user accounts, notes)
- Manage weekly calendar — configure working days, slot duration, start/end times
- Drag-and-drop lessons to reschedule (instant, student notified)
- View and respond to student reschedule requests (approve/decline inline)
- Cancel lessons with reason (student notified)
- Track payments per lesson, mark as paid
- Real-time chat with students
- Request reschedules via messages with proposed times
- Notification bell with recent calendar activity (bookings, cancellations, reschedule requests)
- "New" badge on recently booked lessons

### Student (Client)

- Log in (email/password or Google OAuth)
- View simplified student dashboard
- Book available lesson slots from instructor's calendar
- Cancel own booked lessons
- Request a reschedule (pending instructor approval)
- View pending reschedule requests with proposed new times
- Real-time chat with instructor
- View and edit profile

---

## 2. Covered Functionality

### Auth

- JWT access tokens (8h) + refresh tokens (7d)
- Auto-refresh on token expiry, auto-logout on 401
- Google OAuth login
- Role-based access: `admin`, `instructor`, `client`

### Calendar (Instructor)

- Weekly view with configurable working days
- Per-day start/end time and slot duration settings
- Explicit "off" days (hides bookable slots, shows existing lessons only)
- Drag-and-drop reschedule (instant for instructor, notification sent to student)
- Pending reschedule requests shown with amber dashed border, proposed time, inline approve/decline buttons
- "New" badge on lessons created since last calendar visit
- Notification bell dropdown with last 15 calendar events

### Calendar (Student)

- Weekly slot grid for selected instructor
- Book available slots with confirmation dialog
- Cancel own lessons with confirmation
- Request reschedule — sets `reschedule_pending` status with proposed times
- Pending requests shown with amber indicator and proposed new time

### Real-time (Socket.IO)

- `new_message` — updates unread badge
- `calendar_update` — live refresh on booking/cancellation/reschedule, increments notification badge

### Messaging

- Conversation list with unread counts
- Real-time chat
- Reschedule requests embedded in messages with proposed times
- Approve/decline reschedule from message context

### Payments

- Per-lesson payment tracking (amount, method, reference, comment)
- Mark lessons as paid
- Payment history per student/enrollment

### Students

- CRUD with first/last name, phone, email, language, contact method, source, status, notes
- Link students to user accounts (for client login)
- Enrollment tracking (course type, start/end dates, package price)

### Dashboard

- Instructor dashboard: upcoming lessons, stats
- Student dashboard: upcoming lessons, basic info

### Mobile / Responsive

- Desktop: sidebar navigation
- Mobile: bottom tab bar, touch-friendly calendar grid

### Database

- PostgreSQL + Drizzle ORM
- 10 tables: `users`, `students`, `enrollments`, `lessons`, `instructor_working_days`, `payments`, `progress`, `locations`, `messages`, `notes`
- Migration system via `drizzle-kit`

---

## 3. Areas to Explore Further

### High Priority

| Area | Rationale |
|------|-----------|
| Email/SMS notifications | All notifications are in-app only. Students/instructors miss confirmations, cancellations, and reschedule requests if offline. Email (Resend/Nodemailer) or SMS would close the loop. |
| Automated lesson reminders | Send reminder X hours before a lesson (email/push). Reduces no-shows. |
| Production deployment | Currently running dev mode (`tsx server.ts` + Vite dev server). Needs built assets, PM2/systemd, reverse proxy, HTTPS hardening. |

### Medium Priority

| Area | Rationale |
|------|-----------|
| Recurring lessons / series booking | Students typically book the same weekly slot. Currently each is manual. A "book recurring" option saves time. |
| Lesson outcomes & progress tracking | `progress` table and `outcome` field exist in schema but aren't in the UI. Tracking covered material, student performance, and milestones rounds out the teaching workflow. |
| Invoice / receipt generation | Payment tracking exists but no PDF invoice/receipt. Useful for students needing proof of payment. |
| Multi-instructor per student | Students currently pick one instructor. Supporting multiple (theory vs practice) reflects real driving school operations. |
| Student self-service enrollment | Students are created by instructors. Self-service signup with course package selection reduces admin overhead. |

### Infrastructure / Security

| Area | Rationale |
|------|-----------|
| Rate limiting | No rate limiting on API routes. Public-facing at `skola.ddns.net`. |
| CSRF protection | No CSRF tokens. Relevant for cookie-based sessions. |
| Error monitoring | No Sentry or equivalent. Silent production failures are invisible. |
| Automated backups | PostgreSQL data has no visible backup strategy. |
| CI/CD | No pipeline. Deploys are manual SSH + git pull. |
