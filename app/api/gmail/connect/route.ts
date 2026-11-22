import { gmailBody, gmailRoute } from "../../../../lib/gmail-route";
import { connectGmail } from "../../../../lib/gmail-server";
export const runtime = "nodejs";
export async function POST(request: Request) { return gmailRoute(request, true, async user => { const body = await gmailBody(request); return connectGmail(user, typeof body.tripId === "string" ? body.tripId : ""); }); }
