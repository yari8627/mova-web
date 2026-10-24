import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { notifyUser } from "../../../../../lib/notifications";
import { prisma } from "../../../../../lib/prisma";
import { rotateProgressScope } from "../../../../../lib/progress-cache-scope";
import { tripAccess } from "../../../../../lib/trip-access";

export async function POST(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Accedi per accettare l’invito" }, { status: 401 });
  const { code } = await params;
  const invite = await prisma.tripInvite.findUnique({ where: { code }, include: { trip: true } });
  if (!invite) return NextResponse.json({ error: "Invito non trovato" }, { status: 404 });
  const email = user.email.trim().toLowerCase();
  if (invite.email.trim().toLowerCase() !== email) return NextResponse.json({ error: `Questo invito è riservato a ${invite.email}` }, { status: 403 });
  if (invite.status === "accepted") {
    // Accepted links must not grant access again after a participant leaves/is removed.
    const access = await tripAccess(invite.tripId, user);
    if (!access.allowed) return NextResponse.json({ error: "L’invito risulta già utilizzato, ma non hai una partecipazione confermata. Richiedi un nuovo invito al proprietario." }, { status: 409 });
    return NextResponse.json({ accepted: true, tripId: invite.tripId, userId: user.id });
  }
  if (invite.status !== "pending") return NextResponse.json({ error: "Questo invito è stato sostituito o revocato. Apri la notifica più recente." }, { status: 409 });
  if (invite.expiresAt <= new Date()) return NextResponse.json({ error: "Questo invito è scaduto" }, { status: 410 });

  const accepted = await prisma.$transaction(async tx => {
    // Claim only a still-valid pending invite; concurrent revocation/replacement
    // cannot be overwritten by a stale request that validated it earlier.
    const claimed = await tx.tripInvite.updateMany({ where: { code, status: "pending", expiresAt: { gt: new Date() } }, data: { status: "accepted", acceptedAt: new Date() } });
    if (claimed.count !== 1) return false;
    // Preserve the legacy participant ID instead of creating a second identity.
    const canonical = await tx.participant.findUnique({ where: { tripId_email: { tripId: invite.tripId, email } } });
    const previous = canonical || (invite.email !== email ? await tx.participant.findUnique({ where: { tripId_email: { tripId: invite.tripId, email: invite.email } } }) : null);
    const data = { name: user.name, email, role: invite.role === "co-organizer" ? "co-organizer" : "participant", status: "confirmed" };
    if (previous) await tx.participant.update({ where: { id: previous.id }, data });
    else await tx.participant.upsert({ where: { tripId_email: { tripId: invite.tripId, email } }, update: data, create: { id: randomUUID(), tripId: invite.tripId, ...data } });
    return true;
  });
  if (!accepted) {
    const latest = await prisma.tripInvite.findUnique({ where: { code } });
    if (latest?.status === "accepted" && (await tripAccess(invite.tripId, user)).allowed) return NextResponse.json({ accepted: true, tripId: invite.tripId, userId: user.id });
    return NextResponse.json({ error: "L’invito è scaduto o non è più disponibile. Richiedi un nuovo invito." }, { status: latest?.status === "pending" && latest.expiresAt <= new Date() ? 410 : 409 });
  }
  await rotateProgressScope(user.sessionExpiresAt);
  // Notification failure cannot undo or mask a committed participation.
  if (invite.trip.ownerId) {
    try { await notifyUser(invite.trip.ownerId, { tripId: invite.tripId, type: "invite_accepted", title: "Invito accettato", message: `${user.name} si è unito a ${invite.trip.name}.`, link: `/trips/${invite.tripId}/participants` }); }
    catch { /* Notifications are best effort; membership is authoritative. */ }
  }
  return NextResponse.json({ accepted: true, tripId: invite.tripId, userId: user.id });
}
