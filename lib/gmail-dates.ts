export type MailTime = { date: string; time: string; offset: string; raw: string; qualifier?: "after" | "before"; zone?: string };
export const emptyMailTime = (raw = ""): MailTime => ({ date: "", time: "", offset: "", raw });
export function calendarDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function mailInstant(value: MailTime) {
  return calendarDate(value.date) && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(value.time) && /^(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/.test(value.offset) ? `${value.date}T${value.time}${value.offset}` : "";
}
export function splitMailInstant(value: string): MailTime {
  const m = value.match(/^(\d{4}-\d\d-\d\d)T(\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?)(Z|[+-]\d\d:\d\d)$/);
  return m ? { date: m[1], time: m[2], offset: m[3], raw: value } : emptyMailTime(value);
}
export function receivedRange(from: string, to: string, timeZone: string) {
  if (!calendarDate(from) || !calendarDate(to) || from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000 * 5) throw Error("Periodo non valido (massimo cinque anni).");
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  function midnight(day: string) {
    const target = Date.parse(`${day}T00:00:00Z`); let guess = target;
    for (let i = 0; i < 6; i++) {
      const p = Object.fromEntries(formatter.formatToParts(guess).map(part => [part.type, part.value]));
      const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
      if (local === target) return guess;
      guess += target - local;
    }
    throw Error("Mezzanotte locale non valida per questo periodo e fuso.");
  }
  const tomorrow = new Date(Date.parse(`${to}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return { start: midnight(from), end: midnight(tomorrow) };
}
const months = ["gennaio gen january jan", "febbraio february feb", "marzo march mar", "aprile april apr", "maggio mag may", "giugno giu june jun", "luglio lug july jul", "agosto ago august aug", "settembre set september sep sept", "ottobre ott october oct", "novembre november nov", "dicembre dic december dec"];
const monthWords = months.flatMap(m => m.split(" ")).sort((a,b) => b.length-a.length).join("|");
export function parseMailTime(raw: string, locale?: "it" | "en"): MailTime {
  const out = emptyMailTime(raw.trim().slice(0, 160));
  const iso = raw.match(/\b\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)\b/);
  if (iso) { const value = splitMailInstant(iso[0]); if (!calendarDate(value.date)) value.date = ""; if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(value.time)) value.time = ""; return value; }
  let m = raw.match(/\b(\d{4})-(\d\d)-(\d\d)\b/);
  if (m) out.date = `${m[1]}-${m[2]}-${m[3]}`;
  else {
    m = raw.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/);
    if (m && (+m[1] > 12 || locale === "it")) out.date = `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
    else if (m && (+m[2] > 12 || locale === "en")) out.date = `${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
    else {
      const named = raw.toLowerCase().match(new RegExp(`\\b(\\d{1,2})\\s+(${monthWords})\\.?\\s*,?\\s*(\\d{4})\\b`));
      const english = raw.toLowerCase().match(new RegExp(`\\b(${monthWords})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{4})\\b`));
      if (named || english) { const n = named || english!; const mon = named ? n[2] : n[1], day = named ? n[1] : n[2]; out.date = `${n[3]}-${String(months.findIndex(x=>x.split(" ").includes(mon))+1).padStart(2,"0")}-${day.padStart(2,"0")}`; }
    }
  }
  if (!calendarDate(out.date)) out.date = "";
  const time = raw.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/); if (time) out.time = `${time[1].padStart(2,"0")}:${time[2]}`;
  if (/(?:dopo|a partire da|dalle|after)\s+(?:(?:le|the)\s+)?(?:ore\s+)?\d{1,2}:\d{2}/i.test(raw)) out.qualifier = "after";
  else if (/(?:entro|prima delle|fino alle|before|by)\s+(?:(?:le|the)\s+)?(?:ore\s+)?\d{1,2}:\d{2}/i.test(raw)) out.qualifier = "before";
  const offset = raw.match(/(?:UTC|GMT)?\s*([+-](?:0\d|1[0-4]):[0-5]\d)\b/); if (offset) out.offset = offset[1];
  if (/\b(?:UTC|GMT)\b/.test(raw) && !out.offset) out.offset = "Z";
  return out;
}
// Derive an offset only from a known lodging zone and a unique local civil time.
export function inLodgingZone(value: MailTime, zone: string): MailTime {
  if (!calendarDate(value.date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time) || value.offset) return value;
  const target = Date.parse(`${value.date}T${value.time}:00Z`);
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23" });
  function local(epoch: number) { const p = Object.fromEntries(fmt.formatToParts(epoch).map(x=>[x.type,x.value])); return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second); }
  let guess = target;
  for(let i=0;i<6;i++) { const delta = target-local(guess); if (!delta) break; guess += delta; }
  if (local(guess) !== target || [-7200000,-3600000,3600000,7200000].some(delta=>local(guess+delta)===target)) return value;
  const minutes = (target-guess)/60000, absolute = Math.abs(minutes);
  return { ...value, zone, offset: `${minutes<0?"-":"+"}${String(Math.floor(absolute/60)).padStart(2,"0")}:${String(absolute%60).padStart(2,"0")}` };
}
export function stayTimeText(value: MailTime) {
  return [value.date ? value.date.split("-").reverse().join("/") : "", value.time ? `${value.qualifier === "after" ? "dopo le " : value.qualifier === "before" ? "entro le " : ""}${value.time}` : "", value.zone ? `${value.zone} (${value.offset})` : value.offset].filter(Boolean).join(" · ");
}
export function airbnbTimingNotes(start: MailTime, end: MailTime, provider = "Airbnb") {
  return [[`Check-in ${provider}`,start],[`Check-out ${provider}`,end]].filter(([,value])=>(value as MailTime).qualifier).map(([label,value])=>`${label}: ${stayTimeText(value as MailTime)}`).join("\n");
}
export function airbnbStayNoteLabel(notes: string, which: "start" | "end", provider = "Airbnb") {
  const prefix = which === "start" ? `Check-in ${provider}: ` : `Check-out ${provider}: `;
  return notes.split("\n").find(line=>line.startsWith(prefix))?.slice(prefix.length, prefix.length+300) || "";
}
export function parseMailRange(raw: string): { start: MailTime; end: MailTime } | null {
  const m = raw.match(new RegExp(`\\b(\\d{1,2})\\s*[–—-]\\s*(\\d{1,2})\\s+(${monthWords})(?:\\s+(\\d{4}))?\\b`,"i"));
  if (!m) {
    const en = raw.match(new RegExp(`\\b(${monthWords})\\s+(\\d{1,2})\\s*[–—-]\\s*(\\d{1,2})(?:,?\\s+(\\d{4}))?\\b`,"i"));
    return en ? { start: parseMailTime(`${en[2]} ${en[1]}${en[4] ? ` ${en[4]}` : ""}`), end: parseMailTime(`${en[3]} ${en[1]}${en[4] ? ` ${en[4]}` : ""}`) } : null;
  }
  return { start: parseMailTime(`${m[1]} ${m[3]}${m[4] ? ` ${m[4]}` : ""}`), end: parseMailTime(`${m[2]} ${m[3]}${m[4] ? ` ${m[4]}` : ""}`) };
}

type LodgingBooking={startDate:string;endDate?:string|null;notes?:string|null;provider?:string|null;location?:string|null};
export function lodgingStartInput(b:LodgingBooking){
 const note=airbnbStayNoteLabel(b.notes || "","start",b.provider || "Airbnb");
 const civil=parseMailTime(note,"it");
 if(civil.date && civil.time && mailInstant(civil) && Date.parse(mailInstant(civil))===Date.parse(b.startDate))return `${civil.date}T${civil.time.slice(0,5)}`;
 const original=(b.notes || "").match(/(?:Orari origine Gmail|Limiti orari origine Gmail \(non appuntamenti\)):\s*(\S+)/)?.[1];
 return original && Date.parse(original)===Date.parse(b.startDate)?original.slice(0,16):b.startDate.slice(0,16);
}
export function editLodgingStart(b:LodgingBooking,local:string){
 const note=airbnbStayNoteLabel(b.notes || "","start",b.provider || "Airbnb"),old=parseMailTime(note,"it");
 const zone=note.match(/\b(?:Europe|America|Asia|Africa|Australia|Pacific)\/[A-Za-z_\/]+/)?.[0] || (/\b(?:Norway|Norvegia|Norge)\b/i.test(b.location || "")?"Europe/Oslo":"");
 if(!zone)return null;
 const start=inLodgingZone({date:local.slice(0,10),time:local.slice(11),offset:"",raw:local,qualifier:old.qualifier},zone),instant=mailInstant(start);
 if(!instant || (b.endDate && Date.parse(instant)>Date.parse(b.endDate)))throw Error("Controlla data, ora e fuso del soggiorno: l’inizio deve precedere il check-out.");
 const prefix=`Check-in ${b.provider || "Airbnb"}:`;
 const notes=(b.notes || "").split("\n").filter(line=>!line.startsWith(prefix));
 notes.push(`${prefix} ${stayTimeText(start)}`);
 return {startDate:instant,endDate:b.endDate || "",notes:notes.join("\n")};
}
