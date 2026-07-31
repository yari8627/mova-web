import { randomBytes, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { tripAccess } from "../../../../../lib/trip-access";
import { notifyUser } from "../../../../../lib/notifications";
import { appUrl, sendMovaEmail } from "../../../../../lib/email";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const { id } = await params; const access = await tripAccess(id, user); if (!access.allowed) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  const trip = await prisma.trip.findUnique({ where: { id } }); if (!trip || (access.role !== "owner" && access.role !== "co-organizer")) return NextResponse.json({ error: "Non hai il permesso di invitare partecipanti" }, { status: 403 });
  const body = await request.json(); const email = String(body.email || "").trim().toLowerCase(); const name = String(body.name || "").trim(); const role = access.role === "owner" && body.role === "co-organizer" ? "co-organizer" : "participant";
  if (!email || !name) return NextResponse.json({ error: "Nome ed email sono obbligatori" }, { status: 400 });
  if (email === user.email.toLowerCase()) return NextResponse.json({ error: "Sei già il proprietario del viaggio" }, { status: 400 });
  const participant = await prisma.participant.upsert({ where: { tripId_email: { tripId: id, email } }, update: { name, role, status: "pending" }, create: { id: randomUUID(), tripId: id, name, email, role, status: "pending" } });
  await prisma.tripInvite.updateMany({ where: { tripId: id, email, status: "pending" }, data: { status: "replaced" } });
  const code = `MOVA-${randomBytes(5).toString("hex").toUpperCase()}`; const invite = await prisma.tripInvite.create({ data: { id: randomUUID(), code, tripId: id, email, name, role, expiresAt: new Date(Date.now() + 14 * 86400000) } });
  const invitedUser = await prisma.user.findUnique({ where: { email } }); if (invitedUser) await notifyUser(invitedUser.id, { tripId: id, type: "invite", title: "Nuovo invito", message: `${user.name} ti ha invitato a ${trip.name}.`, link: `/invite/${invite.code}` });
  await sendMovaEmail({ to: email, subject: `${user.name} ti invita su MOVA`, title: `Unisciti al viaggio ${trip.name}`, intro: `${user.name} ti ha invitato a partecipare al viaggio ${trip.name}, con destinazione ${trip.city}, ${trip.country}.`, actionLabel: "Accetta l’invito", actionUrl: `${appUrl(request)}/invite/${invite.code}`, footer: "L’invito scade tra 14 giorni. Se non conosci il mittente, puoi ignorare questa email.", idempotencyKey: `invite-${invite.id}` });
  return NextResponse.json({ participant, code: invite.code, link: `/invite/${invite.code}`, expiresAt: invite.expiresAt }, { status: 201 });
}
