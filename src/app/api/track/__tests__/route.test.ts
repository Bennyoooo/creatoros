import { describe, it, expect, vi } from "vitest";
import { POST } from "../route";
import { NextRequest } from "next/server";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

vi.mock("@/lib/tracking", () => ({
  queueTrackEvent: vi.fn(),
}));

describe("POST /api/track", () => {
  it("returns 200 for valid track event", async () => {
    const req = makeRequest({
      creatorSlug: "demo",
      productId: "prod-1",
      sessionId: "sess-123",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("returns 400 when creatorSlug is missing", async () => {
    const req = makeRequest({ productId: "prod-1", sessionId: "sess-123" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when productId is missing", async () => {
    const req = makeRequest({ creatorSlug: "demo", sessionId: "sess-123" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when sessionId is missing", async () => {
    const req = makeRequest({ creatorSlug: "demo", productId: "prod-1" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost:3000/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
