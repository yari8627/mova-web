import { NextResponse } from "next/server";
import { GmailError, gmailWriteOrigin } from "./gmail-core";
import { gmailUser } from "./gmail-server";

export function gmailResponse(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } }); }
export async function gmailBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new GmailError(415, "Formato richiesta non valido.");
  if (Number(request.headers.get("content-length")) > 1500000) throw new GmailError(413, "Seleziona meno prenotazioni.");
  if (!request.body) throw new GmailError(400, "Richiesta vuota.");
  const reader = request.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  try { for (;;) { const r = await reader.read(); if (r.done) break; size += r.value.length; if (size > 1500000) { await reader.cancel(); throw new GmailError(413, "Seleziona meno prenotazioni."); } parts.push(r.value); } }
  finally { reader.releaseLock(); }
  try { const data = JSON.parse(Buffer.concat(parts).toString("utf8")); if (!data || typeof data !== "object" || Array.isArray(data)) throw Error(); return data; }
  catch { throw new GmailError(400, "Richiesta non valida."); }
}
export async function gmailRoute(request: Request, write: boolean, action: (user: NonNullable<Awaited<ReturnType<typeof gmailUser>>>) => Promise<unknown>) {
  try { const user = await gmailUser(); if (write) gmailWriteOrigin(request); return gmailResponse(await action(user)); }
  catch (e) { return gmailResponse({ error: e instanceof GmailError ? e.message : "Importazione Gmail non disponibile. Verifica la configurazione e riprova." }, e instanceof GmailError ? e.status : 503); }
}
