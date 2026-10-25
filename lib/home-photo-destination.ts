// Only explicit destination fields are used; trip names and participants are not queried.
export function photoText(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function primaryHomeDestination(country: string, city: string) {
  const nation = country.trim().slice(0, 100);
  const first = city.split('·')[0].trim().slice(0, 100);
  const parts = first.split(/\s*[,/]\s*/).filter(Boolean);
  const locality = parts.filter(part => photoText(part) !== photoText(nation)).join(', ').trim();
  if (!locality || photoText(locality) === photoText(nation)) return null;
  return { locality, country: nation };
}
const symbolic = /\b(flags?|bandier[ae]|drapeau|flagge|emblems?|stemma|stemmi|coat of arms|coats of arms|maps?|mapp[ae]|cartina|locator|icons?|logos?|seals?|banners?|patriotic|symbols?|simbol[oi]|diagrams?|satellite|portraits?|paintings?|illustrations?)\b/i;
export function symbolicPhoto(...values: (string | undefined)[]) {
  return values.some(value => {
    try { return symbolic.test(photoText(decodeURIComponent(value || ''))); } catch { return true; }
  });
}
export function safeHomePhotoUrl(value: unknown) {
  if (typeof value !== 'string' || symbolicPhoto(value)) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname)
      && /\.(?:jpe?g|png|webp)(?:$|\?)/i.test(url.pathname) ? url.href : '';
  } catch { return ''; }
}
export function mentionsLocality(text: string, locality: string) {
  const needle = photoText(locality.split(',')[0]);
  return !!needle && ` ${photoText(text)} `.includes(` ${needle} `);
}

// Retry-After allows seconds or an HTTP date. Missing/invalid values use a
// conservative minute; never retry sooner than a valid provider instruction.
export function photoRetryDelay(value: string | null | undefined, now = Date.now()) {
  if (!value?.trim()) return 60000;
  const seconds = /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(5000, delay) : 60000;
}
