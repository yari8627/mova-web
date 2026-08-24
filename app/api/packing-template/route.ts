import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { titleCaseItalian } from "../../../lib/text-format";

type TemplateRow = { id: string; userId: string; label: string; createdAt: Date };

async function ensureSchema() {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StandardPackingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "StandardPackingItem_userId_label_key" ON "StandardPackingItem"("userId", LOWER("label"))`);
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  await ensureSchema();
  const items = await prisma.$queryRaw<TemplateRow[]>(Prisma.sql`SELECT * FROM "StandardPackingItem" WHERE "userId" = ${user.id} ORDER BY "createdAt" ASC`);
  return NextResponse.json(items.map((item) => ({ ...item, label: titleCaseItalian(item.label), packed: false, scope: "template" })));
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  await ensureSchema();
  const label = titleCaseItalian(String((await request.json()).label || ""));
  if (!label) return NextResponse.json({ error: "Inserisci un oggetto" }, { status: 400 });
  if (label.length > 100) return NextResponse.json({ error: "Il nome è troppo lungo" }, { status: 400 });
  const existing = await prisma.$queryRaw<TemplateRow[]>(Prisma.sql`SELECT * FROM "StandardPackingItem" WHERE "userId" = ${user.id} AND LOWER("label") = LOWER(${label}) LIMIT 1`);
  if (existing.length) return NextResponse.json({ error: "Questo oggetto è già nella Lista Standard" }, { status: 409 });
  const rows = await prisma.$queryRaw<TemplateRow[]>(Prisma.sql`INSERT INTO "StandardPackingItem" ("id", "userId", "label") VALUES (${randomUUID()}, ${user.id}, ${label}) RETURNING *`);
  return NextResponse.json({ ...rows[0], packed: false, scope: "template" }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  await ensureSchema();
  const itemId = new URL(request.url).searchParams.get("itemId") || "";
  const deleted = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`DELETE FROM "StandardPackingItem" WHERE "id" = ${itemId} AND "userId" = ${user.id} RETURNING "id"`);
  if (!deleted.length) return NextResponse.json({ error: "Elemento non trovato" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
