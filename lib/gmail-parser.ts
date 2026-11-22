import { BookingDraft, Candidate } from "./gmail-core";
import { airbnbTimingNotes, emptyMailTime, inLodgingZone, mailInstant, parseMailRange, parseMailTime } from "./gmail-dates";

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
  return clean(html.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<(?:br|\/?(?:p|div|tr|td|th|li|h[1-6]|section|article))\b[^>]*>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|\d+);/gi, s => {
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
    if (depth > 15 || ++visited > 100 || (p.filename && !(p.mimeType === "message/rfc822" && p.parts?.length))) return;
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
  return { text: [...new Set([...plain, ...html.map(htmlText)])].join("\n"), html };
}
const blank = (): BookingDraft => ({ title: "", type: "activity", startDate: "", endDate: "", reference: "", provider: "", location: "", notes: "", originAirport: "", destinationAirport: "", status: "confirmed" });
function readLine(text: string, names: string) { return text.match(new RegExp(`(?:^|\\n)\\s*(?:${names})\\s*[:：]\\s*([^\\n]+)`, "i"))?.[1]?.trim().slice(0, 500) || ""; }
function labelled(text: string, names: string) {
  return text.match(new RegExp(`(?:^|\\n)[ \\t]*(?:${names})[ \\t]*(?:[:：][ \\t]*|\\r?\\n[ \\t]*)(?:\\r?\\n[ \\t]*)*([^\\n]+)`, "i"))?.[1]?.trim().slice(0, 500) || "";
}
function place(value: string) {
  return /@|<|>|https?:|mime-version|content-type|(?:^|\s)(?:from|sent|subject|to|da|inviato|oggetto|a)\s*:/i.test(value) ? "" : value.trim();
}
function geographical(text: string, names: string) {
  const pattern = new RegExp(`(?:^|\\n)[ \\t]*(?:${names})[ \\t]*(?:[:：][ \\t]*|\\r?\\n[ \\t]*)(?:\\r?\\n[ \\t]*)*([^\\n]+)`, "gi");
  for (const m of text.matchAll(pattern)) { const value = place(m[1].trim().slice(0,500)); if (value) return value; }
  return "";
}
function providerFor(message: GmailMessage, text: string) {
  const sender = header(message.payload, "From"), auth = header(message.payload, "Authentication-Results");
  const providers = [["Airbnb","airbnb.com"],["Booking.com","booking.com"],["easyJet","easyjet.com"],["Ryanair","ryanair.com"],["ITA Airways","ita-airways.com"],["Italo","italotreno.it"],["Trenitalia","trenitalia.it"],["Trenitalia","trenitalia.com"]];
  for (const [name, domain] of providers) {
    const escaped = domain.replace(/\./g,"\\.");
    const senderDomain = new RegExp(`@(?:[a-z0-9-]+\\.)*${escaped}(?:>|\\s|$)`,"i").test(sender);
    const authenticated = /mx\.google\.com/i.test(auth) && /(?:dkim|spf|dmarc)=pass/i.test(auth) && new RegExp(`(?:header\\.d|smtp\\.mailfrom|header\\.from)=[^;\\s]*${escaped}(?:[;\\s]|$)`,"i").test(auth);
    // Forwarded original headers/links identify a supplier only alongside its brand in the body.
    if ((senderDomain && authenticated) || (text.toLowerCase().includes(name.toLowerCase()) && new RegExp(`(?:@|https?:\\/\\/(?:[a-z0-9-]+\\.)*)${escaped}(?:[>/\\s]|$)`,"i").test(text))) return name;
  }
  return "";
}
function airbnbDetails(bodies: ReturnType<typeof messageBodies>) {
  // Prefer the HTML stay card to the shorter forward/plain-text summary.
  const html = bodies.html.join("\n"), body = html ? htmlText(html) : bodies.text;
  const lines = body.split(/\r?\n/).map(s=>s.replace(/\s+/g," ").trim()).filter(Boolean);
  const sections = /^(?:check[ -]?in|check[ -]?out|indirizzo|address|ospiti|guests|codice (?:di )?conferma|confirmation code|dettagli (?:della )?prenotazione|reservation details|importo|amount|assistenza|help|regole della casa|house rules|indicazioni stradali|get directions)\s*[:：]?$/i;
  function block(label: RegExp, max: number) {
    const i = lines.findIndex(line=>label.test(line)); if (i<0) return "";
    const out: string[] = [];
    for(let n=i+1;n<lines.length && out.length<max;n++) { if (sections.test(lines[n]) || /indicazioni|directions|^(?:come arrivare|come raggiungere|getting there|how to get)/i.test(lines[n]) || /^https?:|^<https?:|^invita altri ospiti|^invite guests/i.test(lines[n])) break; out.push(lines[n]); }
    return out.join(" ").slice(0,500);
  }
  const headings = [...html.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m=>({tag:m[1].toLowerCase(),text:htmlText(m[2]).replace(/\s+/g," ").trim(),index:m.index!}));
  const checkinAt = html.search(/check[ -]?in/i);
  const property = headings.filter(h=>h.tag === "h2" && (checkinAt<0 || h.index<checkinAt) && !/check[ -]?(?:in|out)|airbnb|prenotazione|reservation|indirizzo|address|ospiti|guests/i.test(h.text)).at(-1);
  const hero = headings.filter(h=>h.tag === "h1" && (!property || h.index<property.index)).at(-1);
  const locality = place(hero?.text.match(/\b(?:a|in|per)\s+([^.!?]+)[.!?]?$/i)?.[1] || "");
  const address = place(block(/^(?:indirizzo|address)\s*[:：]?$/i,4));
  const guestText = block(/^(?:ospiti|guests)\s*[:：]?$/i,2), guests = guestText.match(/\b\d+\s+(?:adulti?|adults?)(?:\s*(?:,|e|and)\s*\d+\s+(?:bambin[oi]|children|infants?))?/i)?.[0] || "";
  const locale = /^(?:indirizzo|ospiti)\s*[:：]?$/im.test(body) ? "it" : undefined;
  const start = parseMailTime(block(/^check[ -]?in\s*[:：]?$/i,6),locale), end = parseMailTime(block(/^check[ -]?out\s*[:：]?$/i,6),locale);
  // The country is explicit in the lodging address; do not use the traveller's device zone.
  const zone = /\b(?:Norway|Norvegia|Norge)\b/i.test(address) ? "Europe/Oslo" : "";
  return { name:place(property?.text || ""), locality, address, guests, hasImages:/<img\b/i.test(html), start:zone?inLodgingZone(start,zone):start, end:zone?inLodgingZone(end,zone):end };
}
function applyAirbnb(candidate: Candidate, details: ReturnType<typeof airbnbDetails>) {
  const d = candidate.draft;
  if (details.name) d.title = details.name;
  if (details.address || details.locality) d.location = details.address || details.locality;
  candidate.timing ||= {start:parseMailTime(d.startDate),end:parseMailTime(d.endDate)};
  if (details.start.date) candidate.timing.start = details.start;
  if (details.end.date) candidate.timing.end = details.end;
  d.notes = [d.notes, details.locality && `Località: ${details.locality}`, details.guests && `Ospiti: ${details.guests}`, airbnbTimingNotes(candidate.timing.start,candidate.timing.end)].filter(Boolean).join("\n");
  return candidate;
}
/** Read adjacent table cells/lines only inside explicitly labelled journey sections. */
function providerDetails(candidate: Candidate, body: string, supplier: string, html = "") {
  if (!["Booking.com","easyJet","Italo"].includes(supplier)) return candidate;
  const lines=body.split(/\r?\n/).map(v=>v.replace(/\s+/g," ").trim()).filter(Boolean);
  const sections=/^(?:check[ -]?in|check[ -]?out|arrivo|partenza|departure|arrival|data (?:di )?(?:partenza|arrivo)|hotel(?: name)?|nome hotel|struttura|indirizzo|address|ospiti|guests|passeggeri|passengers|numero volo|flight number|numero treno|train number|treno|classe|class|posto|seat|carrozza|coach|da|a|from|to|stazione (?:di )?(?:partenza|arrivo)|codice.*|booking.*|confirmation.*|numero.*|prezzo|price|totale|total|pagamento|payment|cancellazione gratuita|free cancellation)\s*[:：]?$/i;
  function block(label: RegExp,max=5) {
    const i=lines.findIndex(v=>label.test(v.replace(/[:：]$/, ""))); if(i<0)return "";
    const out:string[]=[];
    for(let n=i+1;n<lines.length && out.length<max;n++){if(sections.test(lines[n]) || /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ \-]{0,60}[:：]/.test(lines[n]) || /^(?:https?:|da:|from:|inviato:|sent:|oggetto:|subject:)/i.test(lines[n]))break;out.push(lines[n]);}
    return out.join(" ").slice(0,500);
  }
  const d=candidate.draft;
  if(supplier==="Booking.com") {
    const headings=[...html.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m=>htmlText(m[2]).replace(/\s+/g," ").trim());
    d.title ||= headings.find(v=>v.length>2 && !/booking\.com|conferm|confirmation|prenotazione|reservation|grazie|thank|check[ -]?(?:in|out)/i.test(v)) || "";
    d.title ||= block(/^(?:hotel(?: name)?|nome hotel|struttura|property(?: name)?)$/i,1);
    d.location=block(/^(?:indirizzo|address)$/i,3) || d.location;
  }
  const locale=/\b(?:partenza|arrivo|ospiti|prenotazione|indirizzo|treno)\b/i.test(body)?"it":undefined;
  const start=block(supplier==="Booking.com"?/^check[ -]?in$/i:/^(?:partenza|departure|data (?:di )?partenza)$/i);
  const end=block(supplier==="Booking.com"?/^check[ -]?out$/i:/^(?:arrivo|arrival|data (?:di )?arrivo)$/i);
  const timing=candidate.timing!;
  if((!timing.start.date || !timing.start.time) && start && parseMailTime(start,locale).date)timing.start=parseMailTime(start,locale);
  if((!timing.end.date || !timing.end.time) && end && parseMailTime(end,locale).date)timing.end=parseMailTime(end,locale);
  const countryZone=/\b(?:Norway|Norvegia|Norge)\b/i.test(d.location)?"Europe/Oslo":/\b(?:Italy|Italia)\b/i.test(d.location)?"Europe/Rome":/\b(?:France|Francia)\b/i.test(d.location)?"Europe/Paris":"";
  const stationZone=(station:string)=>/^(?:Roma|Milano|Napoli|Firenze|Bologna|Torino|Venezia|Salerno|Reggio Emilia|Brescia|Verona|Padova|Bari|Foggia|Ferrara|Rovigo|Udine|Trieste)\b/i.test(station)?"Europe/Rome":"";
  const airportZones:Record<string,string>={FCO:"Europe/Rome",CIA:"Europe/Rome",MXP:"Europe/Rome",LIN:"Europe/Rome",BGY:"Europe/Rome",NAP:"Europe/Rome",VCE:"Europe/Rome",LGW:"Europe/London",LHR:"Europe/London",LTN:"Europe/London",STN:"Europe/London",CDG:"Europe/Paris",ORY:"Europe/Paris",TOS:"Europe/Oslo",OSL:"Europe/Oslo"};
  const airportZone=(v:string)=>airportZones[v.match(/\b[A-Z]{3}\b/)?.[0] || ""] || "";
  const zones=supplier==="Booking.com"?[countryZone,countryZone]:supplier==="Italo"?[stationZone(d.originAirport),stationZone(d.destinationAirport)]:[airportZone(d.originAirport),airportZone(d.destinationAirport)];
  if(!timing.start.offset && zones[0])timing.start=inLodgingZone(timing.start,zones[0]);
  if(!timing.end.offset && zones[1])timing.end=inLodgingZone(timing.end,zones[1]);
  const extras=[["Ospiti","Guests|Ospiti"],["Passeggeri","Passengers|Passeggeri"],["Numero treno","Train number|Numero treno|Treno"],["Classe","Class|Classe|Ambiente"],["Posto","Seat|Posto"],["Carrozza","Coach|Carrozza"]];
  for(const [label,names] of extras){const value=labelled(body,names);if(value && !d.notes.includes(`${label}: ${value}`))d.notes=[d.notes,`${label}: ${value}`].filter(Boolean).join("\n");}
  return candidate;
}
function messageEvent(subject: string, body: string): Candidate["event"] {
  const eventLines = [subject.replace(/^(?:(?:fwd?|re|i|r):\s*)+/i,""), ...body.split(/\r?\n/).filter(line => !/cancellazione gratuita|free cancellation|cancellation polic|politic[ah] di cancell|termini|puoi|you can|gestisci|manage|how to|come (?:modific|annull)|rimborso (?:entro|fino)/i.test(line))].join("\n");
  if (/(?:prenotazione|reservation|booking|volo|flight|treno|train|biglietto|ticket)(?:\s+(?:n[°.]?\s*)?[A-Z0-9-]{4,20})?\s+(?:(?:has been|was|is|è stata|è stato|è)\s+)?(?:cancellat[aoeiy]|cancelled|canceled|annullat[ao])\b|(?:cancellazione|annullamento)\s+(?:confermat[ao]|della (?:tua )?prenotazione)|(?:cancellation confirmed|booking cancellation confirmation)/i.test(eventLines)) return "cancellation";
  if (/(?:prenotazione|reservation|booking|volo|flight|treno|train|orario|schedule)(?:\s+(?:n[°.]?\s*)?[A-Z0-9-]{4,20})?\s+(?:è stat[ao] modificat[ao]|has (?:been )?changed|has been updated|has been rescheduled|rescheduled|modificat[ao])\b|(?:modifica (?:confermata|alla tua prenotazione)|updated booking|flight booking change|schedule change)/i.test(eventLines)) return "change";
  if (/conferm[ao]|confermat[ao]|confirmed|confirmation|ricevuta|receipt|e-ticket|biglietto emesso/i.test(subject + "\n" + body)) return "confirmation";
  return "uncertain";
}
function finish(candidate: Candidate, supplier: string, hasImages = false): Candidate {
  const d = candidate.draft, w = candidate.warnings;
  if (supplier) d.provider = supplier;
  d.provider = place(d.provider);
  d.location = place(d.location); d.originAirport = place(d.originAirport); d.destinationAirport = place(d.destinationAirport);
  const route = [d.originAirport,d.destinationAirport].filter(Boolean).join(" → ");
  const name = place(d.title.replace(/^(?:(?:fwd?|re):\s*)+/i,"").trim());
  d.title = d.type === "flight" ? (route ? `Volo ${route}` : "Volo da completare")
    : d.type === "train" ? (route ? `Treno ${route}` : "Trasporto da completare")
    : d.type === "hotel" ? (name ? (supplier === "Airbnb" ? name : /^hotel\b/i.test(name) ? name : `Hotel ${name}`) : supplier === "Airbnb" ? "Soggiorno Airbnb da completare" : "Soggiorno da completare")
    : d.type === "activity" ? (name ? `${name}${d.location ? ` — ${d.location}` : ""}` : "Attività da completare") : "Noleggio auto da completare";
  d.title = d.title.slice(0,500);
  const timing = candidate.timing || { start: parseMailTime(d.startDate), end: parseMailTime(d.endDate) };
  candidate.timing = timing;
  for (const [label,time] of [["Inizio",timing.start],["Fine",timing.end]] as const) {
    if (!time.raw && label === "Fine") continue;
    const missing = [!time.date && "data completa di anno", !time.time && "ora", !time.offset && "fuso"].filter(Boolean);
    if (missing.length) w.push(`${label}: verifica ${missing.join(", ")}.${time.raw ? ` Testo originale: ${time.raw}` : ""}`);
  }
  d.startDate = mailInstant(timing.start); d.endDate = mailInstant(timing.end);
  if (supplier === "Airbnb" && name && d.location && d.reference && d.startDate && d.endDate) {
    const generic = w.indexOf("Controlla i dati estratti prima di confermare."); if (generic>=0) w.splice(generic,1);
  }
  if (!d.location) w.push("Località da completare.");
  if (supplier === "Airbnb" && hasImages && (!d.startDate || !d.endDate || !d.location || !name)) w.push("Alcune informazioni non sono state trovate nel testo. Eventuali dati presenti soltanto nelle immagini non vengono letti.");
  if (candidate.event === "uncertain") { d.status = "pending"; w.push("Stato incerto: verifica il contenuto prima di confermare."); }
  candidate.warnings = [...new Set(w)];
  return candidate;
}
function validReference(value: string) {
  const reference = value.trim();
  return /^[a-z0-9][a-z0-9./-]{3,63}$/i.test(reference)
    && !/^(?:https?|www|example|esempio|unknown|pending|nessuno|nessuna|undefined|null|click|clicca|prenotazione|booking|conferma|confirmation|ticket|biglietto)$/i.test(reference)
    && !/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(reference);
}
function bookingReference(text: string) {
  const labels = "PNR|Booking (?:reference|code|number|ID)|Reservation (?:number|code|ID)|Confirmation (?:number|code)|(?:E-?ticket|Ticket) (?:number|no\\.?|code)|(?:Codice|Numero|N[°º.]?) (?:di )?(?:prenotazione|conferma|biglietto)|Codice PNR";
  // A labelled identifier is evidence; dates, flight numbers and generic numbers are not.
  const pattern = new RegExp(`\\b(?:${labels})(?:[ \\t]*[:：#=][ \\t\\r\\n]*|(?:[ \\t]*\\r?\\n[ \\t]*)+|[ \\t]+)([a-z0-9][a-z0-9./-]{3,63})(?=[ \\t]*(?:\\r?\\n|$)|[ \\t]*[;,])`, "gi");
  for (const match of text.matchAll(pattern)) if (validReference(match[1])) return match[1];
  return "";
}
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
        d.provider = name(r.airline) || name(r.provider) || name(v.provider);
        d.reference = [name(v.reservationNumber), name(v.reservationId), name(v.ticketNumber)].find(validReference) || "";
        if (!d.reference) return;
        d.originAirport = name(r.departureAirport) || name(r.departureStation); d.destinationAirport = name(r.arrivalAirport) || name(r.arrivalStation);
        const route = [name(r.departureStation) || name(r.departureBusStop) || name(v.pickupLocation) || d.originAirport, name(r.arrivalStation) || name(r.arrivalBusStop) || name(v.dropoffLocation) || d.destinationAirport].filter(Boolean).join(" → ");
        d.location = address(r.address) || name(r.location) || route;
        const timing = { start: parseMailTime(String(v.checkinTime || v.pickupTime || r.departureTime || r.startDate || "")), end: parseMailTime(String(v.checkoutTime || v.dropoffTime || r.arrivalTime || r.endDate || "")) };
        d.startDate = mailInstant(timing.start); d.endDate = mailInstant(timing.end);
        const flightNumber = name(r.flightNumber); if (flightNumber) d.notes = `Numero volo: ${flightNumber}`;
        const guests = v.numAdults || v.numGuests; if (guests && /^\d+$/.test(String(guests))) d.notes += `${d.notes ? "\n" : ""}Ospiti: ${guests}`;
        const passenger = name(v.underName); if (passenger) d.notes += `${d.notes ? "\n" : ""}Intestatario: ${passenger}`;
        const status = String(v.reservationStatus || "");
        const event = /cancel/i.test(status) ? "cancellation" : "confirmation";
        found.push({ draft: d, timing, warnings: w, event, flightNumber }); return;
      }
      Object.values(v).forEach(x => visit(x, depth + 1));
    }
    visit(root);
  }
  return found.slice(0, 12);
}
export function parseGmailMessage(message: GmailMessage): Candidate[] {
  const subject = header(message.payload, "Subject"), bodies = messageBodies(message), text = `${subject}\n${bodies.text}`;
  const event = messageEvent(subject, bodies.text), supplier = providerFor(message, bodies.text);
  const airbnb = supplier === "Airbnb" ? airbnbDetails(bodies) : null;
  // Only messages carrying an explicit booking/ticket identifier reach the preview.
  const known = structured(bodies.html, []);
  if (known.length) return known.map(c => { const candidate = { ...c, event: c.event === "cancellation" ? c.event : event === "uncertain" ? c.event : event }; return finish(airbnb?applyAirbnb(candidate,airbnb):providerDetails(candidate,bodies.text,supplier,bodies.html.join("\n")),supplier,airbnb?.hasImages); });
  const reference = bookingReference(text);
  if (!reference) return [];
  const d = blank(), warnings = ["Controlla i dati estratti prima di confermare."];
  const matchType = /Airbnb|Booking.com/.test(supplier) ? "hotel" : /Italo|Trenitalia/.test(supplier) ? "train" : /easyJet|Ryanair|ITA Airways/.test(supplier) ? "flight" : /flight|volo|airline|aeroporto/i.test(text) ? "flight" : /hotel|check.in|alloggio|lodging|accommodation/i.test(text) ? "hotel" : /car rental|auto a noleggio|autonoleggio/i.test(text) ? "car" : /train|treno|bus|traghetto|ferry|rail/i.test(text) ? "train" : /activity|attivit|excursion|escursion|tour|ticket|bigliett/i.test(text) ? "activity" : null;
  if (!matchType) return [];
  d.type = matchType; d.title = labelled(bodies.text, "Hotel(?: name)?|Nome hotel|Struttura|Nome (?:struttura|alloggio|attività|escursione)|Alloggio|Accommodation|Property(?: name)?|Apartment|Appartamento|Activity|Attività|Excursion|Escursione");
  d.reference = reference;
  d.provider = supplier || labelled(bodies.text, "Airline|Compagnia|Operator|Operatore|Provider");
  d.location = geographical(bodies.text, "Location|Luogo|Address|Indirizzo|Destination|Destinazione|Località|City|Città");
  d.originAirport = geographical(bodies.text, "From|Da|Departure airport|Aeroporto partenza|Stazione (?:di )?partenza|Departure station|Origin|Origine");
  d.destinationAirport = geographical(bodies.text, "To|A|Arrival airport|Aeroporto arrivo|Stazione (?:di )?arrivo|Arrival station");
  const route = labelled(bodies.text,"Route|Tratta|Percorso").split(/\s*(?:→|->|\bto\b)\s*/i);
  if (route.length === 2) { d.originAirport ||= place(route[0]); d.destinationAirport ||= place(route[1]); }
  if (!d.location) d.location = [d.originAirport, d.destinationAirport].filter(Boolean).join(" → ");
  const rawStart = labelled(bodies.text, d.type === "hotel" ? "Check-in|Checkin|Arrivo|Arrival(?: date)?|Data (?:di )?arrivo|Start|Inizio" : "Departure(?: date(?: and time)?)?|Partenza|Start|Inizio|Data (?:di |della )?(?:partenza|attività|evento)|Activity date|Event date|Pickup"), rawEnd = labelled(bodies.text, d.type === "hotel" ? "Check-out|Checkout|Partenza|Departure(?: date)?|Data (?:di )?partenza|End|Fine" : "Arrival(?: date(?: and time)?)?|Arrivo|End|Fine|Dropoff");
  const range = parseMailRange(labelled(bodies.text, "Soggiorno|Stay|Date (?:del soggiorno|of stay)|Dates") || subject);
  const timing = { start: rawStart ? parseMailTime(rawStart) : range?.start || emptyMailTime(), end: rawEnd ? parseMailTime(rawEnd) : range?.end || emptyMailTime() };
  const explicitOffset = labelled(bodies.text,"Time zone|Timezone|Fuso(?: orario)?");
  for (const [which,labels] of [["start", d.type === "hotel" ? "Ora (?:di )?arrivo|Arrival time|Check-in time|Ora check-in" : "Ora (?:di )?partenza|Departure time|Start time|Ora (?:attività|evento)"],["end", d.type === "hotel" ? "Ora (?:di )?partenza|Departure time|Check-out time|Ora check-out" : "Ora (?:di )?arrivo|Arrival time|End time"]] as const) {
    const extra = labelled(bodies.text,labels);
    if (timing[which].raw && (extra || explicitOffset)) timing[which] = parseMailTime(`${timing[which].raw} ${extra} ${explicitOffset}`.trim());
  }
  d.startDate = mailInstant(timing.start); d.endDate = mailInstant(timing.end);
  const flightNumber = readLine(bodies.text, "Flight number|Numero volo|Flight|Volo");
  const extra = [flightNumber && `Numero volo: ${flightNumber}`, readLine(bodies.text, "Passengers|Passeggeri|Guests|Ospiti"), readLine(bodies.text, "Price|Prezzo|Total|Totale")].filter(Boolean);
  d.notes = extra.join("\n");
  const candidate = { draft: d, timing, warnings, event, flightNumber };
  return [finish(airbnb?applyAirbnb(candidate,airbnb):providerDetails(candidate,bodies.text,supplier,bodies.html.join("\n")), supplier,airbnb?.hasImages)];
}
