import { createHash, randomBytes, randomUUID } from "crypto";
import { prisma } from "./prisma";

export type EmailTokenType = "verify_email" | "reset_password";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function createEmailToken(userId: string, type: EmailTokenType, hours: number) { await prisma.emailToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } }); const token = randomBytes(32).toString("hex"); await prisma.emailToken.create({ data: { id: randomUUID(), userId, type, tokenHash: hash(token), expiresAt: new Date(Date.now() + hours * 3600000) } }); return token; }
export async function consumeEmailToken(token: string, type: EmailTokenType) { const record = await prisma.emailToken.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } }); if (!record || record.type !== type || record.usedAt || record.expiresAt <= new Date()) return null; await prisma.emailToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }); return record.user; }
