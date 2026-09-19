import { cleanupExpiredAttachments } from "../../../../lib/attachment-retention";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Fixed retention policy only: no caller-controlled dates, trip IDs or file keys.
// Responses never disclose document data. Optional secret supports protected cron calls.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }
  const result = await cleanupExpiredAttachments();
  return new Response(null, { status: result.failed ? 503 : 204 });
}
