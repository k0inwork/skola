import { db } from "../db/index";
import { googleTokens } from "../db/schema";
import { eq } from "drizzle-orm";
import { config } from "../lib/config.js";

interface CalendarEventInput {
  summary: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  location?: string;
  attendeeEmail?: string;
}

async function getValidAccessToken(userId: string): Promise<string | null> {
  const [tokenRow] = await db.select().from(googleTokens).where(eq(googleTokens.userId, userId)).limit(1);
  if (!tokenRow) return null;

  // If token is still valid for >60s, use it
  if (tokenRow.accessToken && tokenRow.expiryDate && new Date(tokenRow.expiryDate).getTime() > Date.now() + 60000) {
    return tokenRow.accessToken;
  }

  // Refresh the token
  if (!tokenRow.refreshToken) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        refresh_token: tokenRow.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      console.error("Token refresh failed:", await res.text());
      return null;
    }

    const data = await res.json();

    await db.update(googleTokens).set({
      accessToken: data.access_token,
      expiryDate: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope || tokenRow.scope,
      updatedAt: new Date(),
    }).where(eq(googleTokens.id, tokenRow.id));

    return data.access_token;
  } catch (err) {
    console.error("Token refresh error:", err);
    return null;
  }
}

export async function createCalendarEvent(userId: string, event: CalendarEventInput): Promise<string | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const body: any = {
    summary: event.summary,
    start: { dateTime: event.startTime, timeZone: "Europe/Riga" },
    end: { dateTime: event.endTime, timeZone: "Europe/Riga" },
  };

  if (event.location) body.location = event.location;
  if (event.attendeeEmail) {
    body.attendees = [{ email: event.attendeeEmail }];
  }

  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("Calendar create error:", await res.text());
      return null;
    }

    const data = await res.json();
    return data.id;
  } catch (err) {
    console.error("Calendar create error:", err);
    return null;
  }
}

export async function updateCalendarEvent(userId: string, eventId: string, event: CalendarEventInput): Promise<boolean> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return false;

  const body: any = {
    summary: event.summary,
    start: { dateTime: event.startTime, timeZone: "Europe/Riga" },
    end: { dateTime: event.endTime, timeZone: "Europe/Riga" },
  };

  if (event.location) body.location = event.location;
  if (event.attendeeEmail) {
    body.attendees = [{ email: event.attendeeEmail }];
  }

  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("Calendar update error:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Calendar update error:", err);
    return false;
  }
}

export async function deleteCalendarEvent(userId: string, eventId: string): Promise<boolean> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return false;

  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok && res.status !== 404) {
      console.error("Calendar delete error:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Calendar delete error:", err);
    return false;
  }
}
