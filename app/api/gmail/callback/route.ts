import { NextResponse } from "next/server";
import { gmailConfig } from "../../../../lib/gmail-core";
import { gmailResponse } from "../../../../lib/gmail-route";
import { callbackGmail, gmailUser } from "../../../../lib/gmail-server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { const user = await gmailUser(); const target = await callbackGmail(user, request); return NextResponse.redirect(target, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); }
  catch { try { return NextResponse.redirect(`${gmailConfig().origin}/?gmail=error`, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); } catch { return gmailResponse({ error: "Collegamento Gmail non disponibile." }, 503); } }
}
