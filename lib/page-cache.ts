"use client";

const pending = new Map<string, Promise<unknown>>();
const versions = new Map<string, number>();
const refreshed = new Map<string, number>();

// Account-specific copies for immediate display; the server remains authoritative.
export function readPageCache<T>(userId: string, resource: string): T | null {
  if (!userId) return null;
  try { return JSON.parse(sessionStorage.getItem(`mova-page:${userId}:${resource}`) || "null") as T | null; }
  catch { return null; }
}

export function writePageCache<T>(userId: string, resource: string, value: T) {
  if (!userId) return;
  const key = `${userId}:${resource}`;
  versions.set(key, (versions.get(key) || 0) + 1);
  refreshed.set(key, Date.now());
  try { sessionStorage.setItem(`mova-page:${userId}:${resource}`, JSON.stringify(value)); }
  catch { /* Storage is optional. */ }
}

export async function fetchPageCache<T>(userId: string, resource: string, url: string): Promise<T | null> {
  if (!userId) return null;
  const key = `${userId}:${resource}`;
  const cached = readPageCache<T>(userId, resource);
  if (cached !== null && Date.now() - (refreshed.get(key) || 0) < 30000) return cached;
  const existing = pending.get(key);
  if (existing) return existing as Promise<T | null>;
  const version = versions.get(key) || 0;
  const request = fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) }).then(async response => {
    if (!response.ok) throw new Error("Caricamento non riuscito");
    const value = await response.json() as T;
    if ((versions.get(key) || 0) !== version) return readPageCache<T>(userId, resource);
    writePageCache(userId, resource, value);
    refreshed.set(key, Date.now());
    return value;
  }).catch(() => readPageCache<T>(userId, resource)).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export function preloadOverview(userId: string, tripId: string) {
  return Promise.all([
    fetchPageCache(userId, `packing-${tripId}-personal`, `/api/trips/${tripId}/packing?scope=personal`),
    fetchPageCache(userId, `packing-${tripId}-shared`, `/api/trips/${tripId}/packing?scope=shared`),
    fetchPageCache(userId, `check-in-${tripId}`, `/api/trips/${tripId}/check-in`),
  ]);
}
