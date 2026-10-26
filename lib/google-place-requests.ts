import { photoRetryDelay } from './home-photo-destination';
let blockedUntil = 0, active = 0;
const waiting: Array<() => void> = [];
export class GooglePlaceLimitError extends Error {
  constructor(public retryAfterSeconds: number) { super('Place provider temporarily unavailable'); }
}
function check() { if (blockedUntil > Date.now()) throw new GooglePlaceLimitError(Math.ceil((blockedUntil - Date.now()) / 1000)); }
export async function googlePlaceRequest(url: string, options: RequestInit = {}, transport: typeof fetch = fetch) {
  check();
  if (active < 3) active++; else await new Promise<void>(resolve => waiting.push(resolve));
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 4500);
  const cancel = () => controller.abort(); options.signal?.addEventListener('abort', cancel, { once: true });
  try {
    check(); if (options.signal?.aborted) controller.abort();
    const response = await transport(url, { ...options, signal: controller.signal });
    if (response.status === 429 || response.status === 503) {
      blockedUntil = Math.max(blockedUntil, Date.now() + photoRetryDelay(response.headers?.get('retry-after'))); check();
    }
    // Keep the deadline and provider slot until the small metadata body arrives.
    if (typeof response.arrayBuffer === 'function' && response.status !== 204) return new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers });
    return response;
  } finally {
    clearTimeout(timeout); options.signal?.removeEventListener('abort', cancel);
    const next = waiting.shift(); if (next) next(); else active--;
  }
}
