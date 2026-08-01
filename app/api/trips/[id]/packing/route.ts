import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { tripAccess } from "../../../../../lib/trip-access";
import { titleCaseItalian } from "../../../../../lib/text-format";

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
  const scope = new URL(request.url).searchParams.get("scope") === "shared" ? "shared" : "personal";
  const items = await prisma.packingItem.findMany({ where: { tripId: id, scope, ...(scope === "personal" ? { userId: auth.user!.id } : {}) }, include: { user: { select: { name: true } } }, orderBy: [{ packed: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json(items.map((item) => ({ ...item, label: titleCaseItalian(item.label), createdBy: item.user.name })));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizedUser(id);
  if (auth.response) return auth.response;
  const body = await request.json();
  const scope = body.scope === "shared" ? "shared" : "personal";
  const label = titleCaseItalian(String(body.label || ""));
  if (!label) return NextResponse.json({ error: "Inserisci un oggetto" }, { status: 400 });
  if (label.length > 100) return NextResponse.json({ error: "Il nome è troppo lungo" }, { status: 400 });
  const item = await prisma.packingItem.create({ data: { id: randomUUID(), tripId: id, userId: auth.user!.id, label, scope }, include: { user: { select: { name: true } } } });
  return NextResponse.json({ ...item, createdBy: item.user.name }, { status: 201 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizedUser(id);
  if (auth.response) return auth.response;
  const body = await request.json();
  const existing = await prisma.packingItem.findFirst({ where: { id: String(body.id || ""), tripId: id, OR: [{ scope: "shared" }, { scope: "personal", userId: auth.user!.id }] } });
  if (!existing) return NextResponse.json({ error: "Elemento non trovato" }, { status: 404 });
  const item = await prisma.packingItem.update({ where: { id: existing.id }, data: { packed: body.packed === undefined ? undefined : Boolean(body.packed) } });
  return NextResponse.json(item);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizedUser(id);
  if (auth.response) return auth.response;
  const itemId = new URL(request.url).searchParams.get("itemId") || "";
  const existing = await prisma.packingItem.findFirst({ where: { id: itemId, tripId: id, OR: [{ scope: "shared" }, { scope: "personal", userId: auth.user!.id }] } });
  if (!existing) return NextResponse.json({ error: "Elemento non trovato" }, { status: 404 });
  await prisma.packingItem.delete({ where: { id: existing.id } });
  return NextResponse.json({ deleted: true });
}
