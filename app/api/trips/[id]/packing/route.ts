import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { tripAccess } from "../../../../../lib/trip-access";
import { titleCaseItalian } from "../../../../../lib/text-format";

type PackingRow = { id: string; tripId: string; userId: string; label: string; packed: boolean; scope: string; createdAt: Date; updatedAt: Date; createdBy?: string };

let packingSchemaReady: Promise<void> | null = null;

function ensurePackingSchema() {
  if (!packingSchemaReady) {
    packingSchemaReady = prisma.$transaction([
      prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PackingItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tripId" TEXT NOT NULL REFERENCES "Trip"("id") ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "label" TEXT NOT NULL,
        "packed" BOOLEAN NOT NULL DEFAULT false,
        "scope" TEXT NOT NULL DEFAULT 'personal',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )`),
      prisma.$executeRawUnsafe(`ALTER TABLE "PackingItem" ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'personal'`),
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PackingItem_tripId_userId_createdAt_idx" ON "PackingItem"("tripId", "userId", "createdAt")`),
      prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PackingItem_tripId_scope_createdAt_idx" ON "PackingItem"("tripId", "scope", "createdAt")`),
      prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StandardPackingItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "label" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
    ]).then(() => undefined).catch((error) => {
      packingSchemaReady = null;
      throw error;
    });
  }
  return packingSchemaReady;
}

async function authorizedUser(id: string) {
  const user = await currentUser();
  if (!user) return { response: NextResponse.json({ error: "Accesso richiesto" }, { status: 401 }) };
  const access = await tripAccess(id, user);
  if (!access.allowed) return { response: NextResponse.json({ error: access.missing ? "Viaggio non trovato" : "Accesso negato" }, { status: access.missing ? 404 : 403 }) };
  return { user };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizedUser(id);
  if (auth.response) return auth.response;
  await ensurePackingSchema();
  const scope = new URL(request.url).searchParams.get("scope") === "shared" ? "shared" : "personal";
  const visibility = scope === "personal" ? Prisma.sql`AND p."userId" = ${auth.user!.id}` : Prisma.empty;
  let items = await prisma.$queryRaw<PackingRow[]>(Prisma.sql`
    SELECT p.*, u."name" AS "createdBy"
    FROM "PackingItem" p
    JOIN "User" u ON u."id" = p."userId"
    WHERE p."tripId" = ${id} AND p."scope" = ${scope} ${visibility}
    ORDER BY p."packed" ASC, p."createdAt" ASC
  `);
  if (scope === "personal" && items.length === 0) {
    const templates = await prisma.$queryRaw<Array<{ label: string }>>(Prisma.sql`SELECT "label" FROM "StandardPackingItem" WHERE "userId" = ${auth.user!.id} ORDER BY "createdAt" ASC`);
    if (templates.length) {
      await prisma.$transaction(templates.map((item) => prisma.$executeRaw(Prisma.sql`INSERT INTO "PackingItem" ("id", "tripId", "userId", "label", "packed", "scope", "createdAt", "updatedAt") VALUES (${randomUUID()}, ${id}, ${auth.user!.id}, ${item.label}, false, 'personal', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)));
      items = await prisma.$queryRaw<PackingRow[]>(Prisma.sql`SELECT p.*, u."name" AS "createdBy" FROM "PackingItem" p JOIN "User" u ON u."id" = p."userId" WHERE p."tripId" = ${id} AND p."scope" = 'personal' AND p."userId" = ${auth.user!.id} ORDER BY p."packed" ASC, p."createdAt" ASC`);
    }
  }
  return NextResponse.json(items.map((item) => ({ ...item, label: titleCaseItalian(item.label) })));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizedUser(id);
  if (auth.response) return auth.response;
  await ensurePackingSchema();
  const body = await request.json();
  if (body.action === "apply-template") {
    const templates = await prisma.$queryRaw<Array<{ label: string }>>(Prisma.sql`SELECT "label" FROM "StandardPackingItem" WHERE "userId" = ${auth.user!.id} ORDER BY "createdAt" ASC`);
    const existing = await prisma.$queryRaw<Array<{ label: string }>>(Prisma.sql`SELECT "label" FROM "PackingItem" WHERE "tripId" = ${id} AND "userId" = ${auth.user!.id} AND "scope" = 'personal'`);
    const labels = new Set(existing.map((item) => item.label.trim().toLocaleLowerCase("it")));
    const missing = templates.filter((item) => !labels.has(item.label.trim().toLocaleLowerCase("it")));
    if (missing.length) await prisma.$transaction(missing.map((item) => prisma.$executeRaw(Prisma.sql`INSERT INTO "PackingItem" ("id", "tripId", "userId", "label", "packed", "scope", "createdAt", "updatedAt") VALUES (${randomUUID()}, ${id}, ${auth.user!.id}, ${item.label}, false, 'personal', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)));
    return NextResponse.json({ added: missing.length });
  }
  const scope = body.scope === "shared" ? "shared" : "personal";
  const label = titleCaseItalian(String(body.label || ""));
  if (!label) return NextResponse.json({ error: "Inserisci un oggetto" }, { status: 400 });
  if (label.length > 100) return NextResponse.json({ error: "Il nome è troppo lungo" }, { status: 400 });
  const itemId = randomUUID();
  const items = await prisma.$queryRaw<PackingRow[]>(Prisma.sql`
    INSERT INTO "PackingItem" ("id", "tripId", "userId", "label", "packed", "scope", "createdAt", "updatedAt")
    VALUES (${itemId}, ${id}, ${auth.user!.id}, ${label}, false, ${scope}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING *
  `);
  return NextResponse.json({ ...items[0], createdBy: auth.user!.name }, { status: 201 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizedUser(id);
  if (auth.response) return auth.response;
  await ensurePackingSchema();
  const body = await request.json();
  const items = await prisma.$queryRaw<PackingRow[]>(Prisma.sql`
    UPDATE "PackingItem"
    SET "packed" = ${Boolean(body.packed)}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${String(body.id || "")} AND "tripId" = ${id}
      AND ("scope" = 'shared' OR ("scope" = 'personal' AND "userId" = ${auth.user!.id}))
    RETURNING *
  `);
  if (!items.length) return NextResponse.json({ error: "Elemento non trovato" }, { status: 404 });
  return NextResponse.json(items[0]);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizedUser(id);
  if (auth.response) return auth.response;
  await ensurePackingSchema();
  const itemId = new URL(request.url).searchParams.get("itemId") || "";
  const deleted = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    DELETE FROM "PackingItem"
    WHERE "id" = ${itemId} AND "tripId" = ${id}
      AND ("scope" = 'shared' OR ("scope" = 'personal' AND "userId" = ${auth.user!.id}))
    RETURNING "id"
  `);
  if (!deleted.length) return NextResponse.json({ error: "Elemento non trovato" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
