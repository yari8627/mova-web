import { randomBytes, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession, hashPassword } from "../../../../../lib/auth";
import { googleConfig, GOOGLE_TOKEN_URL, GOOGLE_USERINFO_URL, safeNext } from "../../../../../lib/google-oauth";
import { prisma } from "../../../../../lib/prisma";

type GoogleProfile = { sub: string; email: string; email_verified: boolean; name?: string; picture?: string };
const authError = (origin: string, code: string) => NextResponse.redirect(new URL(`/auth?error=${code}`, origin));

export async function GET(request: Request) {
  const requestUrl = new URL(request.url); const config = googleConfig(requestUrl.origin);
  if (!config) return authError(requestUrl.origin, "google_not_configured");
  const jar = await cookies(); const expectedState = jar.get("mova_google_state")?.value; const state = requestUrl.searchParams.get("state"); const code = requestUrl.searchParams.get("code"); const next = safeNext(jar.get("mova_google_next")?.value || null);
  if (!expectedState || state !== expectedState || !code) return authError(requestUrl.origin, "google_invalid_state");
  jar.delete("mova_google_state"); jar.delete("mova_google_next");
  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code" }), cache: "no-store" });
    if (!tokenResponse.ok) return authError(requestUrl.origin, "google_token_failed");
    const tokens = await tokenResponse.json() as { access_token?: string }; if (!tokens.access_token) return authError(requestUrl.origin, "google_token_failed");
    const profileResponse = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store" }); if (!profileResponse.ok) return authError(requestUrl.origin, "google_profile_failed");
    const profile = await profileResponse.json() as GoogleProfile; const email = String(profile.email || "").trim().toLowerCase();
    if (!profile.sub || !email || !profile.email_verified) return authError(requestUrl.origin, "google_email_unverified");
    let user = await prisma.user.findFirst({ where: { OR: [{ googleSub: profile.sub }, { email }] } });
    if (user) user = await prisma.user.update({ where: { id: user.id }, data: { googleSub: profile.sub, emailVerifiedAt: user.emailVerifiedAt || new Date(), name: profile.name?.trim() || user.name, externalAvatarUrl: user.avatarStorageKey ? user.externalAvatarUrl : profile.picture || user.externalAvatarUrl } });
    else user = await prisma.user.create({ data: { id: randomUUID(), name: profile.name?.trim() || email.split("@")[0], email, passwordHash: hashPassword(randomBytes(32).toString("hex")), passwordLogin: false, emailVerifiedAt: new Date(), googleSub: profile.sub, externalAvatarUrl: profile.picture || null } });
    await createSession(user.id); return NextResponse.redirect(new URL(next, requestUrl.origin));
  } catch { return authError(requestUrl.origin, "google_failed"); }
}
