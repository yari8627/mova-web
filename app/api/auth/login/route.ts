import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function POST(request: Request) { const { email, password } = await request.json(); const user = await prisma.user.findUnique({ where: { email: String(email || "").trim().toLowerCase() } }); if (!user || !verifyPassword(String(password || ""), user.passwordHash)) return NextResponse.json({ error: "Email o password non corretti." }, { status: 401 }); await createSession(user.id); return NextResponse.json({ id: user.id, name: user.name, email: user.email }); }
