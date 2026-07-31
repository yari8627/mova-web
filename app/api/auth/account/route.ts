import { NextResponse } from "next/server";
import { currentUser, verifyPassword } from "../../../../lib/auth";
import { deleteAvatar } from "../../../../lib/avatar-storage";
import { deleteDocumentFile } from "../../../../lib/document-storage";
import { prisma } from "../../../../lib/prisma";

export async function GET() {
  const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const record = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordLogin: true, _count: { select: { trips: true } }, trips: { select: { id: true, name: true }, orderBy: { startDate: "asc" } } } });
  return NextResponse.json({ requiresPassword: record?.passwordLogin ?? true, ownedTrips: record?.trips || [], ownedTripsCount: record?._count.trips || 0 });
}

export async function DELETE(request: Request) {
  const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const body = await request.json();
  if (String(body.confirmation || "").trim().toUpperCase() !== "ELIMINA") return NextResponse.json({ error: "Scrivi ELIMINA per confermare." }, { status: 400 });
  const record = await prisma.user.findUnique({ where: { id: user.id }, include: { trips: { select: { id: true, name: true } }, documents: { select: { storageKey: true } } } });
  if (!record) return NextResponse.json({ error: "Account non trovato" }, { status: 404 });
  if (record.passwordLogin && !verifyPassword(String(body.password || ""), record.passwordHash)) return NextResponse.json({ error: "La password non è corretta." }, { status: 400 });
  if (record.trips.length) return NextResponse.json({ error: "Trasferisci o elimina prima i viaggi di cui sei proprietario.", ownedTrips: record.trips }, { status: 409 });
  await Promise.all(record.documents.map((document) => deleteDocumentFile(document.storageKey)));
  await deleteAvatar(record.avatarStorageKey);
  await prisma.$transaction([
    prisma.participant.deleteMany({ where: { email: record.email } }),
    prisma.tripInvite.deleteMany({ where: { email: record.email, status: "pending" } }),
    prisma.user.delete({ where: { id: record.id } })
  ]);
  return NextResponse.json({ deleted: true });
}
