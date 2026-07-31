import { prisma } from "./prisma";

type UserIdentity = { id: string; email: string };

export async function tripAccess(tripId: string, user: UserIdentity, claimUnowned = false) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, include: { participants: { select: { email: true, status: true, role: true } } } });
  if (!trip) return { allowed: false, missing: true } as const;
  if (trip.ownerId === user.id) return { allowed: true, role: "owner" as const, trip } as const;
  const participant = trip.participants.find((person) => person.status === "confirmed" && person.email.toLowerCase() === user.email.toLowerCase());
  if (participant) return { allowed: true, role: participant.role === "co-organizer" ? "co-organizer" as const : "participant" as const, trip } as const;
  if (!trip.ownerId && claimUnowned) { const claimed = await prisma.trip.update({ where: { id: tripId }, data: { ownerId: user.id } }); return { allowed: true, role: "owner" as const, trip: claimed } as const; }
  return { allowed: false, missing: false } as const;
}
