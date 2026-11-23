import { syncBookingActivities } from "./booking-itinerary";
import { randomBytes, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { currentUser } from "./auth";
import { tripAccess } from "./trip-access";
import { BookingDraft, Candidate, GmailCipher, GmailError, GMAIL_SCOPE, candidateKeys, gmailConfig, gmailHash, normalize, suggestTrip, validateDraft, trainDetails, previewQuality } from "./gmail-core";
import { GmailMessage, header, parseGmailMessage, type ParseDiagnostics } from "./gmail-parser";
import { airbnbTimingNotes, inLodgingZone, receivedRange, splitMailInstant } from "./gmail-dates";

type User = NonNullable<Awaited<ReturnType<typeof currentUser>>>;
type Connection = { user_id: string; id: string; account_hash: string; ciphertext: string };
type Tokens = { access: string; refresh: string; expires: number; email: string };
type Preview = { userId: string; connectionId: string; accountHash: string; sourceKey: string; fingerprint: string; referenceKey: string; expires: number; candidate: Candidate; matches: { id: string; hash: string; tripId: string }[] };
type BookingRow = Awaited<ReturnType<typeof prisma.booking.findMany>>[number];
const COOKIE = "nami_gmail_state";
const connectionContext = (userId: string, id: string) => `connection:${userId}:${id}`;
export async function gmailUser() { const user = await currentUser(); if (!user) throw new GmailError(401, "Accesso richiesto."); return user; }
async function sessionHash() { const token = (await cookies()).get("mova_session")?.value; if (!token) throw new GmailError(401, "Accesso richiesto."); return gmailHash(token); }
async function connection(userId: string, tx: Pick<Prisma.TransactionClient, "$queryRawUnsafe"> = prisma, lock = "") {
  const rows = await tx.$queryRawUnsafe<Connection[]>(`SELECT user_id,id::text,account_hash,ciphertext FROM nami_gmail.connection WHERE user_id=$1 ${lock}`, userId);
  if (!rows[0]) throw new GmailError(409, "Collega Gmail per continuare.");
  return rows[0];
}
async function googleJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) }); }
  catch { throw new GmailError(503, "Google non raggiungibile. Riprova."); }
  if (!response.ok) {
    if ([400, 401, 403].includes(response.status)) throw new GmailError(409, "Autorizzazione Gmail scaduta o revocata. Scollega e ricollega Gmail.");
    throw new GmailError(503, response.status === 429 ? "Limite Gmail raggiunto. Riprova più tardi." : "Gmail temporaneamente non disponibile.");
  }
  if (!response.body) throw new GmailError(503, "Risposta Gmail incompleta.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 2500000) { await reader.cancel(); throw new GmailError(422, "Email troppo grande per questa versione."); } chunks.push(next.value); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T; } catch { throw new GmailError(503, "Risposta Gmail non valida."); }
}
async function manageTrip(tripId: string, user: User) {
  const access = await tripAccess(tripId, user);
  if (!access.allowed || access.role === "participant") throw new GmailError(403, "Non puoi importare in questo viaggio.");
  return access.trip;
}
export async function gmailTrips(user: User, db: Pick<Prisma.TransactionClient, "trip"> = prisma) {
  return db.trip.findMany({ where: { OR: [{ ownerId: user.id }, { participants: { some: { email: { equals: user.email, mode: "insensitive" }, status: "confirmed", role: "co-organizer" } } }] }, select: { id: true, name: true, city: true, country: true, startDate: true, endDate: true }, orderBy: { startDate: "desc" } });
}
export async function gmailStatus(user: User) {
  gmailConfig(); const cipher = new GmailCipher();
  try { const c = await connection(user.id); const tokens = cipher.open<Tokens>(c.ciphertext, connectionContext(user.id, c.id)); return { connected: true, email: tokens.email }; }
  catch (e) { if (e instanceof GmailError && e.status === 409) return { connected: false }; throw e; }
}
export async function connectGmail(user: User, tripId: string) {
  const config = gmailConfig(), cipher = new GmailCipher(); await manageTrip(tripId, user);
  const state = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url"), stateHash = gmailHash(state), boundSession = await sessionHash();
  const expires = new Date(Date.now() + 600000);
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('DELETE FROM nami_gmail.oauth_state WHERE user_id=$1', user.id);
    await tx.$executeRawUnsafe('INSERT INTO nami_gmail.oauth_state(state_hash,user_id,session_hash,ciphertext,expires_at) VALUES($1,$2,$3,$4,$5)', stateHash, user.id, boundSession, cipher.seal({ verifier, tripId }, `oauth:${user.id}:${stateHash}`), expires);
  });
  (await cookies()).set(COOKIE, state, { httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax", path: "/api/gmail", maxAge: 600 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: `openid email ${GMAIL_SCOPE}`, access_type: "offline", prompt: "consent select_account", state, code_challenge: Buffer.from(gmailHash(verifier), "hex").toString("base64url"), code_challenge_method: "S256" }).toString();
  return { url: url.toString() };
}
export async function callbackGmail(user: User, request: Request) {
  const config = gmailConfig(), cipher = new GmailCipher(), u = new URL(request.url), jar = await cookies();
  const state = u.searchParams.get("state") || "", expected = jar.get(COOKIE)?.value;
  jar.set(COOKIE, "", { httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax", path: "/api/gmail", maxAge: 0 });
  if (u.origin !== config.origin || !expected || state !== expected || !/^[A-Za-z0-9_-]{43}$/.test(state)) throw new GmailError(400, "Collegamento scaduto. Ripeti da Prenotazioni.");
  const stateHash = gmailHash(state);
  const rows = await prisma.$queryRawUnsafe<{ ciphertext: string }[]>('DELETE FROM nami_gmail.oauth_state WHERE state_hash=$1 AND user_id=$2 AND session_hash=$3 AND expires_at>now() RETURNING ciphertext', stateHash, user.id, await sessionHash());
  if (!rows[0]) throw new GmailError(400, "Collegamento scaduto. Ripeti da Prenotazioni.");
  const pending = cipher.open<{ verifier: string; tripId: string }>(rows[0].ciphertext, `oauth:${user.id}:${stateHash}`);
  const tripId = pending.tripId; await manageTrip(tripId, user);
  if (u.searchParams.has("error")) return `${config.origin}/trips/${encodeURIComponent(tripId)}/bookings?gmail=denied`;
  const code = u.searchParams.get("code"); if (!code || code.length > 4096) throw new GmailError(400, "Autorizzazione Google incompleta.");
  const t = await googleJson<{ access_token?: string; refresh_token?: string; expires_in?: number; scope?: string }>("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code", code_verifier: pending.verifier }) });
  if (!t.access_token || !t.refresh_token || !t.scope?.split(" ").includes(GMAIL_SCOPE) || !Number.isFinite(t.expires_in) || Number(t.expires_in) < 1) throw new GmailError(409, "Permesso Gmail incompleto. Ripeti il consenso.");
  const profile = await googleJson<{ sub: string; email: string; email_verified: boolean }>("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } });
  if (!profile.sub || !profile.email || !profile.email_verified) throw new GmailError(409, "Account Google non verificato.");
  const id = randomUUID(), tokens: Tokens = { access: t.access_token, refresh: t.refresh_token, expires: Date.now() + Math.min(Number(t.expires_in), 86400) * 1000, email: profile.email };
  await prisma.$executeRawUnsafe('INSERT INTO nami_gmail.connection(user_id,id,account_hash,ciphertext) VALUES($1,$2::uuid,$3,$4) ON CONFLICT(user_id) DO UPDATE SET id=excluded.id,account_hash=excluded.account_hash,ciphertext=excluded.ciphertext,updated_at=now()', user.id, id, gmailHash(profile.sub), cipher.seal(tokens, connectionContext(user.id, id)));
  return `${config.origin}/trips/${encodeURIComponent(tripId)}/bookings?gmail=connected`;
}
async function gmailAccess(user: User) {
  const config = gmailConfig(), cipher = new GmailCipher();
  return prisma.$transaction(async tx => {
    const c = await connection(user.id, tx, "FOR UPDATE"), tokens = cipher.open<Tokens>(c.ciphertext, connectionContext(user.id, c.id));
    if (tokens.expires < Date.now() + 60000) {
      const t = await googleJson<{ access_token?: string; expires_in?: number; refresh_token?: string }>("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ refresh_token: tokens.refresh, client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token" }) });
      if (!t.access_token || !Number.isFinite(t.expires_in)) throw new GmailError(409, "Ricollega Gmail per continuare.");
      tokens.access = t.access_token; tokens.refresh = t.refresh_token || tokens.refresh; tokens.expires = Date.now() + Math.min(Number(t.expires_in), 86400) * 1000;
      await tx.$executeRawUnsafe('UPDATE nami_gmail.connection SET ciphertext=$1,updated_at=now() WHERE user_id=$2 AND id=$3::uuid', cipher.seal(tokens, connectionContext(user.id, c.id)), user.id, c.id);
    }
    return { connection: c, tokens };
  }, { timeout: 20000 });
}
export async function disconnectGmail(user: User) {
  const cipher = new GmailCipher(); let token: string | undefined, hadConnection = false;
  await prisma.$transaction(async tx => {
    const rows = await tx.$queryRawUnsafe<Connection[]>('DELETE FROM nami_gmail.connection WHERE user_id=$1 RETURNING user_id,id::text,account_hash,ciphertext', user.id);
    if (rows[0]) { hadConnection = true; const c = rows[0]; try { token = cipher.open<Tokens>(c.ciphertext, connectionContext(user.id, c.id)).refresh; } catch { /* Local removal must still succeed. */ } }
    await tx.$executeRawUnsafe('DELETE FROM nami_gmail.oauth_state WHERE user_id=$1', user.id);
  });
  let revoked = !hadConnection;
  if (token) try { const r = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(5000), redirect: "error" }); revoked = r.ok; } catch { /* Report remote revocation uncertainty without retaining tokens. */ }
  return { connected: false, revoked };
}
function bookingHash(b: BookingRow) { return gmailHash(JSON.stringify([b.id, b.tripId, b.title, b.type, b.startDate.toISOString(), b.endDate?.toISOString(), b.reference, b.status, b.provider, b.location, b.notes, b.originAirport, b.destinationAirport])); }
function bookingMatch(d: BookingDraft, b: BookingRow, updating=false) {
  if(d.type!==b.type)return false;
  const sameReference=!!d.reference && normalize(d.reference)===normalize(b.reference || "") && normalize(d.provider)===normalize(b.provider || "");
  if(d.type==="train"){
    if(!sameReference)return false;
    const a=trainDetails(d),other=trainDetails({...b,notes:b.notes || "",originAirport:b.originAirport || "",destinationAirport:b.destinationAirport || "",location:b.location || ""});
    for(const key of (updating?["from","to","passengers"]:["from","to","service","passengers","seat","coach"]) as (keyof typeof a)[])if(a[key] && other[key] && a[key]!==other[key])return false;
    if(a.route && other.route && !a.from && !other.from && a.route!==other.route)return false;
    return updating || !d.startDate || Date.parse(d.startDate)===b.startDate.getTime();
  }
  return sameReference || !!(d.startDate && d.startDate.slice(0,10)===b.startDate.toISOString().slice(0,10) && normalize(d.title)===normalize(b.title));
}
export async function searchGmail(user: User, input: { from: string; to: string; timeZone?: string; cursor?: string }) {
  if ("diagnoseTarget" in input) throw new GmailError(400, "Diagnostica temporanea rimossa. Ricarica NAMI.");
  const from = input.from, to = input.to;
  if (typeof from !== "string" || typeof to !== "string" || !/^\d{4}-\d\d-\d\d$/.test(from) || !/^\d{4}-\d\d-\d\d$/.test(to) || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || new Date(from).toISOString().slice(0, 10) !== from || new Date(to).toISOString().slice(0, 10) !== to || from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000 * 5) throw new GmailError(400, "Periodo non valido (massimo cinque anni).");
  const timeZone = input.timeZone;
  let range: { start: number; end: number };
  try { if (typeof timeZone !== "string" || timeZone.length > 100) throw Error(); range = receivedRange(from, to, timeZone); } catch { throw new GmailError(400, "Periodo o fuso di ricezione non valido."); }
  const cipher = new GmailCipher(), { connection: c, tokens } = await gmailAccess(user), trips = await gmailTrips(user);
  const cursor = input.cursor ? cipher.open<{ token: string; from: string; to: string; timeZone: string; connectionId: string; expires: number; seen?: string[] }>(input.cursor, `cursor:${user.id}`) : null;
  if (cursor && (cursor.from !== from || cursor.to !== to || cursor.timeZone !== timeZone || cursor.connectionId !== c.id || cursor.expires < Date.now())) throw new GmailError(400, "Ricerca scaduta. Ricomincia.");
  const seen=new Set<string>(cursor?.seen || []);
  let duplicates=0;
  const after = Math.floor(range.start / 1000) - 1, before = Math.ceil(range.end / 1000);
  const q = `after:${after} before:${before} -in:trash -in:spam {confirmation conferma confirmed confermata prenotazione reservation itinerary biglietto PNR "ticket number" "booking reference" cancellata cancelled annullata cancellazione rescheduled modifica "schedule change"}`;
  const params = new URLSearchParams({ q, maxResults: "10" }); if (cursor) params.set("pageToken", cursor.token);
  const list = await googleJson<{ messages?: { id: string }[]; nextPageToken?: string }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, { headers: { Authorization: `Bearer ${tokens.access}` } });
  const bookings = await prisma.booking.findMany({ where: { tripId: { in: trips.map(t => t.id) } } });
  const candidates: { key: string; identityKey: string; token: string; draft: BookingDraft; timing?: Candidate["timing"]; event: Candidate["event"]; warnings: string[]; email: { subject: string; from: string; date: string }; suggestedTripId: string | null; state: string; matches: { id: string; title: string; tripId: string; tripName: string }[] }[] = [];
  let oversized = 0, examined = 0, outsideRange = 0;
  const excluded: Partial<Record<NonNullable<ParseDiagnostics["excluded"]>|"insufficient_details", number>> = {};
  const fetched = await Promise.all((list.messages || []).slice(0, 10).filter(item => /^[a-zA-Z0-9_-]{1,128}$/.test(item.id)).map(async item => {
    try { return { item, message: await googleJson<GmailMessage>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`, { headers: { Authorization: `Bearer ${tokens.access}` } }) }; }
    catch (e) { if (e instanceof GmailError && e.status === 422) { oversized++;  return null; } throw e; }
  }));
  for (const fetchedMessage of fetched) {
    if (!fetchedMessage) continue;
    const { item, message } = fetchedMessage;
    const received = typeof message.internalDate === "string" && /^\d{1,16}$/.test(message.internalDate) ? Number(message.internalDate) : NaN;
    if (!Number.isFinite(received) || received < range.start || received >= range.end) { outsideRange++;  continue; }
    examined++;
    const diagnostics: ParseDiagnostics = {};
    const parsed = parseGmailMessage(message,diagnostics);
    if(diagnostics.excluded) excluded[diagnostics.excluded]=(excluded[diagnostics.excluded] || 0)+1;
    for (let i = 0; i < parsed.length; i++) {
      const candidate = parsed[i], keys = candidateKeys(candidate), sourceKey = gmailHash(`${item.id}:${i}`);
      const quality=previewQuality(candidate);
      if(quality==="Non riconosciuta"){excluded.insufficient_details=(excluded.insufficient_details || 0)+1;continue;}
      const identityKey=gmailHash(`${keys.fingerprint}:${candidate.event}`);
      if(seen.has(identityKey)){duplicates++;continue;}
      seen.add(identityKey);
      const ledger = await prisma.$queryRawUnsafe<{ booking_id: string | null; source_key: string; fingerprint: string; booking_exists: boolean }[]>('SELECT booking_id,source_key,fingerprint,EXISTS(SELECT 1 FROM public."Booking" b WHERE b.id=booking_id) AS booking_exists FROM nami_gmail.import_record WHERE user_id=$1 AND account_hash=$2 AND (source_key=$3 OR fingerprint=$4 OR (reference_key=$5 AND reference_key<>\'\'))', user.id, c.account_hash, sourceKey, keys.fingerprint, keys.referenceKey);
      const liveLedger = ledger.filter(r => r.booking_exists);
      const duplicate = liveLedger.some(r => r.source_key === sourceKey || r.fingerprint === keys.fingerprint);
      const matches = bookings.filter(b => bookingMatch(candidate.draft, b,candidate.event==="change") || liveLedger.some(r => r.booking_id === b.id));

      const proof: Preview = { userId: user.id, connectionId: c.id, accountHash: c.account_hash, sourceKey, ...keys, expires: Date.now() + 1800000, candidate, matches: matches.map(b => ({ id: b.id, tripId: b.tripId, hash: bookingHash(b) })) };
      candidates.push({ key: sourceKey, identityKey, token: cipher.seal(proof, `preview:${user.id}`), draft: candidate.draft, timing: candidate.timing, event: candidate.event, warnings: candidate.warnings, email: { subject: header(message.payload, "Subject").slice(0, 300), from: header(message.payload, "From").slice(0, 300), date: new Date(received).toISOString() }, suggestedTripId: suggestTrip({ ...candidate.draft, startDate: candidate.draft.startDate || candidate.timing?.start.date || "", endDate: candidate.draft.endDate || candidate.timing?.end.date || "" }, trips.map(t => ({ ...t, startDate: t.startDate.toISOString(), endDate: t.endDate.toISOString() }))), state: duplicate ? "Già presente" : matches.length ? "Da verificare" : quality, matches: matches.map(b => ({ id: b.id, title: b.title, tripId: b.tripId, tripName: trips.find(t => t.id === b.tripId)?.name || "Viaggio" })) });
    }
  }
  // Disconnect/reconnect during a search invalidates the entire response.
  if ((await connection(user.id)).id !== c.id) throw new GmailError(409, "Collegamento Gmail cambiato. Ripeti la ricerca.");
  return { candidates, trips, excluded, duplicates, examined, outsideRange, oversized, timeZone, nextCursor: list.nextPageToken ? cipher.seal({ token: list.nextPageToken, from, to, timeZone, connectionId: c.id, seen:[...seen].slice(-200), expires: Date.now() + 1800000 }, `cursor:${user.id}`) : null };
}
export type ImportChoice = { token: string; draft: unknown; tripId: string; action: "create" | "update"; bookingId?: string };
export async function importGmail(user: User, input: { confirm: boolean; choices: ImportChoice[] }) {
  if (input.confirm !== true || !Array.isArray(input.choices) || !input.choices.length || input.choices.length > 50) throw new GmailError(400, "Conferma esplicitamente da 1 a 50 prenotazioni.");
  const cipher = new GmailCipher();
  const prepared = input.choices.map(choice => {
    if (!choice || typeof choice.token !== "string" || typeof choice.tripId !== "string" || !["create", "update"].includes(choice.action)) throw new GmailError(400, "Selezione non valida.");
    const proof = cipher.open<Preview>(choice.token, `preview:${user.id}`);
    if (proof.userId !== user.id || proof.expires < Date.now() || proof.candidate.event === "cancellation") throw new GmailError(409, "Anteprima scaduta o cancellazione: ripeti la ricerca e verifica manualmente.");
    if(previewQuality(proof.candidate)==="Non riconosciuta")throw new GmailError(400,"Informazioni insufficienti per importare questa email.");
    const draft = validateDraft(choice.draft);
    if(/^(?:Volo|Treno|Trasporto|Soggiorno(?: Airbnb)?|Attività|Noleggio auto) da completare$/i.test(draft.title) || (["flight","train"].includes(draft.type) && (!draft.provider || !draft.originAirport || !draft.destinationAirport)))throw new GmailError(400,"Completa nome, operatore e tratta nei dettagli prima di importare.");
    if (proof.candidate.timing?.end.raw && !draft.endDate) throw new GmailError(400, "Completa anche la data, l’ora e il fuso di fine presenti nell’email.");
    if (["Airbnb","Booking.com"].includes(proof.candidate.draft.provider) && proof.candidate.draft.type === "hotel" && proof.candidate.timing && (proof.candidate.timing.start.qualifier || proof.candidate.timing.end.qualifier)) {
      const preserve = (which: "start" | "end", instant: string) => {
        const time = splitMailInstant(instant), source = proof.candidate.timing![which], zone = source.zone;
        return { ...time, qualifier: source.qualifier, ...(zone && inLodgingZone({...time,offset:""},zone).offset === time.offset ? {zone} : {}) };
      };
      draft.notes = [draft.notes.split("\n").filter(line=>!/^Check-(?:in|out) (?:Airbnb|Booking\.com):/.test(line)).join("\n"),airbnbTimingNotes(preserve("start",draft.startDate),preserve("end",draft.endDate),proof.candidate.draft.provider)].filter(Boolean).join("\n");
      if (draft.notes.length>4000) throw new GmailError(400,"Note troppo lunghe: riduci il testo mantenendo i limiti orari del soggiorno.");
    }
    return { choice, proof, draft };
  }).sort((a, b) => (a.proof.referenceKey || a.proof.fingerprint).localeCompare(b.proof.referenceKey || b.proof.fingerprint));
  const results: { key: string; status: string; error?: string }[] = [];
  for (const { choice, proof, draft } of prepared) {
    try {
    await manageTrip(choice.tripId, user);
    const result = await prisma.$transaction(async tx => {
      const c = await connection(user.id, tx, "FOR SHARE");
      if (c.id !== proof.connectionId || c.account_hash !== proof.accountHash) throw new GmailError(409, "Collegamento cambiato. Ripeti la ricerca.");
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text', `${user.id}:${c.account_hash}`);
      // Lock permission-bearing rows; a concurrent role removal must precede or follow the import.
      await tx.$queryRawUnsafe('SELECT id FROM public."Trip" WHERE id=$1 FOR UPDATE', choice.tripId);
      await tx.$queryRawUnsafe('SELECT id FROM public."Participant" WHERE "tripId"=$1 FOR SHARE', choice.tripId);
      const trip = await tx.trip.findUnique({ where: { id: choice.tripId }, include: { participants: true } });
      if (!trip || !(trip.ownerId === user.id || trip.participants.some(p => p.email.toLowerCase() === user.email.toLowerCase() && p.status === "confirmed" && p.role === "co-organizer"))) throw new GmailError(403, "Permesso viaggio non più valido.");
      // Reclaim only this user's matching orphan mappings, under the same import lock.
      // Manual booking sync keeps IDs but replaces rows; never delete a mapping to a live booking.
      await tx.$executeRawUnsafe('DELETE FROM nami_gmail.import_record r WHERE user_id=$1 AND account_hash=$2 AND (source_key=$3 OR fingerprint=$4 OR (reference_key=$5 AND reference_key<>\'\')) AND NOT EXISTS(SELECT 1 FROM public."Booking" b WHERE b.id=r.booking_id)', user.id, c.account_hash, proof.sourceKey, proof.fingerprint, proof.referenceKey);
      const rows = await tx.$queryRawUnsafe<{ source_key: string; fingerprint: string; booking_id: string | null }[]>('SELECT source_key,fingerprint,booking_id FROM nami_gmail.import_record WHERE user_id=$1 AND account_hash=$2 AND (source_key=$3 OR fingerprint=$4 OR (reference_key=$5 AND reference_key<>\'\'))', user.id, c.account_hash, proof.sourceKey, proof.fingerprint, proof.referenceKey);
      if (rows.some(r => r.source_key === proof.sourceKey || r.fingerprint === proof.fingerprint)) return "saltata: già presente";
      const accessibleTrips = await gmailTrips(user,tx);
      const existing = await tx.booking.findMany({ where: { tripId: { in: accessibleTrips.map(t => t.id) } } });
      const matches = existing.filter(b => bookingMatch(draft, b,proof.candidate.event==="change") || rows.some(r => r.booking_id === b.id));
      if (choice.action === "create" && (proof.candidate.event === "change" || matches.length || rows.length)) throw new GmailError(409, "Possibile aggiornamento o duplicato: seleziona la prenotazione da aggiornare.");
      let id: string = randomUUID();
      const boundedStay = proof.candidate.timing?.start.qualifier || proof.candidate.timing?.end.qualifier;
      const sourceTimes = `${boundedStay ? "Limiti orari origine Gmail (non appuntamenti)" : "Orari origine Gmail"}: ${draft.startDate}${draft.endDate ? ` → ${draft.endDate}` : ""}`;
      const data = { ...draft, notes: [draft.notes, sourceTimes].filter(Boolean).join("\n"), startDate: new Date(draft.startDate), endDate: draft.endDate ? new Date(draft.endDate) : null, source: "email", importedAt: new Date() };
      if (choice.action === "update") {
        const match = proof.matches.find(b => b.id === choice.bookingId && b.tripId === choice.tripId);
        if (!match) throw new GmailError(409, "Aggiornamento non presente nell’anteprima.");
        await tx.$queryRawUnsafe('SELECT id FROM public."Booking" WHERE id=$1 AND "tripId"=$2 FOR UPDATE', match.id, choice.tripId);
        const current = await tx.booking.findUnique({ where: { id: match.id } });
        if (!current || bookingHash(current) !== match.hash) throw new GmailError(409, "Prenotazione modificata nel frattempo. Ripeti la ricerca.");
        id = match.id; await tx.booking.update({ where: { id }, data });
      } else { await tx.booking.create({ data: { id, tripId: choice.tripId, ...data } }); }
      await syncBookingActivities(tx, choice.tripId, [{ id, ...draft, notes: data.notes }]);
      await tx.$executeRawUnsafe('INSERT INTO nami_gmail.import_record(id,user_id,account_hash,source_key,fingerprint,reference_key,booking_id) VALUES($1::uuid,$2,$3,$4,$5,$6,$7)', randomUUID(), user.id, c.account_hash, proof.sourceKey, proof.fingerprint, proof.referenceKey, id);
      return choice.action === "update" ? "aggiornata" : "importata";
    }, { timeout: 10000 });
    results.push({ key: proof.sourceKey, status: result });
    } catch (e) { results.push({ key: proof.sourceKey, status: "non importata", error: e instanceof GmailError ? e.message : "Salvataggio non riuscito. Ripeti la ricerca." }); }
  }
  return { results };
}
