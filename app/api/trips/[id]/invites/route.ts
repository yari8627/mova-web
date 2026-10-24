import { createHash, randomBytes, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { tripAccess } from "../../../../../lib/trip-access";
import { appUrl, sendMovaEmail } from "../../../../../lib/email";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const { id } = await params; const access = await tripAccess(id, user); if (!access.allowed) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  const trip = await prisma.trip.findUnique({ where: { id } }); if (!trip || (access.role !== "owner" && access.role !== "co-organizer")) return NextResponse.json({ error: "Non hai il permesso di invitare partecipanti" }, { status: 403 });
  const body = await request.json(); const email = String(body.email || "").trim().toLowerCase(); const pendingName = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("it")) || "Invitato"; const name = String(body.name || "").trim() || pendingName; const role = access.role === "owner" && body.role === "co-organizer" ? "co-organizer" : "participant";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Inserisci un indirizzo email valido" }, { status: 400 });
  if (email === user.email.toLowerCase()) return NextResponse.json({ error: "Sei già il proprietario del viaggio" }, { status: 400 });
  const intent = body.intent ?? "send";
  const key = request.headers?.get("Idempotency-Key") || "";
  if (!["send", "status", "resend"].includes(intent) || key && !/^[A-Za-z0-9_-]{16,128}$/.test(key) || intent === "resend" && (!key || typeof body.resendOf !== "string")) return NextResponse.json({ error: "Operazione invito non valida" }, { status: 400 });
  const operationId = key ? createHash("sha256").update(JSON.stringify([user.id, id, key])).digest("hex") : null;
  const authMs = Date.now() - started, transactionStart = Date.now();
  let notificationMs = 0;
  const outcome = await prisma.$transaction(async tx => {
    // Serialize retries across server instances, sharing the lock with acceptance/sync.
    await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id" = ${id} FOR UPDATE`;
    const previous = await tx.participant.findFirst({ where: { tripId: id, email: { equals: email, mode: "insensitive" } } });
    const sameRecipient = (record: { tripId: string; email: string }) => record.tripId === id && record.email.trim().toLowerCase() === email;
    const recorded = operationId ? await tx.tripInvite.findUnique({ where: { id: operationId } }) : null;
    if (recorded && (!sameRecipient(recorded) || recorded.role !== role)) return { error: "La chiave di invio è già associata a un’altra operazione." };
    if (recorded && (recorded.status === "pending" && recorded.expiresAt <= new Date() || !["pending", "accepted"].includes(recorded.status))) return { error: "Questo invito non è più disponibile. Conferma un reinvio esplicito.", code: "RESEND_REQUIRED", resendOf: recorded.id };
    if (recorded && previous) return { participant: previous, invite: recorded };
    if (recorded) return { error: "La partecipazione non è più disponibile. Avvia un nuovo invio esplicito." };
    if (intent === "status") {
      const known = await tx.tripInvite.findFirst({ where: { tripId: id, email: { equals: email, mode: "insensitive" }, ...(previous?.status === "confirmed" ? { status: { in: ["pending", "accepted"] } } : { status: "pending", role, expiresAt: { gt: new Date() } }) }, orderBy: { createdAt: "desc" } });
      return previous && known ? { participant: previous, invite: known } : { found: false };
    }
    if (intent === "resend") {
      const base = await tx.tripInvite.findUnique({ where: { id: body.resendOf } });
      if (!base || !sameRecipient(base)) return { error: "Invito da reinviare non valido." };
    }
    const reusable = await tx.tripInvite.findFirst({ where: { tripId: id, email: { equals: email, mode: "insensitive" }, ...(previous?.status === "confirmed" ? { status: { in: ["pending", "accepted"] } } : { status: "pending", role, expiresAt: { gt: new Date() } }) }, orderBy: { createdAt: "desc" } });
    if (!reusable && intent === "send" && previous?.status !== "confirmed") {
      const history = await tx.tripInvite.findFirst({ where: { tripId: id, email: { equals: email, mode: "insensitive" } }, orderBy: { createdAt: "desc" } });
      if (history) return { error: "Esiste un invito precedente non più utilizzabile. Conferma un reinvio esplicito.", code: "RESEND_REQUIRED", resendOf: history.id };
    }
    const participant = previous?.status === "confirmed" ? previous : await tx.participant.upsert({ where: { tripId_email: { tripId: id, email } }, update: { name, role, status: "pending" }, create: { id: randomUUID(), tripId: id, name, email, role, status: "pending" } });
    if (reusable && (intent !== "resend" || participant.status === "confirmed" || reusable.id !== body.resendOf)) return { participant, invite: reusable };
    await tx.tripInvite.updateMany({ where: { tripId: id, email: { equals: email, mode: "insensitive" }, status: "pending" }, data: { status: "replaced" } });
    const invite = await tx.tripInvite.create({ data: { id: operationId || randomUUID(), code: `NAMI-${randomBytes(5).toString("hex").toUpperCase()}`, tripId: id, email, name, role, expiresAt: new Date(Date.now() + 14 * 86400000) } });
    const invitedUser = await tx.user.findUnique({ where: { email } });
    const notificationStarted = Date.now();
    if (invitedUser && participant.status !== "confirmed") await tx.notification.upsert({ where: { dedupeKey: `invite-${invite.id}` }, update: {}, create: { id: randomUUID(), dedupeKey: `invite-${invite.id}`, userId: invitedUser.id, tripId: id, type: "invite", title: "Nuovo invito", message: `${user.name} ti ha invitato a ${trip.name}.`, link: `/invite/${invite.code}` } });
    notificationMs = Date.now() - notificationStarted;
    return { participant, invite };
  }).catch(() => null);
  const transactionMs = Date.now() - transactionStart;
  if (!outcome) return NextResponse.json({ error: "Non è stato possibile verificare l’invito. Riprova con la stessa operazione.", uncertain: true }, { status: 503 });
  if ("error" in outcome) return NextResponse.json(outcome, { status: 409 });
  if ("found" in outcome) return NextResponse.json({ found: false, userId: user.id });
  const { participant, invite } = outcome;
  if (intent === "status") return NextResponse.json({ found: true, userId: user.id, participant, code: invite.code, link: `/invite/${invite.code}`, expiresAt: invite.expiresAt, emailStatus: "not_confirmed" });
  const emailStarted = Date.now();
  let emailStatus = "not_required";
  try {
    if (participant.status !== "confirmed") {
      const delivery = await sendMovaEmail({ to: email, subject: `${user.name} ti invita su NAMI`, title: `Unisciti al viaggio ${trip.name}`, intro: `${user.name} ti ha invitato a partecipare al viaggio ${trip.name}, con destinazione ${trip.city}, ${trip.country}.`, actionLabel: "Accetta l’invito", actionUrl: `${appUrl(request)}/invite/${invite.code}`, footer: "L’invito scade tra 14 giorni. Se non conosci il mittente, puoi ignorare questa email.", idempotencyKey: `invite-${invite.id}` }, { signal: AbortSignal.timeout(12000), quiet: true });
      emailStatus = delivery?.sent ? "accepted_by_provider" : "not_confirmed";
    }
  } catch { emailStatus = "not_confirmed"; }
  const emailMs = Date.now() - emailStarted;
  return NextResponse.json({ userId: user.id, participant, inviteId: invite.id, code: invite.code, link: `/invite/${invite.code}`, expiresAt: invite.expiresAt, emailStatus }, { status: 201, headers: { "Server-Timing": `invite_auth;dur=${authMs}, invite_tx;dur=${transactionMs}, invite_notification;dur=${notificationMs}, invite_email;dur=${emailMs}, invite_total;dur=${Date.now() - started}` } });
}
