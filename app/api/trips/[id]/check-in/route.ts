import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { tripAccess } from "../../../../../lib/trip-access";

type CheckInRow = { completed: boolean; returnCompleted: boolean };
let checkInSchemaReady: Promise<void> | null = null;

function ensureCheckInSchema() {
  if (!checkInSchemaReady) {
    checkInSchemaReady = prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TripCheckIn" (
      "tripId" TEXT NOT NULL REFERENCES "Trip"("id") ON DELETE CASCADE,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "completed" BOOLEAN NOT NULL DEFAULT false,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("tripId", "userId")
    )`).then(() => prisma.$executeRawUnsafe(`ALTER TABLE "TripCheckIn" ADD COLUMN IF NOT EXISTS "returnCompleted" BOOLEAN NOT NULL DEFAULT false`)).then(() => undefined).catch((error) => { checkInSchemaReady = null; throw error; });
  }
  return checkInSchemaReady;
}

async function authorizedUser(id: string) {
  const user = await currentUser();
  if (!user) return { response: NextResponse.json({ error: "Accesso richiesto" }, { status: 401 }) };
  const access = await tripAccess(id, user);
  if (!access.allowed) return { response: NextResponse.json({ error: access.missing ? "Viaggio non trovato" : "Accesso negato" }, { status: access.missing ? 404 : 403 }) };
  return { user };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizedUser(id);
  if (auth.response) return auth.response;
  await ensureCheckInSchema();
  const rows = await prisma.$queryRaw<CheckInRow[]>(Prisma.sql`SELECT "completed", "returnCompleted" FROM "TripCheckIn" WHERE "tripId" = ${id} AND "userId" = ${auth.user!.id}`);
  return NextResponse.json({ completed: rows[0]?.completed ?? false, returnCompleted: rows[0]?.returnCompleted ?? false });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizedUser(id);
  if (auth.response) return auth.response;
  await ensureCheckInSchema();
  const body = await request.json() as { completed?: boolean; leg?: "outbound" | "return" };
  const completed = Boolean(body.completed);
  const rows = body.leg === "return"
    ? await prisma.$queryRaw<CheckInRow[]>(Prisma.sql`
      INSERT INTO "TripCheckIn" ("tripId", "userId", "completed", "returnCompleted", "updatedAt")
      VALUES (${id}, ${auth.user!.id}, false, ${completed}, CURRENT_TIMESTAMP)
      ON CONFLICT ("tripId", "userId") DO UPDATE SET "returnCompleted" = EXCLUDED."returnCompleted", "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "completed", "returnCompleted"
    `)
    : await prisma.$queryRaw<CheckInRow[]>(Prisma.sql`
      INSERT INTO "TripCheckIn" ("tripId", "userId", "completed", "updatedAt")
      VALUES (${id}, ${auth.user!.id}, ${completed}, CURRENT_TIMESTAMP)
      ON CONFLICT ("tripId", "userId") DO UPDATE SET "completed" = EXCLUDED."completed", "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "completed", "returnCompleted"
    `);
  return NextResponse.json(rows[0]);
}
