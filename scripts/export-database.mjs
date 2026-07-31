import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";

const prisma = new PrismaClient();
const output = process.argv[2];
if (!output) throw new Error("Percorso di esportazione richiesto");

const data = {
  users: await prisma.user.findMany(),
  trips: await prisma.trip.findMany(),
  bookings: await prisma.booking.findMany(),
  activities: await prisma.activity.findMany(),
  documents: await prisma.document.findMany(),
  expenses: await prisma.expense.findMany(),
  participants: await prisma.participant.findMany(),
  tripInvites: await prisma.tripInvite.findMany(),
  packingItems: await prisma.packingItem.findMany(),
  visitedCountries: await prisma.visitedCountry.findMany(),
  authSessions: await prisma.authSession.findMany(),
  notifications: await prisma.notification.findMany(),
  notificationPreferences: await prisma.notificationPreference.findMany(),
  emailTokens: await prisma.emailToken.findMany(),
};

await mkdir(new URL("../backups/", import.meta.url), { recursive: true });
await writeFile(output, JSON.stringify(data), "utf8");
await prisma.$disconnect();
console.log(JSON.stringify(Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length]))));
