import { gmailRoute } from "../../../../lib/gmail-route";
import { disconnectGmail, gmailStatus } from "../../../../lib/gmail-server";
export const runtime = "nodejs";
export async function GET(request: Request) { return gmailRoute(request, false, gmailStatus); }
export async function DELETE(request: Request) { return gmailRoute(request, true, disconnectGmail); }
