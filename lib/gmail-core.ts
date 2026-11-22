import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export class GmailError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export const gmailHash = (s: string) => createHash("sha256").update(s).digest("hex");
export const normalize = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export function gmailConfig(env = process.env) {
  const origin = env.NAMI_GMAIL_ORIGIN || "";
  try {
    const u = new URL(origin);
    if (u.origin !== origin || u.username || u.password || (u.protocol !== "https:" && !(env.NODE_ENV !== "production" && u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)))) throw Error();
    const clientId = env.NAMI_GMAIL_CLIENT_ID, clientSecret = env.NAMI_GMAIL_CLIENT_SECRET;
    if (env.NAMI_GMAIL_ENABLED !== "1" || !clientId || !clientSecret) throw Error();
    return { origin, clientId, clientSecret, redirectUri: `${origin}/api/gmail/callback` };
  } catch { throw new GmailError(503, "Importazione Gmail non configurata."); }
}
export function gmailWriteOrigin(request: Request) {
  const { origin } = gmailConfig();
  if (new URL(request.url).origin !== origin || request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") throw new GmailError(403, "Richiesta non autorizzata.");
}
export class GmailCipher {
  private keys = new Map<number, Buffer>();
  private version: number;
  constructor(env = process.env) {
    this.version = Number(env.NAMI_GMAIL_KEY_VERSION);
    try {
      const keys = JSON.parse(env.NAMI_GMAIL_TOKEN_KEYS || "null");
      if (!keys || typeof keys !== "object" || Array.isArray(keys)) throw Error();
      for (const [k, v] of Object.entries(keys)) {
        if (!/^[1-9]\d{0,3}$/.test(k) || typeof v !== "string") throw Error();
        const bytes = Buffer.from(v, "base64url");
        if (bytes.length !== 32 || bytes.toString("base64url") !== v) throw Error();
        this.keys.set(Number(k), bytes);
      }
      if (!this.keys.has(this.version)) throw Error();
    } catch { throw new GmailError(503, "Protezione Gmail non configurata."); }
  }
  seal(value: unknown, context: string) {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", this.keys.get(this.version)!, iv);
    cipher.setAAD(Buffer.from(`nami-gmail-v1:${context}`));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return `${this.version}.${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")}`;
  }
  open<T>(value: string, context: string): T {
    try {
      const [v, data, extra] = value.split("."), key = this.keys.get(Number(v));
      if (!key || !data || extra || data.length > 60000) throw Error();
      const bytes = Buffer.from(data, "base64url");
      if (bytes.length < 29 || bytes.toString("base64url") !== data) throw Error();
      const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      cipher.setAAD(Buffer.from(`nami-gmail-v1:${context}`)); cipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8"));
    } catch { throw new GmailError(400, "Anteprima o collegamento non valido. Ripeti la ricerca."); }
  }
}
export type BookingDraft = {
  title: string; type: "flight" | "hotel" | "train" | "car" | "activity";
  startDate: string; endDate: string; reference: string; provider: string; location: string;
  notes: string; originAirport: string; destinationAirport: string; status: "confirmed" | "pending";
};
export type Candidate = { draft: BookingDraft; warnings: string[]; event: "confirmation" | "change" | "cancellation" | "uncertain"; flightNumber?: string; timing?: { start: import("./gmail-dates").MailTime; end: import("./gmail-dates").MailTime } };
export function validInstant(s: string) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(s) || !Number.isFinite(Date.parse(s))) return false;
  const day = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  const offset = s.match(/[+-](\d\d):(\d\d)$/);
  return day.toISOString().slice(0, 10) === s.slice(0, 10) && Number(s.slice(11, 13)) < 24 && Number(s.slice(14, 16)) < 60 && (!offset || (Number(offset[1]) <= 14 && Number(offset[2]) < 60 && (Number(offset[1]) < 14 || Number(offset[2]) === 0)));
}
export function validateDraft(value: unknown): BookingDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GmailError(400, "Prenotazione non valida.");
  const v = value as Record<string, unknown>, out = {} as Record<string, string>;
  for (const k of ["title", "type", "startDate", "endDate", "reference", "provider", "location", "notes", "originAirport", "destinationAirport", "status"]) {
    if (typeof v[k] !== "string" || (v[k] as string).length > (k === "notes" ? 4000 : 500) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v[k] as string)) throw new GmailError(400, "Campi non validi.");
    out[k] = (v[k] as string).trim();
  }
  if (!out.title || !["flight", "hotel", "train", "car", "activity"].includes(out.type) || !["confirmed", "pending"].includes(out.status) || !validInstant(out.startDate) || (out.endDate && (!validInstant(out.endDate) || Date.parse(out.endDate) < Date.parse(out.startDate)))) throw new GmailError(400, "Controlla titolo, date e fusi orari.");
  return out as BookingDraft;
}
export function candidateKeys(c: Candidate) {
  const d = c.draft;
  const referenceKey = d.reference ? gmailHash([d.type, normalize(d.provider), normalize(d.reference), normalize(d.originAirport), normalize(d.destinationAirport), normalize(c.flightNumber || "")].join("|")) : "";
  const fingerprint = gmailHash([referenceKey, d.type, normalize(d.title), normalize(d.provider), d.startDate, d.endDate, normalize(d.location)].join("|"));
  return { referenceKey, fingerprint };
}
const geographicAliases = [
  ["norvegia","norway","norge","tromso","balsfjord","tos"],
  ["londra","london","lhr","lgw","stn","ltn"],
  ["roma","rome","fco","cia"], ["milano","milan","mxp","lin","bgy"],
  ["parigi","paris","cdg","ory"],
];
export function suggestTrip(draft: BookingDraft, trips: { id: string; name?: string; city: string; country: string; startDate: string; endDate: string }[]) {
  if (!draft.startDate) return null;
  const start=draft.startDate.slice(0,10), end=(draft.endDate || draft.startDate).slice(0,10);
  if (end < start) return null;
  const words=`${draft.location} ${draft.destinationAirport}`.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/);
  const place=normalize(`${draft.location} ${draft.destinationAirport}`);
  const aliases=geographicAliases.filter(group=>group.some(word=>words.includes(word)));
  const scored=trips.filter(t=>t.startDate.slice(0,10)<=start && t.endDate.slice(0,10)>=end).map(t=>{
    const city=normalize(t.city),country=normalize(t.country),name=normalize(t.name || "");
    const direct=city.length>2 && place.includes(city), nameMatch=name.length>3 && place.includes(name);
    const nameWords=(t.name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/);
    const regional=aliases.some(group=>group.some(word=>city===word || nameWords.includes(word) || country===word));
    return {id:t.id,score:direct?4:nameMatch?3:regional?2:country.length>3 && place.includes(country)?2:0};
  }).filter(t=>t.score>=2).sort((a,b)=>b.score-a.score);
  return scored.length && (scored.length===1 || scored[0].score>scored[1].score) ? scored[0].id : null;
}
