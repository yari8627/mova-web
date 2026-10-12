import { sortActivities } from "./activity-order";

export type TitleSource = "place" | "custom";
export type ActivityDraftData = { title: string; titleSource?: TitleSource; place: string; placeAddress?: string; latitude?: number; longitude?: number; photoName?: string; photoUrl?: string; photoAttribution?: string; photoAttributionUri?: string };
export type SelectedPlace = { name: string; address?: string; latitude?: number; longitude?: number; photoName?: string; photoUrl?: string; photoAttribution?: string; photoAttributionUri?: string };

export function applyActivityPlace<T extends ActivityDraftData>(draft: T, place: SelectedPlace): T {
  const automatic = !draft.title.trim() || draft.titleSource === "place";
  return { ...draft, title: automatic ? place.name : draft.title, titleSource: automatic ? "place" : draft.titleSource, place: place.name, placeAddress: place.address, latitude: place.latitude, longitude: place.longitude, photoName: place.photoName, photoUrl: place.photoUrl, photoAttribution: place.photoAttribution, photoAttributionUri: place.photoAttributionUri };
}

export function editActivityPlace<T extends ActivityDraftData>(draft: T, place: string): T {
  return { ...draft, place, title: draft.titleSource === "place" ? "" : draft.title, placeAddress: undefined, latitude: undefined, longitude: undefined, photoName: undefined, photoUrl: undefined, photoAttribution: undefined, photoAttributionUri: undefined };
}

export function prepareActivityDraft<T extends ActivityDraftData>(draft: T): T {
  const place = draft.place.trim();
  if (!place) throw new Error("Inserisci o seleziona un luogo prima di salvare.");
  return { ...draft, place, title: draft.title.trim() || place, titleSource: draft.title.trim() ? draft.titleSource : "place" };
}

// Legacy/other-device titles are unknown: never infer provenance from matching names.
export function restoreActivityMetadata<T extends ActivityDraftData & { id: string }>(remote: T, cached?: T): T {
  if (!cached || cached.id !== remote.id || cached.place !== remote.place || (cached.placeAddress ?? null) !== (remote.placeAddress ?? null) || (cached.latitude ?? null) !== (remote.latitude ?? null) || (cached.longitude ?? null) !== (remote.longitude ?? null)) return remote;
  return { ...remote, titleSource: cached.title === remote.title ? cached.titleSource : undefined, photoName: cached.photoName, photoUrl: cached.photoUrl, photoAttribution: cached.photoAttribution, photoAttributionUri: cached.photoAttributionUri };
}

type RouteActivity = { id: string; day: number; sortOrder?: number; done: boolean; latitude?: number; longitude?: number; place: string; placeAddress?: string };
export function activityRoute(items: RouteActivity[]): { url?: string; message?: string } {
  const remaining = sortActivities(items.filter(item => !item.done));
  if (items.length && !remaining.length) return { message: "Hai completato tutte le tappe di oggi!" };
  const stops = remaining.map(item => typeof item.latitude === "number" && typeof item.longitude === "number" && Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && Math.abs(item.latitude) <= 90 && Math.abs(item.longitude) <= 180 ? `${item.latitude},${item.longitude}` : [item.place, item.placeAddress].filter(value => value?.trim()).join(", ")).filter(Boolean);
  if (!stops.length) return { message: "Nessuna tappa valida per creare il percorso." };
  if (stops.length === 1) return { url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stops[0])}` };
  const params = new URLSearchParams({ api: "1", origin: stops[0], destination: stops[stops.length - 1], travelmode: "walking" });
  if (stops.length > 2) params.set("waypoints", stops.slice(1, -1).join("|"));
  return { url: `https://www.google.com/maps/dir/?${params}` };
}

export function latestActivityRequest() {
  let revision = 0;
  let controller: AbortController | undefined;
  return {
    begin() {
      controller?.abort(); controller = new AbortController();
      const current = ++revision;
      const signal = controller.signal;
      return { signal, isCurrent: () => current === revision && !signal.aborted };
    },
    cancel() { revision++; controller?.abort(); },
  };
}
