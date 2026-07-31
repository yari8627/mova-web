import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const COOKIE_NAME = "mova_session";
const SESSION_DAYS = 30;

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) { return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`; }
export function verifyPassword(password: string, stored: string) { const [salt, key] = stored.split(":"); if (!salt || !key) return false; const candidate = scryptSync(password, salt, 64); const original = Buffer.from(key, "hex"); return candidate.length === original.length && timingSafeEqual(candidate, original); }
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) { const token = randomBytes(32).toString("hex"); const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000); await prisma.authSession.create({ data: { id: randomUUID(), tokenHash: hashToken(token), userId, expiresAt } }); const jar = await cookies(); jar.set(COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt }); }
export async function destroySession() { const jar = await cookies(); const token = jar.get(COOKIE_NAME)?.value; if (token) await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } }); jar.delete(COOKIE_NAME); }
export async function destroyOtherSessions(userId: string) { const token = (await cookies()).get(COOKIE_NAME)?.value; if (!token) return 0; const result = await prisma.authSession.deleteMany({ where: { userId, tokenHash: { not: hashToken(token) } } }); return result.count; }
export async function currentUser() { const token = (await cookies()).get(COOKIE_NAME)?.value; if (!token) return null; const session = await prisma.authSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } }); if (!session || session.expiresAt <= new Date()) return null; return { id: session.user.id, name: session.user.name, email: session.user.email, pendingEmail: session.user.pendingEmail, emailVerified: Boolean(session.user.emailVerifiedAt), passportCountry: session.user.passportCountry, avatarUrl: session.user.avatarStorageKey ? `/api/auth/avatar/${session.user.id}` : session.user.externalAvatarUrl }; }
