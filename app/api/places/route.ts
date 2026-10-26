import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { GooglePlaceLimitError, googlePlaceRequest } from "../../../lib/google-place-requests";
import { verifiedPlacePhotoDetail, type PlacePhotoTarget } from "../../../lib/itinerary-place-photos";

type NominatimPlace = { place_id: number; display_name: string; name?: string; lat: string; lon: string; type?: string; category?: string };
type GoogleSuggestion = { placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }; types?: string[] } };
type GooglePhoto = { name?: string; authorAttributions?: Array<{ displayName?: string; uri?: string }> };

async function googlePlaceDetails(placeId: string, sessionToken: string, detail: string | null = null) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  const response = await googlePlaceRequest(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=it&sessionToken=${encodeURIComponent(sessionToken)}`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": detail === "location" ? "id,displayName,formattedAddress,location,primaryType" : detail === "photo" ? "id,photos" : "id,displayName,formattedAddress,location,primaryType,photos" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const place = await response.json();
  const photo = detail === "location" ? undefined : (place.photos as GooglePhoto[] | undefined)?.[0];
  const attribution = photo?.authorAttributions?.[0];
  return { id: `google:${place.id}`, placeId: place.id, provider: "google", name: place.displayName?.text || place.formattedAddress, address: place.formattedAddress || "", latitude: place.location?.latitude, longitude: place.location?.longitude, type: place.primaryType || "place", photoName: photo?.name, photoAttribution: attribution?.displayName, photoAttributionUri: attribution?.uri };
}

async function googleAutocomplete(query: string, countryCode: string, sessionToken: string) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  const body: Record<string, unknown> = { input: query, languageCode: "it", sessionToken };
  if (/^[a-z]{2}$/i.test(countryCode)) body.includedRegionCodes = [countryCode.toUpperCase()];
  const response = await googlePlaceRequest("https://places.googleapis.com/v1/places:autocomplete", {
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
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${search}`, { headers: { "User-Agent": "NAMITravel/0.1 (travel itinerary place search)" }, signal: AbortSignal.timeout(4500), next: { revalidate: 86400 } });
  if (!response.ok) return [];
  const results = await response.json() as NominatimPlace[];
  return results.map((place) => { const parts = place.display_name.split(",").map((part) => part.trim()); return { id: String(place.place_id), provider: "openstreetmap", name: place.name || parts[0] || place.display_name, address: parts.slice(1).join(", "), latitude: Number(place.lat), longitude: Number(place.lon), type: place.type || place.category || "place" }; });
}

export async function GET(request: Request) {
  if (!await currentUser()) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const sessionToken = params.get("sessionToken")?.trim() || crypto.randomUUID();
  const placeId = params.get("placeId")?.trim();
  if (placeId) {
    let photoTarget: PlacePhotoTarget | undefined;
    if (params.has("photoTarget")) {
      try {
        const value = JSON.parse(params.get("photoTarget") || "null");
        if (!value || Array.isArray(value) || typeof value.place !== "string" || !value.place.trim()
          || (value.placeAddress !== undefined && typeof value.placeAddress !== "string")
          || (value.latitude !== undefined && !Number.isFinite(value.latitude))
          || (value.longitude !== undefined && !Number.isFinite(value.longitude))
          || (value.placeId !== undefined && value.placeId !== placeId)) throw Error("Invalid photo target");
        photoTarget = { place: value.place, placeAddress: value.placeAddress, latitude: value.latitude, longitude: value.longitude, placeId: value.placeId };
      } catch { return NextResponse.json({ error: "Luogo non valido" }, { status: 400, headers: { "Cache-Control": "private, no-store" } }); }
    }
    try {
      const detail = await googlePlaceDetails(placeId, sessionToken, params.get("detail"));
      const headers = { "Cache-Control": "private, no-store" };
      // Only the itinerary opts in. Verify identity before resolving media;
      // ambiguous candidates use the unchanged, separately verified path.
      if (photoTarget && detail && verifiedPlacePhotoDetail(photoTarget, placeId, detail)
        && /^places\/[^/]+\/photos\/[^/]+$/.test(detail.photoName || "")) {
        if (request.signal.aborted) return NextResponse.json({ error: "Foto non disponibile" }, { status: 504, headers });
        const response = await googlePlaceRequest(`https://places.googleapis.com/v1/${detail.photoName}/media?maxWidthPx=240&skipHttpRedirect=true`, {
          headers: { "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY! }, cache: "no-store", signal: request.signal,
        });
        if (!response.ok) return NextResponse.json({ error: "Foto non disponibile" }, { status: [400, 403, 404].includes(response.status) ? response.status : 502, headers });
        const media = await response.json() as { photoUri?: string };
        if (!media.photoUri) return NextResponse.json({ error: "Foto non disponibile" }, { status: 502, headers });
        return NextResponse.json({ ...detail, photoResolved: true, photoUri: media.photoUri }, { headers });
      }
      return NextResponse.json(detail, { status: process.env.GOOGLE_MAPS_API_KEY ? 200 : 503, headers });
    }
    catch (error) {
      if (error instanceof GooglePlaceLimitError) return NextResponse.json(null, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds), "Cache-Control": "private, no-store" } });
      return NextResponse.json(null, { status: 504 });
    }
  }
  const query = params.get("q")?.trim() || "";
  const countryCode = params.get("countryCode")?.trim().toLowerCase() || "";
  if (query.length < 3) return NextResponse.json([]);
  try {
    const googleResults = await googleAutocomplete(query, countryCode, sessionToken);
    if (googleResults?.length) return NextResponse.json(googleResults);
    return NextResponse.json(await nominatimAutocomplete(query, countryCode));
  } catch (error) {
    if (error instanceof GooglePlaceLimitError) return NextResponse.json([], { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds), "Cache-Control": "private, no-store" } });
    try { return NextResponse.json(await nominatimAutocomplete(query, countryCode)); } catch { return NextResponse.json([]); }
  }
}
