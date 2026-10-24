import { randomBytes, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { tripAccess } from "../../../../../lib/trip-access";
import { appUrl, sendMovaEmail } from "../../../../../lib/email";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const { id } = await params; const access = await tripAccess(id, user); if (!access.allowed) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  const trip = await prisma.trip.findUnique({ where: { id } }); if (!trip || (access.role !== "owner" && access.role !== "co-organizer")) return NextResponse.json({ error: "Non hai il permesso di invitare partecipanti" }, { status: 403 });
  const body = await request.json(); const email = String(body.email || "").trim().toLowerCase(); const pendingName = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("it")) || "Invitato"; const name = String(body.name || "").trim() || pendingName; const role = access.role === "owner" && body.role === "co-organizer" ? "co-organizer" : "participant";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Inserisci un indirizzo email valido" }, { status: 400 });
  if (email === user.email.toLowerCase()) return NextResponse.json({ error: "Sei già il proprietario del viaggio" }, { status: 400 });
  const { participant, invite } = await prisma.$transaction(async tx => {
    // Serialize retries across server instances, sharing the lock with acceptance/sync.
    await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id" = ${id} FOR UPDATE`;
    const previous = await tx.participant.findFirst({ where: { tripId: id, email: { equals: email, mode: "insensitive" } } });
    const participant = previous?.status === "confirmed" ? previous : await tx.participant.upsert({ where: { tripId_email: { tripId: id, email } }, update: { name, role, status: "pending" }, create: { id: randomUUID(), tripId: id, name, email, role, status: "pending" } });
    const reusable = await tx.tripInvite.findFirst({ where: { tripId: id, email: { equals: email, mode: "insensitive" }, ...(participant.status === "confirmed" ? { status: { in: ["pending", "accepted"] } } : { status: "pending", role, expiresAt: { gt: new Date() } }) }, orderBy: { createdAt: "desc" } });
    if (reusable) return { participant, invite: reusable };
    await tx.tripInvite.updateMany({ where: { tripId: id, email: { equals: email, mode: "insensitive" }, status: "pending" }, data: { status: "replaced" } });
    const invite = await tx.tripInvite.create({ data: { id: randomUUID(), code: `NAMI-${randomBytes(5).toString("hex").toUpperCase()}`, tripId: id, email, name, role, expiresAt: new Date(Date.now() + 14 * 86400000) } });
    const invitedUser = await tx.user.findUnique({ where: { email } });
    if (invitedUser && participant.status !== "confirmed") await tx.notification.upsert({ where: { dedupeKey: `invite-${invite.id}` }, update: {}, create: { id: randomUUID(), dedupeKey: `invite-${invite.id}`, userId: invitedUser.id, tripId: id, type: "invite", title: "Nuovo invito", message: `${user.name} ti ha invitato a ${trip.name}.`, link: `/invite/${invite.code}` } });
    return { participant, invite };
  });
  if (participant.status !== "confirmed") await sendMovaEmail({ to: email, subject: `${user.name} ti invita su NAMI`, title: `Unisciti al viaggio ${trip.name}`, intro: `${user.name} ti ha invitato a partecipare al viaggio ${trip.name}, con destinazione ${trip.city}, ${trip.country}.`, actionLabel: "Accetta l’invito", actionUrl: `${appUrl(request)}/invite/${invite.code}`, footer: "L’invito scade tra 14 giorni. Se non conosci il mittente, puoi ignorare questa email.", idempotencyKey: `invite-${invite.id}` });
  return NextResponse.json({ participant, code: invite.code, link: `/invite/${invite.code}`, expiresAt: invite.expiresAt }, { status: 201 });
}
