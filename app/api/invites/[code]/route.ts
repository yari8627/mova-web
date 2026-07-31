import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) { const { code } = await params; const invite = await prisma.tripInvite.findUnique({ where: { code }, include: { trip: { select: { id: true, name: true, country: true, city: true, startDate: true, endDate: true } } } }); if (!invite) return NextResponse.json({ error: "Invito non trovato" }, { status: 404 }); const user = await currentUser(); return NextResponse.json({ code: invite.code, name: invite.name, email: invite.email, role: invite.role, status: invite.status, expiresAt: invite.expiresAt, expired: invite.expiresAt <= new Date(), trip: invite.trip, user: user ? { name: user.name, email: user.email } : null }); }
