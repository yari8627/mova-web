"use client";

type TripRecord = { id: string; name: string; country: string; countryCode: string; city: string; startDate: string; endDate: string; people: number; theme: string };
type Snapshot = { activities?: unknown[]; bookings?: unknown[]; documents?: unknown[]; expenses?: unknown[]; participants?: unknown[]; budget?: number | null };

function currentTrip(id: string) {
  const saved = JSON.parse(window.localStorage.getItem("mova-trips") || "[]") as TripRecord[];
  return saved.find((trip) => trip.id === id);
}

export async function syncTripSnapshot(id: string, snapshot: Snapshot) {
  const trip = currentTrip(id); if (!trip) return;
  try { await fetch(`/api/trips/${id}/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip, ...snapshot }) }); } catch { /* Il localStorage rimane il fallback offline. */ }
}

export function syncTripResource(id: string, resource: keyof Omit<Snapshot, "budget">, items: unknown[]) {
  return syncTripSnapshot(id, { [resource]: items });
}
