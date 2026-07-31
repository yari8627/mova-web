import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, deleteAvatar, saveAvatar } from "../../../../lib/avatar-storage";
import { currentUser } from "../../../../lib/auth";
import { createEmailToken } from "../../../../lib/email-tokens";
import { appUrl, sendMovaEmail } from "../../../../lib/email";
import { prisma } from "../../../../lib/prisma";

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const body = await request.json();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const passportCountry = String(body.passportCountry || "ITA").trim().toUpperCase();
  if (name.length < 2 || !email.includes("@")) return NextResponse.json({ error: "Inserisci un nome e un indirizzo email validi." }, { status: 400 });
  if (!/^[A-Z]{3}$/.test(passportCountry)) return NextResponse.json({ error: "Seleziona un Paese del passaporto valido." }, { status: 400 });
  const duplicate = await prisma.user.findFirst({ where: { id: { not: user.id }, OR: [{ email }, { pendingEmail: email }] } });
  if (duplicate) return NextResponse.json({ error: "Questo indirizzo email è già utilizzato." }, { status: 409 });
  const emailChanged = email !== user.email;
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { name, passportCountry, pendingEmail: emailChanged ? email : null } }),
    prisma.participant.updateMany({ where: { email: user.email }, data: { name } })
  ]);
  let previewUrl: string | undefined;
  if (emailChanged) { const token = await createEmailToken(user.id, "verify_email", 24); const path = `/verify-email/${token}`; const delivery = await sendMovaEmail({ to: email, subject: "Conferma la nuova email MOVA", title: "Conferma il nuovo indirizzo", intro: "Hai richiesto di usare questo indirizzo per il tuo account MOVA. Confermalo entro 24 ore.", actionLabel: "Conferma nuova email", actionUrl: `${appUrl(request)}${path}`, idempotencyKey: `email-change-${user.id}-${token.slice(0, 12)}` }); if (delivery.development) previewUrl = path; }
  return NextResponse.json({ updated: true, emailChanged, previewUrl });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) return NextResponse.json({ error: "Seleziona una foto." }, { status: 400 });
  const extension = AVATAR_MIME_TYPES.get(file.type);
  if (!extension || file.size > AVATAR_MAX_BYTES) return NextResponse.json({ error: "Usa JPG, PNG o WebP fino a 3 MB." }, { status: 400 });
  const record = await prisma.user.findUnique({ where: { id: user.id } });
  const key = `${randomUUID()}${extension}`;
  await saveAvatar(key, new Uint8Array(await file.arrayBuffer()), file.type);
  await prisma.user.update({ where: { id: user.id }, data: { avatarStorageKey: key, avatarMimeType: file.type } });
  await deleteAvatar(record?.avatarStorageKey);
  return NextResponse.json({ avatarUrl: `/api/auth/avatar/${user.id}?v=${Date.now()}` });
}
