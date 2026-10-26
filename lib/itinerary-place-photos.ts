import { photoRetryDelay, photoText, symbolicPhoto } from './home-photo-destination';
export type PlacePhotoTarget = { place: string; placeAddress?: string; latitude?: number; longitude?: number; placeId?: string; photoName?: string; photoUrl?: string; photoAttribution?: string; photoAttributionUri?: string };
export type PlacePhoto = { url: string; attribution?: string; attributionUri?: string };
// Live display state only: no new persistent Google photo-name/URI cache.
const display = new Map<string, { value: PlacePhoto | null; expires: number }>();
const pending = new Map<string, Promise<PlacePhoto | null>>();
let account = '', generation = 0, blockedUntil = 0, active = 0;
export function placePhotoRetryWait() { return Math.max(0, blockedUntil - Date.now()); }
const waiting: Array<() => void> = [];
export function setPlacePhotoAccount(value: string) { if (value !== account) { account = value; generation++; display.clear(); pending.clear(); } }
export function placePhotoKey(target: PlacePhotoTarget, country: string) {
  return JSON.stringify([target.placeId || target.photoName?.match(/^places\/([^/]+)\/photos\/[^/]+$/)?.[1] || '', photoText(target.place), photoText(target.placeAddress || ''), target.latitude ?? null, target.longitude ?? null, photoText(country)]);
}
export function safePlacePhoto(value: unknown) {
  if (typeof value !== 'string' || symbolicPhoto(value)) return '';
  try { const url = new URL(value); return url.protocol === 'https:' && !/\.svg$/i.test(url.pathname) ? url.href : ''; } catch { return ''; }
}
export function cachedPlacePhoto(target: PlacePhotoTarget, country: string) {
  const row = display.get(placePhotoKey(target, country)); return row && row.expires > Date.now() ? row.value : undefined;
}
export function rejectPlacePhoto(target: PlacePhotoTarget, country: string, url: string) {
  const key = placePhotoKey(target, country);
  if (display.get(key)?.value?.url === url) display.set(key, { value: null, expires: Date.now() + 30000 });
}
function exactCandidate(target: PlacePhotoTarget, candidate: { name?: string; address?: string }) {
  // A free-text legacy location must match both name and address, not just its city.
  return photoText(target.place) === photoText(candidate.name || '') && !!target.placeAddress?.trim()
    && photoText(target.placeAddress) === photoText(candidate.address || '');
}
export function resolvePlacePhoto(target: PlacePhotoTarget, country: string, countryCode: string, refresh = false): Promise<PlacePhoto | null> {
  const key = placePhotoKey(target, country), cached = cachedPlacePhoto(target, country), epoch = generation;
  if (!refresh && cached !== undefined) return Promise.resolve(cached);
  if (blockedUntil > Date.now()) return Promise.resolve(cached || null);
  if (pending.has(key)) return pending.get(key)!;
  const request = (async () => {
    if (active < 2) active++; else await new Promise<void>(resolve => waiting.push(resolve));
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    const current = () => epoch === generation;
    const get = async (url: string) => {
      if (!current() || blockedUntil > Date.now()) throw Error('Unavailable');
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 429 || response.status === 503) { blockedUntil = Math.max(blockedUntil, Date.now() + photoRetryDelay(response.headers?.get('retry-after'))); throw Error('Rate limited'); }
      if (!response.ok) throw Error('Photo unavailable');
      return response.json();
    };
    let result: PlacePhoto | null = null;
    try {
      if (!current()) return null;
      const direct = !refresh && safePlacePhoto(target.photoUrl);
      if (direct) result = { url: direct, attribution: target.photoAttribution, attributionUri: target.photoAttributionUri };
      else {
        let name = !refresh && target.placeId && target.photoName?.startsWith(`places/${target.placeId}/photos/`) ? target.photoName : '';
        const explicitId = target.placeId || target.photoName?.match(/^places\/([^/]+)\/photos\/[^/]+$/)?.[1];
        let details = { photoName: name, photoAttribution: target.photoAttribution, photoAttributionUri: target.photoAttributionUri };
        if (!name) {
          let placeId = explicitId;
          if (!placeId) {
            if (!target.placeAddress?.trim()) return null;
            const candidates = await get('/api/places?' + new URLSearchParams({ q: [target.place, target.placeAddress, country].filter(Boolean).join(', '), countryCode }));
            const matches = Array.isArray(candidates) ? candidates.filter(item => item.provider === 'google' && item.placeId && exactCandidate(target, item)) : [];
            if (matches.length !== 1) return null;
            placeId = matches[0].placeId;
          }
          const detail = await get('/api/places?' + new URLSearchParams({ placeId: placeId!, sessionToken: crypto.randomUUID(), ...(target.placeId ? { detail: 'photo' } : {}) }));
          if (detail?.placeId !== placeId) return null;
          if (!target.placeId && !exactCandidate(target, detail)) {
            const sameCoordinates = typeof target.latitude === 'number' && typeof target.longitude === 'number'
              && typeof detail.latitude === 'number' && typeof detail.longitude === 'number'
              && Math.abs(target.latitude - detail.latitude) < 0.001 && Math.abs(target.longitude - detail.longitude) < 0.001;
            if (!sameCoordinates || photoText(target.place) !== photoText(detail.name || '')) return null;
          }
          details = detail; name = detail.photoName || '';
        }
        if (!/^places\/[^/]+\/photos\/[^/]+$/.test(name)) return null;
        const media = await get('/api/places/photo?' + new URLSearchParams({ name, format: 'json', width: '240' }));
        const url = safePlacePhoto(media?.photoUri);
        if (url) result = { url, attribution: details.photoAttribution, attributionUri: details.photoAttributionUri };
      }
      return current() ? result : null;
    } catch { return null; }
    finally {
      clearTimeout(timer);
      // Short-lived display reuse; photo references themselves are not stored here.
      if (current()) { if (display.size >= 100) display.delete(display.keys().next().value!); display.set(key, { value: result, expires: Date.now() + (result ? 120000 : 30000) }); }
      const next = waiting.shift(); if (next) next(); else active--;
    }
  })().finally(() => { if (epoch === generation) pending.delete(key); });
  pending.set(key, request); return request;
}
