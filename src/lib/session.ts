import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";

const SESSION_COOKIE = "creatoros_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

// In-memory store for dev/validation. Replace with Upstash Redis for production.
const threadStore = new Map<string, string>();

export async function getOrCreateSessionId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE);
  if (existing?.value) {
    return existing.value;
  }
  const sessionId = uuidv4();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return sessionId;
}

export function getThreadId(sessionId: string, creatorSlug: string): string | null {
  return threadStore.get(`${sessionId}:${creatorSlug}`) ?? null;
}

export function setThreadId(sessionId: string, creatorSlug: string, threadId: string): void {
  threadStore.set(`${sessionId}:${creatorSlug}`, threadId);
}
