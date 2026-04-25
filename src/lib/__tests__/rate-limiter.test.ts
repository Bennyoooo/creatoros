import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit } from "../rate-limiter";

const DEFAULT_LIMITS = { messagesPerHourPerIp: 3, dailySpendCapUsd: 1 };

describe("rate-limiter", () => {
  beforeEach(() => {
    // Rate limiter uses module-level Maps, so tests share state.
    // Use unique IPs per test to isolate.
  });

  it("allows requests under the IP limit", () => {
    const result = checkRateLimit("10.0.0.1", "creator1", DEFAULT_LIMITS);
    expect(result.allowed).toBe(true);
  });

  it("blocks requests over the IP limit", () => {
    const ip = "10.0.0.2";
    checkRateLimit(ip, "creator2", DEFAULT_LIMITS);
    checkRateLimit(ip, "creator2", DEFAULT_LIMITS);
    checkRateLimit(ip, "creator2", DEFAULT_LIMITS);
    const result = checkRateLimit(ip, "creator2", DEFAULT_LIMITS);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("rate_limited");
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("returns retryAfterSeconds when rate limited", () => {
    const ip = "10.0.0.3";
    for (let i = 0; i < 3; i++) checkRateLimit(ip, "creator3", DEFAULT_LIMITS);
    const result = checkRateLimit(ip, "creator3", DEFAULT_LIMITS);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(3600);
  });

  it("blocks when daily spend cap is exceeded", () => {
    const limits = { messagesPerHourPerIp: 1000, dailySpendCapUsd: 0.01 };
    checkRateLimit("10.0.0.4", "creator4", limits);
    const result = checkRateLimit("10.0.0.5", "creator4", limits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("daily_cap");
  });

  it("tracks limits per creator slug independently", () => {
    const ip = "10.0.0.6";
    for (let i = 0; i < 3; i++) checkRateLimit(ip, "creatorA", DEFAULT_LIMITS);
    const blocked = checkRateLimit(ip, "creatorA", DEFAULT_LIMITS);
    expect(blocked.allowed).toBe(false);

    const otherCreator = checkRateLimit(ip, "creatorB", DEFAULT_LIMITS);
    expect(otherCreator.allowed).toBe(true);
  });
});
