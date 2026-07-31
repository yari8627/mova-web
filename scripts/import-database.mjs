import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";

const prisma = new PrismaClient();
const input = process.argv[2];
if (!input) throw new Error("Percorso di importazione richiesto");
const data = JSON.parse(await readFile(input, "utf8"));

const imports = [
  ["user", data.users], ["trip", data.trips], ["booking", data.bookings],
  ["activity", data.activities], ["document", data.documents], ["expense", data.expenses],
  ["participant", data.participants], ["tripInvite", data.tripInvites], ["packingItem", data.packingItems],
  ["visitedCountry", data.visitedCountries], ["authSession", data.authSessions],
  ["notification", data.notifications], ["notificationPreference", data.notificationPreferences],
  ["emailToken", data.emailTokens],
];

for (const [model, rows] of imports) {
  if (rows?.length) await prisma[model].createMany({ data: rows, skipDuplicates: true });
}
await prisma.$disconnect();
console.log(JSON.stringify(Object.fromEntries(imports.map(([model, rows]) => [model, rows?.length || 0]))));
