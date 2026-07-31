import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";

type NominatimPlace = { place_id: number; display_name: string; name?: string; lat: string; lon: string; type?: string; category?: string };
type GoogleSuggestion = { placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }; types?: string[] } };

async function googlePlaceDetails(placeId: string, sessionToken: string) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=it&sessionToken=${encodeURIComponent(sessionToken)}`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "id,displayName,formattedAddress,location,primaryType" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const place = await response.json();
  return { id: `google:${place.id}`, placeId: place.id, provider: "google", name: place.displayName?.text || place.formattedAddress, address: place.formattedAddress || "", latitude: place.location?.latitude, longitude: place.location?.longitude, type: place.primaryType || "place" };
}

async function googleAutocomplete(query: string, countryCode: string, sessionToken: string) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  const body: Record<string, unknown> = { input: query, languageCode: "it", sessionToken };
  if (/^[a-z]{2}$/i.test(countryCode)) body.includedRegionCodes = [countryCode.toUpperCase()];
  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text,suggestions.placePrediction.types" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const result = await response.json() as { suggestions?: GoogleSuggestion[] };
  return (result.suggestions || []).flatMap(({ placePrediction }) => placePrediction?.placeId ? [{ id: `google:${placePrediction.placeId}`, placeId: placePrediction.placeId, provider: "google", name: placePrediction.structuredFormat?.mainText?.text || placePrediction.text?.text || "Luogo", address: placePrediction.structuredFormat?.secondaryText?.text || "", type: placePrediction.types?.[0] || "place" }] : []);
}

async function nominatimAutocomplete(query: string, countryCode: string) {
  const search = new URLSearchParams({ q: query, format: "jsonv2", addressdetails: "1", namedetails: "1", limit: "8", accept_language: "it" });
  if (/^[a-z]{2}$/.test(countryCode)) search.set("countrycodes", countryCode);
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${search}`, { headers: { "User-Agent": "MovaTravel/0.1 (travel itinerary place search)" }, next: { revalidate: 86400 } });
  if (!response.ok) return [];
  const results = await response.json() as NominatimPlace[];
  return results.map((place) => { const parts = place.display_name.split(",").map((part) => part.trim()); return { id: String(place.place_id), provider: "openstreetmap", name: place.name || parts[0] || place.display_name, address: parts.slice(1).join(", "), latitude: Number(place.lat), longitude: Number(place.lon), type: place.type || place.category || "place" }; });
}

export async function GET(request: Request) {
  if (!await currentUser()) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const sessionToken = params.get("sessionToken")?.trim() || crypto.randomUUID();
  const placeId = params.get("placeId")?.trim();
  if (placeId) return NextResponse.json(await googlePlaceDetails(placeId, sessionToken), { status: process.env.GOOGLE_MAPS_API_KEY ? 200 : 503 });
  const query = params.get("q")?.trim() || "";
  const countryCode = params.get("countryCode")?.trim().toLowerCase() || "";
  if (query.length < 2) return NextResponse.json([]);
  try {
    const googleResults = await googleAutocomplete(query, countryCode, sessionToken);
    if (googleResults?.length) return NextResponse.json(googleResults);
    return NextResponse.json(await nominatimAutocomplete(query, countryCode));
  } catch {
    try { return NextResponse.json(await nominatimAutocomplete(query, countryCode)); } catch { return NextResponse.json([]); }
  }
}
