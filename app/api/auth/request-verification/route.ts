import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { createEmailToken } from "../../../../lib/email-tokens";
import { prisma } from "../../../../lib/prisma";
import { appUrl, sendMovaEmail } from "../../../../lib/email";

export async function POST(request: Request) { const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 }); const record = await prisma.user.findUnique({ where: { id: user.id } }); if (record?.emailVerifiedAt && !record.pendingEmail) return NextResponse.json({ verified: true }); const token = await createEmailToken(user.id, "verify_email", 24); const path = `/verify-email/${token}`; const delivery = await sendMovaEmail({ to: record?.pendingEmail || user.email, subject: "Verifica il tuo indirizzo email MOVA", title: "Verifica il tuo indirizzo email", intro: "Conferma che questo indirizzo email appartiene a te. Il link è valido per 24 ore.", actionLabel: "Verifica email", actionUrl: `${appUrl(request)}${path}`, idempotencyKey: `verify-${user.id}-${token.slice(0, 12)}` }); return NextResponse.json({ sent: delivery.sent, previewUrl: delivery.development ? path : undefined }); }
