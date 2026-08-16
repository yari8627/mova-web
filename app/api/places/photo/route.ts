import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";

export async function GET(request: Request) {
  if (!await currentUser()) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const name = new URL(request.url).searchParams.get("name")?.trim() || "";
  if (!apiKey || !/^places\/[^/]+\/photos\/[^/]+$/.test(name)) return NextResponse.json({ error: "Foto non disponibile" }, { status: 404 });
  const response = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=360`, {
    headers: { "X-Goog-Api-Key": apiKey },
    cache: "no-store",
  });
  if (!response.ok) return NextResponse.json({ error: "Foto non disponibile" }, { status: 502 });
  return new NextResponse(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "private, no-store",
    },
  });
}
