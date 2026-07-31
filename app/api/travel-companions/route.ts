import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });

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
