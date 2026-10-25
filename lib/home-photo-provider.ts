import countries from 'i18n-iso-countries';
import italian from 'i18n-iso-countries/langs/it.json';
import english from 'i18n-iso-countries/langs/en.json';
import { mentionsLocality, photoText, photoRetryDelay, primaryHomeDestination, safeHomePhotoUrl, symbolicPhoto } from './home-photo-destination';

countries.registerLocale(italian); countries.registerLocale(english);
type Photo = { image: string; title?: string; source: string; sourceUrl?: string };
function sizedPhoto(value: unknown) {
  const url = safeHomePhotoUrl(value);
  // PageImages may ignore the requested width and return an original PNG
  // (observed: Milan, 6.27 MB). Try the same-place fallback, not that download.
  return url && /\.png$/i.test(new URL(url).pathname) && !new URL(url).pathname.includes('/thumb/') ? '' : url;
}
// Wikimedia limits span its projects. Scope this gate to the whole provider,
// not a city/host, so a fallback cannot sidestep a 429. No automatic retries.
let blockedUntil = 0, activeRequests = 0;
const waiting: Array<() => void> = [];
const inFlight = new Map<string, Promise<Photo | null>>();
export class HomePhotoRateLimitError extends Error {
  constructor(public retryAfterSeconds: number) { super('Photo provider temporarily unavailable'); }
}
function checkCooldown() {
  if (blockedUntil > Date.now()) throw new HomePhotoRateLimitError(Math.ceil((blockedUntil - Date.now()) / 1000));
}
async function acquire() {
  checkCooldown();
  if (activeRequests < 3) activeRequests++;
  else await new Promise<void>(resolve => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next(); // Transfer this slot; do not briefly overbook it.
  else activeRequests--;
}
type Page = { title?: string; aliases?: string[]; pageimage?: string; extract?: string; coordinates?: unknown[]; pageprops?: { disambiguation?: string }; thumbnail?: { source?: string }; imageinfo?: Array<{ thumburl?: string; mime?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }> };
function countryNames(country: string) {
  let code = countries.getAlpha2Code(country, 'it') || countries.getAlpha2Code(country, 'en') || countries.alpha3ToAlpha2(country.toUpperCase()) || (countries.isValid(country.toUpperCase()) ? country.toUpperCase() : '');
  if (!code && photoText(country)) {
    const candidates = new Set<string>();
    for (const language of ['it', 'en']) for (const [candidate, aliases] of Object.entries(countries.getNames(language, { select: 'all' }))) {
      if (aliases.some(alias => photoText(alias).startsWith(`${photoText(country)} `))) candidates.add(candidate);
    }
    if (candidates.size === 1) code = [...candidates][0];
  }
  return [...new Set([country, ...(code ? countries.getName(code, 'en', { select: 'all' }) || [] : []), ...(code ? countries.getName(code, 'it', { select: 'all' }) || [] : [])].filter((v): v is string => !!v))];
}
async function pages(host: string, params: Record<string, string>, transport: typeof fetch) {
  await acquire();
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 3000);
  try {
    checkCooldown();
    const response = await transport(`https://${host}/w/api.php?${new URLSearchParams({ action: 'query', format: 'json', ...params })}`, {
      headers: { 'User-Agent': 'NAMI/0.1 (https://mova-web-flax.vercel.app) travel-photo-resolver' }, signal: abort.signal, next: { revalidate: 2592000 },
    });
    if (response.status === 429 || response.status === 503) {
      blockedUntil = Math.max(blockedUntil, Date.now() + photoRetryDelay(response.headers?.get('retry-after')));
      checkCooldown();
    }
    if (!response.ok) return [];
    const result = await response.json() as { query?: { pages?: Record<string, Page>; redirects?: Array<{ from: string; to: string }> } };
    return Object.values(result.query?.pages || {}).map(page => ({ ...page,
      // An authoritative redirect proves a localized name (Milano → Milan),
      // unlike guessing a translated name from the search query.
      aliases: result.query?.redirects?.filter(alias => alias.to === page.title).map(alias => alias.from) || [],
    }));
  } catch (error) { if (error instanceof HomePhotoRateLimitError) throw error; return []; }
  finally { clearTimeout(timer); release(); }
}
export function resolveSpecificHomePhoto(country: string, city: string, transport: typeof fetch = fetch, preferLocalFallback = false): Promise<Photo | null> {
  const key = JSON.stringify([photoText(country), photoText(city), preferLocalFallback]);
  const current = inFlight.get(key);
  if (current) return current;
  const request = resolvePhoto(country, city, transport, preferLocalFallback).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}
async function resolvePhoto(country: string, city: string, transport: typeof fetch, preferLocalFallback: boolean): Promise<Photo | null> {
  const explicit = primaryHomeDestination(country, city);
  if (!explicit) return null; // A nation alone cannot identify the real location.
  const names = countryNames(explicit.country);
  const locality = explicit.locality.split(/\s*[,/]\s*/).filter(part => !names.some(name => photoText(name) === photoText(part))).join(', ');
  if (!locality || countries.getAlpha2Code(locality, 'it') || countries.getAlpha2Code(locality, 'en') || countries.alpha3ToAlpha2(locality.toUpperCase())) return null;
  const destination = { ...explicit, locality };
  checkCooldown();
  const hasCountry = (text: string) => !destination.country || names.some(name => mentionsLocality(text, name));
  const wiki = async (language: string) => {
    const results = await pages(`${language}.wikipedia.org`, { titles: [destination.locality, `${destination.locality} (city)`, `${destination.locality} (città)`].join('|'), redirects: '1', prop: 'pageimages|pageprops|coordinates|extracts', piprop: 'thumbnail|name', pithumbsize: '1280', exintro: '1', explaintext: '1', exchars: '1200' }, transport);
    const page = results.find(item => {
      const lead = photoText((item.extract || '').split(/[.!]/)[0]);
      return sizedPhoto(item.thumbnail?.source) && item.pageprops?.disambiguation === undefined && item.coordinates?.length
        && mentionsLocality([item.title, ...(item.aliases || [])].join(' '), destination.locality) && hasCountry(item.extract || '')
        && !/\b(?:is a|is an|e uno|e un|e una) (?:state|country|stato|province|provincia)\b/.test(lead)
        && !symbolicPhoto(item.pageimage, item.thumbnail?.source);
    });
    if (!page) throw new Error('No verified local photo');
    return { image: sizedPhoto(page.thumbnail?.source), title: page.title, source: `Wikipedia ${language.toUpperCase()}` };
  };
  // A valid destination is released immediately; another language cannot hold it up.
  try { if (!preferLocalFallback) return await Promise.any(['it', 'en'].map(wiki)); } catch { checkCooldown(); }
  checkCooldown();
  const results = await pages('commons.wikimedia.org', {
    generator: 'search', gsrsearch: `"${destination.locality}" ${names[1] || destination.country} landscape -filetype:svg`, gsrnamespace: '6', gsrlimit: '6',
    prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiextmetadatafilter: 'ObjectName|ImageDescription|Categories', iiurlwidth: '1280',
  }, transport);
  for (const page of results) {
    const info = page.imageinfo?.[0], metadata = info?.extmetadata || {};
    const description = Object.values(metadata).map(item => item.value || '').join(' ').replace(/<[^>]*>/g, ' ');
    const identity = [page.title, description].join(' '), url = sizedPhoto(info?.thumburl);
    if (!info || !url || !['image/jpeg', 'image/png', 'image/webp'].includes(info.mime || '') || !mentionsLocality(identity, destination.locality)
      || !hasCountry(identity) || symbolicPhoto(page.title, description, url)) continue;
    return { image: url, title: page.title?.replace(/^File:/, ''), source: 'Wikimedia Commons', sourceUrl: info.descriptionurl };
  }
  return null;
}
