import { BookingDraft, Candidate, validInstant } from "./gmail-core";

export type GmailPart = { mimeType?: string; filename?: string; headers?: { name: string; value: string }[]; body?: { data?: string; size?: number }; parts?: GmailPart[] };
export type GmailMessage = { id: string; internalDate?: string; snippet?: string; payload?: GmailPart };
const clean = (s: string) => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").slice(0, 200000);
export function decodeHeader(value: string) {
  return clean(value.replace(/=\?([^?]+)\?([bq])\?([^?]+)\?=/gi, (_, charset: string, enc: string, data: string) => {
    try {
      const bytes = enc.toLowerCase() === "b" ? Buffer.from(data, "base64") : Buffer.from(data.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (_: string, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1");
      return new TextDecoder(charset).decode(bytes);
    } catch { return "[intestazione da verificare]"; }
  }));
}
export function header(part: GmailPart | undefined, name: string) { return decodeHeader(part?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ""); }
export function htmlText(html: string) {
  return clean(html.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<(?:br|\/p|\/div|\/tr|\/li)\b[^>]*>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|\d+);/gi, s => {
    const map: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
    if (map[s.toLowerCase()]) return map[s.toLowerCase()];
    const hex = s[2].toLowerCase() === "x", n = parseInt(s.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
  }));
}
export function messageBodies(message: GmailMessage) {
  const plain: string[] = [], html: string[] = [];
  let visited = 0, bytes = 0;
  function walk(p: GmailPart, depth: number) {
    if (depth > 15 || ++visited > 100 || p.filename) return;
    if (p.body?.data && ["text/plain", "text/html"].includes(p.mimeType || "")) {
      const data = Buffer.from(p.body.data, "base64url"); bytes += data.length;
      if (bytes > 1000000) return;
      const charset = header(p, "Content-Type").match(/charset=["']?([^;\s"']+)/i)?.[1] || "utf-8";
      let text: string; try { text = new TextDecoder(charset).decode(data); } catch { text = data.toString("utf8"); }
      (p.mimeType === "text/html" ? html : plain).push(clean(text));
    }
    p.parts?.forEach(part => walk(part, depth + 1));
  }
  if (message.payload) walk(message.payload, 0);
  return { text: plain.length ? plain.join("\n") : html.map(htmlText).join("\n"), html };
}
const blank = (): BookingDraft => ({ title: "", type: "activity", startDate: "", endDate: "", reference: "", provider: "", location: "", notes: "", originAirport: "", destinationAirport: "", status: "confirmed" });
function dateValue(raw: string, warnings: string[]) {
  const value = raw.trim();
  if (validInstant(value)) return value;
  if (value) warnings.push(`Data/ora senza fuso o ambigua: ${value.slice(0, 100)}`);
  return "";
}
function readLine(text: string, names: string) { return text.match(new RegExp(`(?:^|\\n)\\s*(?:${names})\\s*[:：]\\s*([^\\n]+)`, "i"))?.[1]?.trim().slice(0, 500) || ""; }
function structured(html: string[], warnings: string[]): Candidate[] {
  const found: Candidate[] = [];
  for (const doc of html) for (const match of doc.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1].length > 100000) continue;
    let root: unknown; try { root = JSON.parse(match[1]); } catch { continue; }
    let count = 0;
    function visit(value: unknown, depth = 0) {
      if (!value || typeof value !== "object" || depth > 8 || ++count > 100) return;
      if (Array.isArray(value)) { value.forEach(v => visit(v, depth + 1)); return; }
      const v = value as Record<string, unknown>, type = String(v["@type"] || "").replace(/^https?:\/\/schema.org\//, "");
      const kinds: Record<string, BookingDraft["type"]> = { FlightReservation: "flight", LodgingReservation: "hotel", TrainReservation: "train", BusReservation: "train", RentalCarReservation: "car", EventReservation: "activity", TaxiReservation: "car", BoatReservation: "train" };
      if (kinds[type]) {
        const d = blank(), w = [...warnings], r = (v.reservationFor && typeof v.reservationFor === "object" ? v.reservationFor : {}) as Record<string, unknown>;
        const name = (x: unknown): string => typeof x === "string" ? x.slice(0, 500) : x && typeof x === "object" ? String((x as Record<string, unknown>).name || (x as Record<string, unknown>).iataCode || "").slice(0, 500) : "";
        const address = (x: unknown): string => typeof x === "string" ? x : x && typeof x === "object" ? ["streetAddress", "addressLocality", "addressCountry"].map(k => name((x as Record<string, unknown>)[k])).filter(Boolean).join(", ") : "";
        d.type = kinds[type]; d.title = name(r.name) || name(v.name);
        d.provider = name(r.airline) || name(r.provider) || name(v.provider) || (d.type === "hotel" ? name(r.name) : "");
        d.reference = name(v.reservationNumber) || name(v.reservationId);
        d.originAirport = name(r.departureAirport); d.destinationAirport = name(r.arrivalAirport);
        const route = [name(r.departureStation) || name(r.departureBusStop) || name(v.pickupLocation) || d.originAirport, name(r.arrivalStation) || name(r.arrivalBusStop) || name(v.dropoffLocation) || d.destinationAirport].filter(Boolean).join(" → ");
        d.location = address(r.address) || name(r.location) || route;
        d.startDate = dateValue(String(v.checkinTime || v.pickupTime || r.departureTime || r.startDate || ""), w);
        d.endDate = dateValue(String(v.checkoutTime || v.dropoffTime || r.arrivalTime || r.endDate || ""), w);
        const flightNumber = name(r.flightNumber); if (flightNumber) d.notes = `Numero volo: ${flightNumber}`;
        const guests = v.numAdults || v.numGuests; if (guests && /^\d+$/.test(String(guests))) d.notes += `${d.notes ? "\n" : ""}Ospiti: ${guests}`;
        const passenger = name(v.underName); if (passenger) d.notes += `${d.notes ? "\n" : ""}Intestatario: ${passenger}`;
        const status = String(v.reservationStatus || "");
        const event = /cancel/i.test(status) ? "cancellation" : "confirmation";
        if (!d.title) { d.title = [d.provider, flightNumber, d.location].filter(Boolean).join(" · "); w.push("Titolo da verificare"); }
        if (!d.startDate) w.push("Data e fuso orario richiesti");
        found.push({ draft: d, warnings: w, event, flightNumber }); return;
      }
      Object.values(v).forEach(x => visit(x, depth + 1));
    }
    visit(root);
  }
  return found.slice(0, 12);
}
export function parseGmailMessage(message: GmailMessage): Candidate[] {
  const subject = header(message.payload, "Subject"), bodies = messageBodies(message), text = `${subject}\n${bodies.text}`;
  const event = /cancellat|cancelled|canceled|annullat|refund|rimborso/i.test(text) ? "cancellation" : /modific|reschedul|updated booking|booking change|schedule change/i.test(text) ? "change" : "confirmation";
  // Offers alone are never booking evidence. Require explicit confirmation/reference markers.
  if (!/conferma|confermat|confirmation|confirmed|reservation|prenotazione|booking reference|itinerary|e-ticket|biglietto|cancellat|cancelled|annullat|reschedul/i.test(text)) return [];
  const known = structured(bodies.html, []);
  if (known.length) return known.map(c => ({ ...c, event: event === "confirmation" ? c.event : event }));
  const d = blank(), warnings = ["Formato non strutturato: verifica tutti i dati."];
  const matchType = /flight|volo|airline|aeroporto/i.test(text) ? "flight" : /hotel|check.in|alloggio|lodging|accommodation/i.test(text) ? "hotel" : /car rental|auto a noleggio|autonoleggio/i.test(text) ? "car" : /train|treno|bus|traghetto|ferry|rail/i.test(text) ? "train" : /activity|attivit|excursion|escursion|tour|ticket|bigliett/i.test(text) ? "activity" : null;
  if (!matchType) return [];
  d.type = matchType; d.title = readLine(bodies.text, "Hotel|Struttura|Activity|Attività|Nome|Name|Titolo") || subject.slice(0, 200);
  d.reference = readLine(bodies.text, "PNR|Booking reference|Booking code|Codice prenotazione|Confirmation number|Codice conferma|Reservation number");
  d.provider = readLine(bodies.text, "Airline|Compagnia|Operator|Operatore|Provider|Struttura|Hotel");
  d.location = readLine(bodies.text, "Location|Luogo|Address|Indirizzo|Destination|Destinazione");
  d.originAirport = readLine(bodies.text, "From|Da|Departure airport|Aeroporto partenza");
  d.destinationAirport = readLine(bodies.text, "To|A|Arrival airport|Aeroporto arrivo");
  if (!d.location) d.location = [d.originAirport, d.destinationAirport].filter(Boolean).join(" → ");
  d.startDate = dateValue(readLine(bodies.text, "Departure|Partenza|Start|Inizio|Check-in|Checkin|Date|Data|Pickup"), warnings);
  d.endDate = dateValue(readLine(bodies.text, "Arrival|Arrivo|End|Fine|Check-out|Checkout|Dropoff"), warnings);
  const flightNumber = readLine(bodies.text, "Flight number|Numero volo|Flight|Volo");
  const extra = [flightNumber && `Numero volo: ${flightNumber}`, readLine(bodies.text, "Passengers|Passeggeri|Guests|Ospiti"), readLine(bodies.text, "Price|Prezzo|Total|Totale")].filter(Boolean);
  d.notes = extra.join("\n");
  if (!d.reference && !d.startDate) warnings.push("Informazioni insufficienti: completa prima di importare.");
  if (event === "cancellation") warnings.push("Cancellazione: nessuna prenotazione sarà eliminata automaticamente.");
  return [{ draft: d, warnings, event, flightNumber }];
}
