import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { googleConfig, GOOGLE_AUTHORIZE_URL, safeNext } from "../../../../lib/google-oauth";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url); const config = googleConfig(requestUrl.origin);
  if (!config) return NextResponse.redirect(new URL("/auth?error=google_not_configured", requestUrl.origin));
  const state = randomBytes(32).toString("hex"); const authorize = new URL(GOOGLE_AUTHORIZE_URL);
  authorize.searchParams.set("client_id", config.clientId); authorize.searchParams.set("redirect_uri", config.redirectUri); authorize.searchParams.set("response_type", "code"); authorize.searchParams.set("scope", "openid email profile"); authorize.searchParams.set("state", state); authorize.searchParams.set("prompt", "select_account");
  const response = NextResponse.redirect(authorize); const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 };
  response.cookies.set("mova_google_state", state, options); response.cookies.set("mova_google_next", safeNext(requestUrl.searchParams.get("next")), options); return response;
}
