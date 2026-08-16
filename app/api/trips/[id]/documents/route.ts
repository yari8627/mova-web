import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { DOCUMENT_MAX_BYTES, DOCUMENT_MIME_TYPES, saveDocumentFile } from "../../../../../lib/document-storage";
import { notifyTripMembers } from "../../../../../lib/notifications";
import { prisma } from "../../../../../lib/prisma";
import { tripAccess } from "../../../../../lib/trip-access";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const { id } = await params; const access = await tripAccess(id, user); if (!access.allowed) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File)) return NextResponse.json({ error: "Seleziona un file" }, { status: 400 });
  if (!DOCUMENT_MIME_TYPES.has(file.type)) return NextResponse.json({ error: "Sono ammessi soltanto PDF, PNG e JPG" }, { status: 415 });
  if (file.size <= 0 || file.size > DOCUMENT_MAX_BYTES) return NextResponse.json({ error: "Il file deve avere una dimensione massima di 10 MB" }, { status: 413 });
  const category = access.role === "participant" ? "personal" : form.get("category") === "shared" ? "shared" : "personal"; const storageKey = `${randomUUID()}${DOCUMENT_MIME_TYPES.get(file.type)}`;
  const bookingId = form.get("bookingId") ? String(form.get("bookingId")) : null;
  if (bookingId && !await prisma.booking.findFirst({ where: { id: bookingId, tripId: id }, select: { id: true } })) return NextResponse.json({ error: "Prenotazione non valida" }, { status: 400 });
  try {
    await saveDocumentFile(storageKey, new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (error) {
    console.error("Document storage upload failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Archivio documenti non disponibile" }, { status: 502 });
  }
  const document = await prisma.document.create({ data: { id: randomUUID(), tripId: id, name: String(form.get("name") || file.name.replace(/\.[^.]+$/, "")), category, fileName: file.name, size: file.size, offline: false, createdById: user.id, storageKey, mimeType: file.type, requirementKey: form.get("requirementKey") ? String(form.get("requirementKey")) : null, bookingId } });
  if (category === "shared") await notifyTripMembers(id, user.id, { type: "document", title: "Nuovo documento", message: `${user.name} ha aggiunto ${document.name}.`, link: `/trips/${id}/documents` });
  return NextResponse.json(document, { status: 201 });
}
