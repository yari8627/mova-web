import { NextResponse } from "next/server";
import { amadeusConfigured, searchFlights } from "../../../lib/amadeus";
import { currentUser } from "../../../lib/auth";

export async function GET(request: Request) {
  if (!await currentUser()) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  if (!amadeusConfigured()) return NextResponse.json({ error: "La ricerca voli deve essere configurata con le credenziali Amadeus." }, { status: 503 });
  const params = new URL(request.url).searchParams; const origin = (params.get("origin") || "").toUpperCase(); const destination = (params.get("destination") || "").toUpperCase(); const date = params.get("date") || "";
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Aeroporti o data non validi." }, { status: 400 });
  try { const result = await searchFlights(origin, destination, date); const carriers = result.dictionaries?.carriers || {}; const flights = (result.data || []).map((offer) => { const segments = offer.itineraries[0]?.segments || []; const first = segments[0]; const last = segments.at(-1); const airlineCode = offer.validatingAirlineCodes?.[0] || first?.carrierCode; return first && last ? { id: offer.id, airline: carriers[airlineCode] || airlineCode, flightNumber: segments.map((segment) => `${segment.carrierCode}${segment.number}`).join(" + "), departureAt: first.departure.at, arrivalAt: last.arrival.at, origin: first.departure.iataCode, destination: last.arrival.iataCode, stops: Math.max(0, segments.length - 1), price: offer.price ? `${offer.price.total} ${offer.price.currency}` : null } : null; }).filter(Boolean); return NextResponse.json({ flights }); } catch { return NextResponse.json({ error: "Non è stato possibile recuperare i voli per questa data." }, { status: 502 }); }
}
