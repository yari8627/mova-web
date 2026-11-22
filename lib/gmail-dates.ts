export type MailTime = { date: string; time: string; offset: string; raw: string };
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
const months = ["gennaio january jan", "febbraio february feb", "marzo march mar", "aprile april apr", "maggio may", "giugno june jun", "luglio july jul", "agosto august aug", "settembre september sep sept", "ottobre october oct", "novembre november nov", "dicembre december dec"];
const monthWords = months.flatMap(m => m.split(" ")).sort((a,b) => b.length-a.length).join("|");
export function parseMailTime(raw: string): MailTime {
  const out = emptyMailTime(raw.trim().slice(0, 160));
  const iso = raw.match(/\b\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)\b/);
  if (iso) { const value = splitMailInstant(iso[0]); if (!calendarDate(value.date)) value.date = ""; if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(value.time)) value.time = ""; return value; }
  let m = raw.match(/\b(\d{4})-(\d\d)-(\d\d)\b/);
  if (m) out.date = `${m[1]}-${m[2]}-${m[3]}`;
  else {
    m = raw.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/);
    if (m && +m[1] > 12) out.date = `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
    else if (m && +m[2] > 12) out.date = `${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
    else {
      const named = raw.toLowerCase().match(new RegExp(`\\b(\\d{1,2})\\s+(${monthWords})\\.?\\s*,?\\s*(\\d{4})\\b`));
      const english = raw.toLowerCase().match(new RegExp(`\\b(${monthWords})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{4})\\b`));
      if (named || english) { const n = named || english!; const mon = named ? n[2] : n[1], day = named ? n[1] : n[2]; out.date = `${n[3]}-${String(months.findIndex(x=>x.split(" ").includes(mon))+1).padStart(2,"0")}-${day.padStart(2,"0")}`; }
    }
  }
  if (!calendarDate(out.date)) out.date = "";
  const time = raw.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/); if (time) out.time = `${time[1].padStart(2,"0")}:${time[2]}`;
  const offset = raw.match(/(?:UTC|GMT)?\s*([+-](?:0\d|1[0-4]):[0-5]\d)\b/); if (offset) out.offset = offset[1];
  if (/\b(?:UTC|GMT)\b/.test(raw) && !out.offset) out.offset = "Z";
  return out;
}
export function parseMailRange(raw: string): { start: MailTime; end: MailTime } | null {
  const m = raw.match(new RegExp(`\\b(\\d{1,2})\\s*[–—-]\\s*(\\d{1,2})\\s+(${monthWords})(?:\\s+(\\d{4}))?\\b`,"i"));
  if (!m) {
    const en = raw.match(new RegExp(`\\b(${monthWords})\\s+(\\d{1,2})\\s*[–—-]\\s*(\\d{1,2})(?:,?\\s+(\\d{4}))?\\b`,"i"));
    return en ? { start: parseMailTime(`${en[2]} ${en[1]}${en[4] ? ` ${en[4]}` : ""}`), end: parseMailTime(`${en[3]} ${en[1]}${en[4] ? ` ${en[4]}` : ""}`) } : null;
  }
  return { start: parseMailTime(`${m[1]} ${m[3]}${m[4] ? ` ${m[4]}` : ""}`), end: parseMailTime(`${m[2]} ${m[3]}${m[4] ? ` ${m[4]}` : ""}`) };
}
