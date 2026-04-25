import { TrackEvent } from "./types";

// Async queue for click tracking. In-memory for Phase B.
// Swap to Google Sheets API or database writer for production.
const trackingQueue: TrackEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function queueTrackEvent(event: TrackEvent): void {
  trackingQueue.push(event);

  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTrackingQueue();
      flushTimer = null;
    }, 5000);
  }
}

async function flushTrackingQueue(): Promise<void> {
  const events = trackingQueue.splice(0, trackingQueue.length);
  if (events.length === 0) return;

  // Phase B: log to console. Phase C: write to Google Sheets or DB.
  for (const event of events) {
    console.log(
      `[TRACK] creator=${event.creatorSlug} product=${event.productId} session=${event.sessionId} ts=${new Date(event.timestamp).toISOString()}`
    );
  }
}

export function getQueuedEvents(): TrackEvent[] {
  return [...trackingQueue];
}
