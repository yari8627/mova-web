import { NextResponse } from "next/server";
import { createEmailToken } from "../../../../lib/email-tokens";
import { prisma } from "../../../../lib/prisma";
import { appUrl, sendMovaEmail } from "../../../../lib/email";

export async function POST(request: Request) { const { email } = await request.json(); const user = await prisma.user.findUnique({ where: { email: String(email || "").trim().toLowerCase() } }); let previewUrl: string | undefined; if (user) { const token = await createEmailToken(user.id, "reset_password", 1); const path = `/reset-password/${token}`; const delivery = await sendMovaEmail({ to: user.email, subject: "Reimposta la password MOVA", title: "Reimposta la tua password", intro: "Abbiamo ricevuto una richiesta per impostare una nuova password del tuo account MOVA. Il link scade tra un’ora.", actionLabel: "Crea una nuova password", actionUrl: `${appUrl(request)}${path}`, idempotencyKey: `reset-${user.id}-${token.slice(0, 12)}` }); if (delivery.development) previewUrl = path; } return NextResponse.json({ message: "Se l’email è registrata, riceverai le istruzioni per reimpostare la password.", previewUrl }); }
