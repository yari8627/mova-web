"use client";

import { fetchPageCache, preloadOverview, readPageCache, writePageCache } from "./page-cache";
import { fetchTripSnapshot, readTripSnapshot, setTripCacheAccount } from "./trip-client-cache";

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
