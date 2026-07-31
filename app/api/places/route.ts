import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";

type NominatimPlace = { place_id: number; display_name: string; name?: string; lat: string; lon: string; type?: string; category?: string };

export async function GET(request: Request) {
  if (!await currentUser()) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() || "";
  const countryCode = params.get("countryCode")?.trim().toLowerCase() || "";
  if (query.length < 2) return NextResponse.json([]);
  const search = new URLSearchParams({ q: query, format: "jsonv2", addressdetails: "1", namedetails: "1", limit: "8", accept_language: "it" });
  if (/^[a-z]{2}$/.test(countryCode)) search.set("countrycodes", countryCode);
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${search}`, { headers: { "User-Agent": "MovaTravel/0.1 (travel itinerary place search)" }, next: { revalidate: 86400 } });
    if (!response.ok) throw new Error(`Place search failed: ${response.status}`);
    const results = await response.json() as NominatimPlace[];
    return NextResponse.json(results.map((place) => { const parts = place.display_name.split(",").map((part) => part.trim()); return { id: String(place.place_id), name: place.name || parts[0] || place.display_name, address: parts.slice(1).join(", "), latitude: Number(place.lat), longitude: Number(place.lon), type: place.type || place.category || "place" }; }));
  } catch { return NextResponse.json([]); }
}
