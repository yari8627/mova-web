import { primaryHomeDestination, photoText, safeHomePhotoUrl } from "./home-photo-destination";

// Public destination-photo metadata only; no trip/account IDs or persistent storage.
const photos = new Map<string, { url: string; expires: number }>();
const pending = new Map<string, Promise<string>>();
export function homePhotoKey(country: string, city: string) { return JSON.stringify([photoText(country), photoText(primaryHomeDestination(country, city)?.locality || "")]); }
export function cachedHomePhoto(country: string, city: string) {
  const key = homePhotoKey(country, city), value = photos.get(key);
  if (value && value.expires > Date.now()) return value.url;
  photos.delete(key);
  return "";
}
export function resolveHomePhoto(country: string, city: string, refresh = false, localFallback = false): Promise<string> {
  const destination = primaryHomeDestination(country, city);
  if (!destination) return Promise.resolve("");
  const key = homePhotoKey(country, city), cached = cachedHomePhoto(country, city);
  const remembered = photos.get(key);
  if (!refresh && remembered && remembered.expires > Date.now()) return Promise.resolve(cached);
  const requestKey = `${key}|${localFallback}`;
  if (pending.has(requestKey)) return pending.get(requestKey)!;
  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const params = new URLSearchParams({ city: destination.locality, country: destination.country, scope: "home-v2" });
      if (localFallback) params.set("fallback", "local");
      const response = await fetch(`/api/city-image?${params}`, { signal: controller.signal });
      if (!response.ok) return "";
      const result = await response.json();
      const url = safeHomePhotoUrl(result.image);
      if (photos.size >= 80) photos.delete(photos.keys().next().value!);
      photos.set(key, { url, expires: Date.now() + (url ? 86400000 : 60000) });
      return url;
    } catch { return ""; }
    finally { clearTimeout(timeout); }
  })().finally(() => pending.delete(requestKey));
  pending.set(requestKey, request);
  return request;
}

export function homePhotoSrcSet(source: string) {
  try {
    const url = new URL(source);
    const match = url.pathname.match(/\/(\d+)px-([^/]+)$/);
    if (url.protocol !== "https:" || !["upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname) || !url.pathname.includes("/thumb/") || !match || !/\.(?:jpe?g|png|webp)$/i.test(match[2])) return undefined;
    // Wikimedia rejects arbitrary thumbnail widths; preserve the same file/crop.
    // https://www.mediawiki.org/wiki/Common_thumbnail_sizes
    return [250, 330, 500, 960, 1280, 1920].filter(width => width <= Number(match[1])).map(width => {
      const variant = new URL(url);
      variant.pathname = url.pathname.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`);
      return `${variant.href} ${width}w`;
    }).join(", ") || undefined;
  } catch { return undefined; }
}
