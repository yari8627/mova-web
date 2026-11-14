import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { tripAccess } from "../../../lib/trip-access";
import { knownInviteContacts } from "../../../lib/invite-contact-suggestions";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  if (params.get("scope") === "invite") {
    const tripId = params.get("tripId")?.trim();
    if (!tripId) return NextResponse.json({ error: "Viaggio richiesto" }, { status: 400 });
    const access = await tripAccess(tripId, user);
    if (!access.allowed || access.role === "participant") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    const [trips, pending] = await Promise.all([
      prisma.trip.findMany({
        where: { OR: [{ ownerId: user.id }, { participants: { some: { email: { equals: user.email.trim(), mode: "insensitive" }, status: "confirmed" } } }] },
        select: { id: true, ownerId: true, owner: { select: { name: true, email: true } }, participants: { select: { name: true, email: true, status: true } } },
      }),
      // Exclude also legacy pending invitations without a Participant row.
      prisma.tripInvite.findMany({ where: { tripId, status: "pending", expiresAt: { gt: new Date() } }, select: { email: true } }),
    ]);
    // Current participants/owner are excluded from the target trip in `trips`.
    // If membership changed during these reads, do not return suggestions.
    if (!trips.some(trip => trip.id === tripId)) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    const excluded = pending.map(invite => invite.email);
    return NextResponse.json({ userId: user.id, tripId, contacts: knownInviteContacts(trips, user, tripId, excluded) }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const participants = await prisma.participant.findMany({
    where: {
      email: { not: user.email },
      status: "confirmed",
      trip: { OR: [{ ownerId: user.id }, { participants: { some: { email: user.email, status: "confirmed" } } }] },
    },
    select: { name: true, email: true, tripId: true },
  });
  const companionMap = new Map<string, { name: string; email: string; trips: Set<string> }>();
  for (const participant of participants) {
    const email = participant.email.trim().toLowerCase();
    const existing = companionMap.get(email);
    if (existing) { existing.trips.add(participant.tripId); if (participant.name.trim()) existing.name = participant.name; }
    else companionMap.set(email, { name: participant.name || email.split("@")[0], email, trips: new Set([participant.tripId]) });
  }
  const companions = [...companionMap.values()].map((item) => ({ name: item.name, email: item.email, trips: item.trips.size })).sort((a, b) => a.name.localeCompare(b.name, "it"));
  return NextResponse.json(companions);
}
