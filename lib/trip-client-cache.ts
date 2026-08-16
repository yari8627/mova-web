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
// Abbastanza per accorpare copertina e pagina, ma non per nascondere una modifica recente.
const FRESH_FOR = 750;

function storageKey(id: string) {
  return `mova-trip-snapshot-${id}`;
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
  const existing = memory.get(id);
  if (!force && existing && Date.now() - existing.savedAt < FRESH_FOR) return existing.value;
  const pending = inflight.get(id);
  if (pending) return pending;

  const request = fetch(`/api/trips/${id}`)
    .then(async (response) => {
      if (!response.ok) return null;
      const value = await response.json() as TripSnapshot;
      writeTripSnapshot(id, value);
      return value;
    })
    .catch(() => readTripSnapshot(id))
    .finally(() => inflight.delete(id));
  inflight.set(id, request);
  return request;
}

export function removeTripSnapshot(id: string) {
  memory.delete(id);
  inflight.delete(id);
  try { window.localStorage.removeItem(storageKey(id)); } catch { /* Nessuna cache da rimuovere. */ }
}
