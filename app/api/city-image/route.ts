import { NextResponse } from "next/server";

type WikiPage = { title?: string; thumbnail?: { source?: string }; pageprops?: { disambiguation?: string } };
type WikiResponse = { query?: { pages?: Record<string, WikiPage> } };
type CommonsPage = { title?: string; imageinfo?: Array<{ thumburl?: string; url?: string; descriptionurl?: string; mime?: string }> };
type CommonsResponse = { query?: { pages?: Record<string, CommonsPage> } };

function normalized(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]/g, ""); }

async function wikiImage(title: string, language: "it" | "en") {
  const params = new URLSearchParams({ action: "query", titles: title, redirects: "1", prop: "pageimages|pageprops", piprop: "thumbnail", pithumbsize: "1600", format: "json", origin: "*" });
  const response = await fetch(`https://${language}.wikipedia.org/w/api.php?${params}`, { headers: { "User-Agent": "MOVA travel planner/0.1" }, next: { revalidate: 2592000 } });
  if (!response.ok) return null;
  const result = await response.json() as WikiResponse;
  const page = Object.values(result.query?.pages || {})[0];
  if (!page?.thumbnail?.source || page.pageprops?.disambiguation) return null;
  const requested = normalized(title.split(",")[0]); const resolved = normalized(page.title || "");
  if (!requested || !resolved || (!resolved.includes(requested) && !requested.includes(resolved))) return null;
  return { image: page.thumbnail.source, title: page.title, source: `Wikipedia ${language.toUpperCase()}` };
}

async function commonsImage(query: string) {
  const params = new URLSearchParams({ action: "query", generator: "search", gsrsearch: query, gsrnamespace: "6", gsrlimit: "8", prop: "imageinfo", iiprop: "url|mime", iiurlwidth: "1600", format: "json", origin: "*" });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { "User-Agent": "MOVA travel planner/0.1" }, next: { revalidate: 2592000 } });
  if (!response.ok) return null;
  const result = await response.json() as CommonsResponse;
  const excluded = /\b(flag|map|coat of arms|locator|location|emblem|logo|satellite)\b/i;
  const page = Object.values(result.query?.pages || {}).find((item) => item.imageinfo?.[0]?.mime?.startsWith("image/") && !excluded.test(item.title || "") && (item.imageinfo[0].thumburl || item.imageinfo[0].url));
  const info = page?.imageinfo?.[0]; if (!page || !info) return null;
  return { image: info.thumburl || info.url, title: page.title?.replace(/^File:/, ""), source: "Wikimedia Commons", sourceUrl: info.descriptionurl };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city")?.trim().split("·")[0]?.trim().slice(0, 100) || "";
  const country = searchParams.get("country")?.trim().slice(0, 100) || "";
  if (!city && !country) return NextResponse.json({ error: "Destinazione richiesta" }, { status: 400 });

  const candidates = [...new Set([city && country ? `${city}, ${country}` : "", city, country].filter(Boolean))];
  try {
    for (const candidate of candidates) for (const language of ["it", "en"] as const) {
      const result = await wikiImage(candidate, language);
      if (result) return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=2592000" } });
    }
    const photoQueries = [...new Set([city && country ? `${city} ${country}` : "", city || country, `${country} landscape travel`].filter(Boolean))];
    for (const query of photoQueries) { const result = await commonsImage(query); if (result) return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=2592000" } }); }
    return NextResponse.json({ image: null });
  } catch { return NextResponse.json({ image: null }); }
}
