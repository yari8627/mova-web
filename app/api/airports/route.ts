import { NextResponse } from "next/server";
import { getAirportsByType, type Airport } from "airport-data-js";
import { currentUser } from "../../../lib/auth";

let airportCache: Promise<Airport[]> | null = null;
const aliases: Record<string, string> = { roma: "rome", milano: "milan", venezia: "venice", firenze: "florence", napoli: "naples", torino: "turin", monaco: "munich", londra: "london", parigi: "paris", mosca: "moscow", pechino: "beijing", newyork: "new york" };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
async function allCommercialAirports() { if (!airportCache) airportCache = Promise.all([getAirportsByType("large_airport"), getAirportsByType("medium_airport")]).then(([large, medium]) => [...large, ...medium].filter((airport) => airport.iata)); return airportCache; }

export async function GET(request: Request) {
  if (!await currentUser()) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (query.length < 2) return NextResponse.json([]);
  const rawNeedle = normalize(query); const needle = aliases[rawNeedle.replace(/ /g, "")] || rawNeedle;
  const airports = (await allCommercialAirports()).map((airport) => { const code = normalize(`${airport.iata} ${airport.icao}`); const name = normalize(airport.airport); const context = normalize(`${airport.time} ${airport.wikipedia || ""}`); const score = airport.iata.toLowerCase() === needle ? 0 : code.startsWith(needle) ? 1 : name.startsWith(needle) ? 2 : name.includes(needle) ? 3 : context.includes(needle) ? 4 : 99; return { airport, score }; }).filter((item) => item.score < 99).sort((a, b) => a.score - b.score || (a.airport.type === "large_airport" ? -1 : 1) || a.airport.airport.localeCompare(b.airport.airport)).slice(0, 8);
  return NextResponse.json(airports.map(({ airport }) => ({ iata: airport.iata, icao: airport.icao, airport: airport.airport, countryCode: airport.country_code })));
}
