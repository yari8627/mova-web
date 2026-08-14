"use client";

type TripRecord = { id: string; name: string; country: string; countryCode: string; city: string; startDate: string; endDate: string; people: number; theme: string };
type Snapshot = { activities?: unknown[]; bookings?: unknown[]; documents?: unknown[]; expenses?: unknown[]; participants?: unknown[]; budget?: number | null };

function currentTrip(id: string) {
  const saved = JSON.parse(window.localStorage.getItem("mova-trips") || "[]") as TripRecord[];
  return saved.find((trip) => trip.id === id);
}

export async function syncTripSnapshot(id: string, snapshot: Snapshot) {
  try {
    let trip = currentTrip(id);
    if (!trip) {
      const tripResponse = await fetch(`/api/trips/${id}`, { cache: "no-store" });
      if (!tripResponse.ok) return false;
      const remote = await tripResponse.json();
      trip = {
        id: remote.id,
        name: remote.name,
        country: remote.country,
        countryCode: remote.countryCode,
        city: remote.city,
        startDate: String(remote.startDate).slice(0, 10),
        endDate: String(remote.endDate).slice(0, 10),
        people: remote.people,
        theme: remote.theme,
      };
    }
    const response = await fetch(`/api/trips/${id}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip, ...snapshot }),
    });
    return response.ok;
  } catch {
    /* Il localStorage rimane il fallback offline. */
    return false;
  }
}

export function syncTripResource(id: string, resource: keyof Omit<Snapshot, "budget">, items: unknown[]) {
  return syncTripSnapshot(id, { [resource]: items });
}
