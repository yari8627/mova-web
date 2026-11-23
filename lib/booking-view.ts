/** Presentation only: source notes remain unchanged in storage. */
export type BookingView = { id?: string; type?: string; provider?: string | null; title?: string; notes?: string | null; location?: string | null; reference?: string | null };
const compact=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
export function bookingGuests(b:BookingView){return b.notes?.match(/^(?:Ospiti|Passeggeri):\s*([^\n]+)/im)?.[1]?.trim() || "";}
export function additionalBookingNotes(b:BookingView){
 const guests=compact(bookingGuests(b));const visible=[b.title,b.provider,b.location,b.reference].filter(Boolean).map(v=>compact(v!));
 const seen=new Set<string>();
 return (b.notes || "").split(/\r?\n/).filter(line=>{
  const v=line.trim(),key=compact(v);if(!v || seen.has(key))return false;seen.add(key);
  if(/^(?:Ospiti|Passeggeri|Check[ -]?(?:in|out)(?:\s+(?:Airbnb|Booking\.com))?|Località|Fuso(?: orario)?|Orari origine Gmail|Limiti orari origine Gmail(?: \(non appuntamenti\))?)\s*[:：]/i.test(v))return false;
  return key!==guests && !visible.includes(key);
 }).join("\n");
}
export function bookingEventDetail(b:BookingView|undefined,event?:string|null){
 if(!b || b.type!=="hotel")return "";
 const label=event==="end"?"Check-out":"Check-in";
 const note=(b.notes || "").split("\n").find(v=>v.startsWith(`${label} ${b.provider}:`));
 if(!note)return "";
 const text=note.slice(note.indexOf(":")+1).trim().replace(/^\d{2}\/\d{2}\/\d{4}\s*·\s*/,"");
 return `${label} ${text.replace(/dopo le /,"dalle ")}`;
}
export function operatorLogo(provider:string|null|undefined){
 const key=compact(provider || "");
 return ({airbnb:"airbnb",bookingcom:"booking",easyjet:"easyjet",italo:"italo"} as Record<string,string>)[key];
}
