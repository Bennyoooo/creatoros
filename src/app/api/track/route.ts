import { NextRequest } from "next/server";
import { queueTrackEvent } from "@/lib/tracking";

export async function POST(request: NextRequest) {
  try {
    const { creatorSlug, productId, sessionId } = await request.json();

    if (!creatorSlug || !productId || !sessionId) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    queueTrackEvent({
      creatorSlug,
      productId,
      sessionId,
      timestamp: Date.now(),
    });

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
}
