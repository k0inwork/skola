import { Router } from "express";
import { eq, and, or, desc, sql, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { messages, users, students, lessons, slots } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { sendNewMessageEmail } from "../lib/mail.js";

const router = Router();

router.use(requireAuth);

// Get conversations list (who you chat with + last message)
router.get("/conversations", async (req, res) => {
  try {
    const userId = req.userId;

    // Get all messages involving this user
    const allMessages = await db.select({
      id: messages.id,
      senderId: messages.senderId,
      recipientId: messages.recipientId,
      content: messages.content,
      type: messages.type,
      read: messages.read,
      proposedDate: messages.proposedDate,
      proposedStartTime: messages.proposedStartTime,
      proposedEndTime: messages.proposedEndTime,
      lessonId: messages.lessonId,
      createdAt: messages.createdAt,
    })
      .from(messages)
      .where(or(eq(messages.senderId, userId), eq(messages.recipientId, userId)))
      .orderBy(desc(messages.createdAt));

    // Group by conversation partner
    const convMap = new Map<string, {
      partnerId: string;
      partnerName: string;
      lastMessage: typeof allMessages[0];
      unreadCount: number;
    }>();

    for (const msg of allMessages) {
      const partnerId = msg.senderId === userId ? msg.recipientId : msg.senderId;
      if (!convMap.has(partnerId)) {
        // Get partner name
        const [partner] = await db.select().from(users).where(eq(users.id, partnerId)).limit(1);
        let partnerName = partner?.email || "Unknown";
        if (partner) {
          const [student] = await db.select().from(students).where(eq(students.userId, partnerId)).limit(1);
          if (student) partnerName = `${student.firstName} ${student.lastName}`;
        }

        convMap.set(partnerId, {
          partnerId,
          partnerName,
          lastMessage: msg,
          unreadCount: 0,
        });
      }

      const conv = convMap.get(partnerId)!;
      if (msg.recipientId === userId && !msg.read) {
        conv.unreadCount++;
      }
    }

    res.json(Array.from(convMap.values()));
  } catch (err) {
    console.error("Get conversations error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get messages with a specific user
router.get("/:partnerId", async (req, res) => {
  try {
    const userId = req.userId;
    const { partnerId } = req.params;
    const { limit = "50", before } = req.query as Record<string, string>;

    const conditions = [
      or(
        and(eq(messages.senderId, userId), eq(messages.recipientId, partnerId)),
        and(eq(messages.senderId, partnerId), eq(messages.recipientId, userId))
      )
    ];

    const msgs = await db.select()
      .from(messages)
      .where(conditions[0])
      .orderBy(desc(messages.createdAt))
      .limit(parseInt(limit));

    // Mark unread messages as read
    await db.update(messages)
      .set({ read: true })
      .where(and(
        eq(messages.senderId, partnerId),
        eq(messages.recipientId, userId),
        eq(messages.read, false)
      ));

    // Return in chronological order
    res.json(msgs.reverse());
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Send a message
router.post("/", async (req, res) => {
  try {
    const { recipientId, content, type, lessonId, proposedDate, proposedStartTime, proposedEndTime } = req.body;

    if (!recipientId || !content) {
      res.status(400).json({ error: "recipientId and content are required" });
      return;
    }

    // Client can only message instructors/admins
    if (req.userRole === "client") {
      const [recipientUser] = await db.select().from(users).where(eq(users.id, recipientId)).limit(1);
      if (!recipientUser || (recipientUser.role !== "instructor" && recipientUser.role !== "admin")) {
        res.status(403).json({ error: "Forbidden: clients can only message instructors" });
        return;
      }
    }

    // Validate target slot for reschedule requests
    if (type === "reschedule_request" && proposedDate && proposedStartTime) {
      const [targetSlot] = await db.select().from(slots).where(and(
        eq(slots.isBooked, false),
        eq(slots.date, proposedDate),
        eq(slots.startTime, proposedStartTime)
      )).limit(1);
      if (!targetSlot) {
        res.status(400).json({ error: "No available slot found for the proposed date and time. Please pick a time from the calendar." });
        return;
      }
    }

    const [msg] = await db.insert(messages).values({
      senderId: req.userId,
      recipientId,
      content,
      type: type || "chat",
      lessonId: lessonId || null,
      proposedDate: proposedDate || null,
      proposedStartTime: proposedStartTime || null,
      proposedEndTime: proposedEndTime || null,
    }).returning();

    // Emit real-time via Socket.IO
    const io = req.app.get("io");
    if (io) {
      io.emit("new_message", { message: msg, recipientId });
    }

    // Send email notification to the recipient if they are a student (client)
    try {
      const [recipientUser] = await db.select().from(users).where(eq(users.id, recipientId)).limit(1);
      if (recipientUser?.role === "client" && recipientUser.email) {
        const [senderUser] = await db.select().from(users).where(eq(users.id, req.userId)).limit(1);
        let senderName = senderUser?.email || "Instructors";
        const [senderStudent] = await db.select().from(students).where(eq(students.userId, req.userId)).limit(1);
        if (senderStudent) senderName = `${senderStudent.firstName} ${senderStudent.lastName}`;

        await sendNewMessageEmail(recipientUser.email, senderName, content);
      }
    } catch (mailErr) {
      console.error("Email notification error:", mailErr);
    }

    res.status(201).json(msg);
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Handle reschedule request (approve/decline by instructor)
router.post("/:messageId/respond", async (req, res) => {
  try {
    const { messageId } = req.params;
    const { action } = req.body; // "approve" or "decline"

    if (!action || !["approve", "decline"].includes(action)) {
      res.status(400).json({ error: "action must be 'approve' or 'decline'" });
      return;
    }

    const [originalMsg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!originalMsg) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    // Only the recipient (instructor) can respond
    if (originalMsg.recipientId !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (action === "approve" && originalMsg.type === "reschedule_request" && originalMsg.lessonId) {
      const [oldLesson] = await db.select().from(lessons).where(eq(lessons.id, originalMsg.lessonId)).limit(1);
      const oldDate = oldLesson?.date;

      // Free old slot(s)
      await db.update(slots)
        .set({ isBooked: false, lessonId: null })
        .where(and(eq(slots.lessonId, originalMsg.lessonId), eq(slots.isBooked, true)));

      // Find target slot for proposed date/time
      if (oldLesson) {
        const [targetSlot] = await db.select().from(slots).where(and(
          eq(slots.instructorId, oldLesson.instructorId),
          eq(slots.date, originalMsg.proposedDate!),
          eq(slots.startTime, originalMsg.proposedStartTime!),
          eq(slots.isBooked, false)
        )).limit(1);

        if (targetSlot) {
          await db.update(slots)
            .set({ isBooked: true, lessonId: originalMsg.lessonId })
            .where(eq(slots.id, targetSlot.id));
        }
      }

      // Update lesson
      await db.update(lessons)
        .set({
          date: originalMsg.proposedDate!,
          startTime: originalMsg.proposedStartTime!,
          endTime: originalMsg.proposedEndTime!,
          status: "rescheduled",
          proposedDate: null,
          proposedStartTime: null,
          proposedEndTime: null,
        })
        .where(eq(lessons.id, originalMsg.lessonId));

      // Emit calendar update for both old and new dates
      const io = req.app.get("io");
      if (io && oldLesson) {
        io.emit("calendar_update", { instructorId: oldLesson.instructorId, date: oldDate });
        if (oldDate !== originalMsg.proposedDate) {
          io.emit("calendar_update", { instructorId: oldLesson.instructorId, date: originalMsg.proposedDate });
        }
      }
    }

    if (action === "decline" && originalMsg.lessonId) {
      // If lesson is in reschedule_pending, revert it
      const [lesson] = await db.select().from(lessons).where(eq(lessons.id, originalMsg.lessonId)).limit(1);
      if (lesson?.status === "reschedule_pending") {
        // Free the held target slot
        await db.update(slots)
          .set({ isBooked: false, lessonId: null })
          .where(and(eq(slots.lessonId, originalMsg.lessonId), eq(slots.isBooked, true)));

        // Revert lesson
        await db.update(lessons)
          .set({ status: "scheduled", proposedDate: null, proposedStartTime: null, proposedEndTime: null })
          .where(eq(lessons.id, originalMsg.lessonId));

        // Re-link original slot
        const [originalSlot] = await db.select().from(slots).where(and(
          eq(slots.instructorId, lesson.instructorId),
          eq(slots.date, lesson.date),
          eq(slots.startTime, lesson.startTime),
          eq(slots.isBooked, false)
        )).limit(1);

        if (originalSlot) {
          await db.update(slots)
            .set({ isBooked: true, lessonId: originalMsg.lessonId })
            .where(eq(slots.id, originalSlot.id));
        }

        const io = req.app.get("io");
        if (io) {
          io.emit("calendar_update", { instructorId: lesson.instructorId, date: lesson.date });
          if (lesson.proposedDate && lesson.proposedDate !== lesson.date) {
            io.emit("calendar_update", { instructorId: lesson.instructorId, date: lesson.proposedDate });
          }
        }
      }
    }

    // Send response message
    const responseType = action === "approve" ? "reschedule_approved" : "reschedule_declined";
    const [responseMsg] = await db.insert(messages).values({
      senderId: req.userId,
      recipientId: originalMsg.senderId,
      content: action === "approve"
        ? `Reschedule approved! Lesson moved to ${originalMsg.proposedDate} ${originalMsg.proposedStartTime}-${originalMsg.proposedEndTime}`
        : "Reschedule request declined.",
      type: responseType,
      lessonId: originalMsg.lessonId,
    }).returning();

    const io = req.app.get("io");
    if (io) {
      io.emit("new_message", { message: responseMsg, recipientId: originalMsg.senderId });
      if (action === "approve" && originalMsg.lessonId) {
        const [lesson] = await db.select().from(lessons).where(eq(lessons.id, originalMsg.lessonId)).limit(1);
        if (lesson) {
          io.emit("calendar_update", { instructorId: lesson.instructorId, date: lesson.date });
        }
      }
    }

    res.json(responseMsg);
  } catch (err) {
    console.error("Respond to message error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
