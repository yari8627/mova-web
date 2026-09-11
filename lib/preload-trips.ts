"use client";

import { fetchPageCache, preloadOverview, readPageCache, writePageCache } from "./page-cache";
import { fetchTripSnapshot, readTripSnapshot, setTripCacheAccount, tripCacheSessionGuard } from "./trip-client-cache";

export function tripsPrepared(userId: string, trips: { id: string }[]) {
  return readPageCache(userId, "packing-template") !== null && trips.every(({ id }) =>
    readTripSnapshot(id) !== null && ["personal", "shared"].every(scope => readPageCache(userId, `packing-${id}-${scope}`) !== null)
    && readPageCache(userId, `check-in-${id}`) !== null);
}

// Bound concurrent trips so accounts with many trips do not flood the API.
export async function runPreloadQueue<T>(items: T[], load: (item: T) => Promise<unknown>, progress: (done: number, total: number) => void, cancelled: () => boolean = () => false) {
  let cursor = 0;
  let completed = 0;
  progress(0, items.length);
  await Promise.all(Array.from({ length: Math.min(2, items.length) }, async () => {
    while (!cancelled() && cursor < items.length) {
      const item = items[cursor++];
      try { await load(item); } catch { /* One unavailable trip must not block the app. */ }
      if (!cancelled()) progress(++completed, items.length);
    }
  }));
}

export async function preloadTrips(user: { id: string; name: string }, trips: { id: string }[], progress: (done: number, total: number) => void, cancelled: () => boolean) {
  setTripCacheAccount(user.id);
  await Promise.all([
    fetchPageCache(user.id, "packing-template", "/api/packing-template"),
    runPreloadQueue(trips, async ({ id }) => {
      await Promise.all([
        preloadOverview(user.id, id),
        fetchTripSnapshot(id).then(trip => {
          if (!trip || cancelled()) return;
          writePageCache(user.id, `access-${id}`, { role: trip.accessRole, userId: user.id, userName: user.name });
          writePageCache(user.id, `documents-${id}`, { documents: trip.documents, country: trip.country });
          const owner = trip.owner ? [{ ...trip.owner, id: `owner-${trip.owner.id}`, role: "owner", status: "confirmed" }] : [];
          writePageCache(user.id, `participants-${id}`, [...owner, ...trip.participants]);
        }),
      ]);
    }, progress, cancelled),
  ]);
}

type DatedTrip = { id: string; startDate: string; endDate: string };

export function priorityTrip<T extends DatedTrip>(trips: T[], today = new Date().toLocaleDateString("sv-SE")): T | undefined {
  return trips.filter(trip => trip.endDate.slice(0, 10) >= today).sort((a, b) => {
    const activeA = a.startDate.slice(0, 10) <= today;
    const activeB = b.startDate.slice(0, 10) <= today;
    return activeA !== activeB ? (activeA ? -1 : 1) : a.startDate.localeCompare(b.startDate);
  })[0];
}

let backgroundGeneration = 0;
// This queue survives Home unmounting, but never a change of account.
export function preloadOtherTrips(user: { id: string; name: string }, trips: { id: string }[]) {
  const run = ++backgroundGeneration;
  const sameSession = tripCacheSessionGuard();
  const cancelled = () => run !== backgroundGeneration || !sameSession();
  void (async () => {
    for (const trip of trips) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (cancelled()) return;
      await preloadTrips(user, [trip], () => {}, cancelled);
    }
  })().catch(() => undefined);
}
