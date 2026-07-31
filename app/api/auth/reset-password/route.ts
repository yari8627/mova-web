import { NextResponse } from "next/server";
import { hashPassword } from "../../../../lib/auth";
import { consumeEmailToken } from "../../../../lib/email-tokens";
import { prisma } from "../../../../lib/prisma";

export async function POST(request: Request) { const { token, password } = await request.json(); if (String(password || "").length < 8) return NextResponse.json({ error: "La password deve contenere almeno 8 caratteri" }, { status: 400 }); const user = await consumeEmailToken(String(token), "reset_password"); if (!user) return NextResponse.json({ error: "Link non valido o scaduto" }, { status: 400 }); await prisma.$transaction([prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(String(password)) } }), prisma.authSession.deleteMany({ where: { userId: user.id } })]); return NextResponse.json({ updated: true }); }
