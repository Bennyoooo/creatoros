import { TrackEvent } from "./types";
import { google } from "googleapis";

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

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (spreadsheetId && credentials) {
    try {
      await writeToGoogleSheet(events, spreadsheetId, credentials);
      return;
    } catch (err) {
      console.error("[TRACK] Google Sheets write failed, logging to console:", err);
    }
  }

  for (const event of events) {
    console.log(
      `[TRACK] creator=${event.creatorSlug} product=${event.productId} session=${event.sessionId} ts=${new Date(event.timestamp).toISOString()}`
    );
  }
}

async function writeToGoogleSheet(
  events: TrackEvent[],
  spreadsheetId: string,
  credentialsJson: string
): Promise<void> {
  const credentials = JSON.parse(credentialsJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const rows = events.map((e) => [
    new Date(e.timestamp).toISOString(),
    e.creatorSlug,
    e.productId,
    e.sessionId,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Clicks!A:D",
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}

export function getQueuedEvents(): TrackEvent[] {
  return [...trackingQueue];
}
