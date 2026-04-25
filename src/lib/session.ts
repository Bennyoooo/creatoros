import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import { Redis } from "@upstash/redis";

const SESSION_COOKIE = "creatoros_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
const THREAD_TTL = 7 * 24 * 60 * 60;

const inMemoryStore = new Map<string, string>();

function getRedis(): Redis | null {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return null;
}

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

export async function getThreadId(sessionId: string, creatorSlug: string): Promise<string | null> {
  const key = `thread:${sessionId}:${creatorSlug}`;
  const redis = getRedis();
  if (redis) {
    return await redis.get<string>(key);
  }
  return inMemoryStore.get(key) ?? null;
}

export async function setThreadId(sessionId: string, creatorSlug: string, threadId: string): Promise<void> {
  const key = `thread:${sessionId}:${creatorSlug}`;
  const redis = getRedis();
  if (redis) {
    await redis.set(key, threadId, { ex: THREAD_TTL });
  } else {
    inMemoryStore.set(key, threadId);
  }
}
