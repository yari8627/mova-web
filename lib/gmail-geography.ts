import { countries } from "countries-list";
import type { BookingDraft } from "./gmail-core";
const normalize=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
// Exact country names/codes, including translated UI names; never infer a country from a city.
const countryNames = new Map<string,string>();
const countryDisplays=[new Intl.DisplayNames(["it"],{type:"region"}),new Intl.DisplayNames(["en"],{type:"region"})];
for(const [code,country] of Object.entries(countries)) for(const name of [code,country.name,country.native,...countryDisplays.map(d=>d.of(code) || "")]) if(name){const key=normalize(name);countryNames.set(key,countryNames.has(key) && countryNames.get(key)!==code?"":code);}
export function countryCode(value:string) { return countryNames.get(normalize(value.trim())) || ""; }
export function locationCountry(value:string) { return countryCode(value.split(/[,\n]/).at(-1) || ""); }
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
  const bookingCountry=locationCountry(draft.location);
  const aliases=geographicAliases.filter(group=>group.some(word=>words.includes(word)));
  const scored=trips.filter(t=>t.startDate.slice(0,10)<=start && t.endDate.slice(0,10)>=end).map(t=>{
    const city=normalize(t.city),country=normalize(t.country),name=normalize(t.name || "");
    const tripCountry=countryCode(t.country);
    if(bookingCountry && tripCountry && bookingCountry!==tripCountry)return {id:t.id,score:0};
    const direct=city.length>2 && place.includes(city), nameMatch=name.length>3 && place.includes(name);
    const nameWords=(t.name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/);
    const regional=aliases.some(group=>group.some(word=>city===word || nameWords.includes(word) || country===word));
    return {id:t.id,score:direct?4:nameMatch?3:regional || (bookingCountry && bookingCountry===tripCountry)?2:country.length>3 && place.includes(country)?2:0};
  }).filter(t=>t.score>=2).sort((a,b)=>b.score-a.score);
  return scored.length && (scored.length===1 || scored[0].score>scored[1].score) ? scored[0].id : null;
}
