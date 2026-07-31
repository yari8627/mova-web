import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createSession, hashPassword } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function POST(request: Request) { const { name, email, password } = await request.json(); const cleanEmail = String(email || "").trim().toLowerCase(); if (!String(name || "").trim() || !cleanEmail || String(password || "").length < 8) return NextResponse.json({ error: "Inserisci nome, email e una password di almeno 8 caratteri." }, { status: 400 }); if (await prisma.user.findUnique({ where: { email: cleanEmail } })) return NextResponse.json({ error: "Esiste già un account con questa email." }, { status: 409 }); const user = await prisma.user.create({ data: { id: randomUUID(), name: String(name).trim(), email: cleanEmail, passwordHash: hashPassword(String(password)) } }); await createSession(user.id); return NextResponse.json({ id: user.id, name: user.name, email: user.email }, { status: 201 }); }
