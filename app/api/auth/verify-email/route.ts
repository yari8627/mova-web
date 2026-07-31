import { NextResponse } from "next/server";
import { consumeEmailToken } from "../../../../lib/email-tokens";
import { prisma } from "../../../../lib/prisma";

export async function POST(request: Request) { const { token } = await request.json(); const user = await consumeEmailToken(String(token), "verify_email"); if (!user) return NextResponse.json({ error: "Link non valido o scaduto" }, { status: 400 }); const verifiedEmail = user.pendingEmail || user.email; try { await prisma.$transaction([prisma.user.update({ where: { id: user.id }, data: { email: verifiedEmail, pendingEmail: null, emailVerifiedAt: new Date() } }), prisma.participant.updateMany({ where: { email: user.email }, data: { email: verifiedEmail, name: user.name } })]); } catch { return NextResponse.json({ error: "Non è stato possibile applicare il nuovo indirizzo email." }, { status: 409 }); } return NextResponse.json({ verified: true }); }
