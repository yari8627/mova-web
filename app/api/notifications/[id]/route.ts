import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function PATCH(_: Request, { params }: { params: Promise<{ id: string }> }) { const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 }); const { id } = await params; const result = await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } }); return result.count ? NextResponse.json({ updated: true }) : NextResponse.json({ error: "Notifica non trovata" }, { status: 404 }); }
