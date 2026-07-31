import { readFile, writeFile } from "node:fs/promises";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Uso: generate-postgres-import <input.json> <output.sql>");
const data = JSON.parse(await readFile(input, "utf8"));

const tables = [
  ["User", data.users], ["Trip", data.trips], ["Booking", data.bookings],
  ["Activity", data.activities], ["Document", data.documents], ["Expense", data.expenses],
  ["Participant", data.participants], ["TripInvite", data.tripInvites], ["PackingItem", data.packingItems],
  ["VisitedCountry", data.visitedCountries], ["AuthSession", data.authSessions],
  ["Notification", data.notifications], ["NotificationPreference", data.notificationPreferences],
  ["EmailToken", data.emailTokens],
];

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

const statements = ["BEGIN;"];
for (const [table, rows] of tables) {
  for (const row of rows || []) {
    const columns = Object.keys(row).map((key) => `"${key}"`).join(", ");
    const values = Object.values(row).map(sqlValue).join(", ");
    statements.push(`INSERT INTO "${table}" (${columns}) VALUES (${values}) ON CONFLICT DO NOTHING;`);
  }
}
statements.push("COMMIT;");
await writeFile(output, statements.join("\n"), "utf8");
console.log(`${statements.length - 2} record pronti per PostgreSQL`);
