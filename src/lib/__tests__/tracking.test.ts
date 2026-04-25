import { describe, it, expect } from "vitest";
import { queueTrackEvent, getQueuedEvents } from "../tracking";

describe("tracking", () => {
  it("queues a valid track event", () => {
    queueTrackEvent({
      creatorSlug: "demo",
      productId: "prod-1",
      sessionId: "sess-123",
      timestamp: Date.now(),
    });
    const events = getQueuedEvents();
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[events.length - 1].productId).toBe("prod-1");
  });

  it("queues multiple events", () => {
    const before = getQueuedEvents().length;
    queueTrackEvent({
      creatorSlug: "demo",
      productId: "a",
      sessionId: "s1",
      timestamp: Date.now(),
    });
    queueTrackEvent({
      creatorSlug: "demo",
      productId: "b",
      sessionId: "s2",
      timestamp: Date.now(),
    });
    const after = getQueuedEvents();
    expect(after.length).toBeGreaterThanOrEqual(before + 2);
    const ids = after.map((e) => e.productId);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
  });

  it("returns a copy of the queue (not a reference)", () => {
    const q1 = getQueuedEvents();
    const q2 = getQueuedEvents();
    expect(q1).not.toBe(q2);
    expect(q1).toEqual(q2);
  });
});
