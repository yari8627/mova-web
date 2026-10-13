import type { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "./prisma";

export async function notifyUser(userId: string, data: { tripId?: string; type: string; title: string; message: string; link?: string }) { return prisma.notification.create({ data: { id: randomUUID(), userId, tripId: data.tripId, type: data.type, title: data.title, message: data.message, link: data.link } }); }

export async function notifyTripMembers(tripId: string, actorId: string, data: { type: string; title: string; message: string; link: string }, db: Prisma.TransactionClient = prisma) { const trip = await db.trip.findUnique({ where: { id: tripId }, include: { participants: { where: { status: "confirmed" }, select: { email: true } } } }); if (!trip) return; const emails = trip.participants.map((person) => person.email.toLowerCase()); const users = await db.user.findMany({ where: { OR: [{ id: trip.ownerId || "" }, { email: { in: emails } }], NOT: { id: actorId } }, select: { id: true } }); if (!users.length) return; await db.notification.createMany({ data: users.map((user) => ({ id: randomUUID(), userId: user.id, tripId, ...data })) }); }
