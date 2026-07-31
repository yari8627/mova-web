import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { notifyUser } from "../../../../../lib/notifications";
import { prisma } from "../../../../../lib/prisma";
import { tripAccess } from "../../../../../lib/trip-access";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) { const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 }); const { id } = await params; const access = await tripAccess(id, user); if (!access.allowed) return NextResponse.json({ error: "Accesso negato" }, { status: 403 }); if (access.role === "owner") return NextResponse.json({ error: "Trasferisci la proprietà prima di lasciare il viaggio" }, { status: 400 }); const trip = await prisma.trip.findUnique({ where: { id } }); await prisma.participant.delete({ where: { tripId_email: { tripId: id, email: user.email } } }); if (trip?.ownerId) await notifyUser(trip.ownerId, { tripId: id, type: "participant_left", title: "Partecipante uscito", message: `${user.name} ha lasciato il viaggio.`, link: `/trips/${id}/participants` }); return NextResponse.json({ left: true }); }
