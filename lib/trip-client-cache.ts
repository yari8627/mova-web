"use client";

type TripSnapshot = Record<string, any> & {
  id: string;
  name: string;
  country: string;
  countryCode?: string;
  city?: string;
  startDate: string;
  endDate: string;
  people: number;
  theme: string;
  activities: any[];
  bookings: any[];
  documents: any[];
  expenses: any[];
  participants: any[];
  owner?: any;
};

const memory = new Map<string, { value: TripSnapshot; savedAt: number }>();
const inflight = new Map<string, Promise<TripSnapshot | null>>();
let accountId = "";
let generation = 0;
const revisions = new Map<string, number>();

export function setTripCacheAccount(userId: string) {
  if (accountId === userId) return;
  accountId = userId;
  generation++;
  memory.clear();
  inflight.clear();
}
// Reuse startup data while moving between tabs; writes invalidate their trip.
const FRESH_FOR = 30000;

function storageKey(id: string) {
  return `mova-trip-snapshot-${accountId}-${id}`;
}

export function readTripSnapshot(id: string): TripSnapshot | null {
  const cached = memory.get(id)?.value;
  if (cached) return cached;
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(id)) || "null") as TripSnapshot | null;
    if (value) memory.set(id, { value, savedAt: 0 });
    return value;
  } catch {
    return null;
  }
}

export function writeTripSnapshot(id: string, value: TripSnapshot) {
  memory.set(id, { value, savedAt: Date.now() });
  try { window.localStorage.setItem(storageKey(id), JSON.stringify(value)); } catch { /* Cache opzionale. */ }
  window.dispatchEvent(new CustomEvent("mova-trip-snapshot", { detail: { id, value } }));
}

export async function fetchTripSnapshot(id: string, force = false): Promise<TripSnapshot | null> {
  const requestedAccount = accountId;
  const requestedGeneration = generation;
  const revision = revisions.get(id) || 0;
  const isCurrent = () => accountId === requestedAccount && generation === requestedGeneration && (revisions.get(id) || 0) === revision;
  const existing = memory.get(id);
  if (!force && existing && Date.now() - existing.savedAt < FRESH_FOR) return existing.value;
  const pending = inflight.get(id);
  if (pending) return pending;

  const request = fetch(`/api/trips/${id}`, { signal: AbortSignal.timeout(8000) })
    .then(async (response) => {
      if (!response.ok) return null;
      const value = await response.json() as TripSnapshot;
      if (!isCurrent()) return null;
      writeTripSnapshot(id, value);
      return value;
    })
    .catch(() => isCurrent() ? readTripSnapshot(id) : null)
    .finally(() => { if (isCurrent()) inflight.delete(id); });
  inflight.set(id, request);
  return request;
}

export function removeTripSnapshot(id: string) {
  revisions.set(id, (revisions.get(id) || 0) + 1);
  memory.delete(id);
  inflight.delete(id);
  try { window.localStorage.removeItem(storageKey(id)); } catch { /* Nessuna cache da rimuovere. */ }
}

export function tripCacheSessionGuard() {
  const currentGeneration = generation;
  return () => generation === currentGeneration;
}
