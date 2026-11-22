import { gmailBody, gmailRoute } from "../../../../lib/gmail-route";
import { importGmail } from "../../../../lib/gmail-server";
export const runtime = "nodejs";
export async function POST(request: Request) { return gmailRoute(request, true, async user => importGmail(user, await gmailBody(request))); }
