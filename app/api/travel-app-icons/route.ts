import { NextRequest, NextResponse } from "next/server";

type ItunesResult = { trackName?: string; artworkUrl100?: string; artworkUrl512?: string };

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim().slice(0, 80) || "";
  const website = request.nextUrl.searchParams.get("website") || "";
  if (!name) return new NextResponse(null, { status: 400 });

  try {
    const endpoint = new URL("https://itunes.apple.com/search");
    endpoint.searchParams.set("term", name);
    endpoint.searchParams.set("entity", "software");
    endpoint.searchParams.set("country", "it");
    endpoint.searchParams.set("limit", "8");
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(3500), next: { revalidate: 604800 } });
    if (response.ok) {
      const payload = await response.json() as { results?: ItunesResult[] };
      const target = normalize(name);
      const match = payload.results?.find((item) => normalize(item.trackName || "") === target) || payload.results?.find((item) => normalize(item.trackName || "").includes(target) || target.includes(normalize(item.trackName || "")));
      const artwork = match?.artworkUrl512 || match?.artworkUrl100;
      if (artwork) return NextResponse.redirect(artwork, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
    }
  } catch { /* Usa il logo del sito ufficiale. */ }

  try {
    const host = new URL(website).hostname;
    return NextResponse.redirect(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
