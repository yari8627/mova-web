import { gmailBody, gmailRoute } from "../../../../lib/gmail-route";
import { searchGmail } from "../../../../lib/gmail-server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) { return gmailRoute(request, true, async user => searchGmail(user, await gmailBody(request))); }
