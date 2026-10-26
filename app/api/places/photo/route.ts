import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { GooglePlaceLimitError, googlePlaceRequest } from "../../../../lib/google-place-requests";

export async function GET(request: Request) {
  if (!await currentUser()) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const params = new URL(request.url).searchParams;
  const name = params.get("name")?.trim() || "";
  if (!apiKey || !/^places\/[^/]+\/photos\/[^/]+$/.test(name)) return NextResponse.json({ error: "Foto non disponibile" }, { status: 404 });
  try {
  const width = params.get("format") === "json" ? 240 : 360;
  const response = await googlePlaceRequest(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=${width}&skipHttpRedirect=true`, {
    headers: { "X-Goog-Api-Key": apiKey },
    cache: "no-store",
  });
  if (!response.ok) return NextResponse.json({ error: "Foto non disponibile" }, { status: [400, 403, 404].includes(response.status) ? response.status : 502 });
  const result = await response.json() as { photoUri?: string };
  if (!result.photoUri) return NextResponse.json({ error: "Foto non disponibile" }, { status: 502 });
  if (params.get("format") === "json") return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.redirect(result.photoUri, { status: 302, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof GooglePlaceLimitError) return NextResponse.json({ error: "Foto temporaneamente non disponibile" }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds), "Cache-Control": "private, no-store" } });
    return NextResponse.json({ error: "Foto non disponibile" }, { status: 504, headers: { "Cache-Control": "private, no-store" } });
  }
}
