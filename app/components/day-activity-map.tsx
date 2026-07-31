"use client";

import { useEffect, useMemo, useRef } from "react";
import { City } from "country-state-city";
import { MapPinned } from "lucide-react";

type MapActivity = { id: string; title: string; place: string; time: string; latitude?: number; longitude?: number };

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("it"); }

export function DayActivityMap({ activities, countryCode }: { activities: MapActivity[]; countryCode: string | null }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const points = useMemo(() => {
    if (!countryCode) return [];
    const cities = City.getCitiesOfCountry(countryCode) || [];
    const occurrences = new Map<string, number>();
    return activities.map((activity, index) => {
      const city = cities.find((item) => normalize(item.name) === normalize(activity.place));
      const latitude = Number(activity.latitude ?? city?.latitude); const longitude = Number(activity.longitude ?? city?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      const key = `${latitude}:${longitude}`; const occurrence = occurrences.get(key) || 0; occurrences.set(key, occurrence + 1);
      const angle = occurrence * 2.2; const offset = occurrence ? .0018 * Math.ceil(occurrence / 5) : 0;
      return { ...activity, order: index + 1, latitude: latitude + Math.sin(angle) * offset, longitude: longitude + Math.cos(angle) * offset };
    }).filter(Boolean) as Array<MapActivity & { order: number; latitude: number; longitude: number }>;
  }, [activities, countryCode]);

  useEffect(() => {
    if (!mapElement.current || !points.length) return;
    let disposed = false; let map: import("leaflet").Map | null = null;
    void import("leaflet").then((L) => {
      if (disposed || !mapElement.current) return;
      map = L.map(mapElement.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
      const coordinates: Array<[number, number]> = [];
      for (const point of points) {
        const position: [number, number] = [point.latitude, point.longitude]; coordinates.push(position);
        const icon = L.divIcon({ className: "day-map-marker-wrap", html: `<span>${point.order}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
        const tooltip = document.createElement("div"); const title = document.createElement("strong"); const detail = document.createElement("small"); title.textContent = point.title; detail.textContent = `${point.time} · ${point.place}`; tooltip.append(title, detail);
        L.marker(position, { icon }).addTo(map).bindTooltip(tooltip, { direction: "top", offset: [0, -12] });
      }
      if (coordinates.length > 1) { L.polyline(coordinates, { color: "#1459ff", weight: 3, opacity: .7, dashArray: "7 7" }).addTo(map); map.fitBounds(L.latLngBounds(coordinates), { padding: [36, 36], maxZoom: 13 }); }
      else map.setView(coordinates[0], 12);
    });
    return () => { disposed = true; map?.remove(); };
  }, [points]);

  if (!points.length) return null;
  return <section className="day-activity-map"><header><div><MapPinned size={18} /><strong>Mappa della giornata</strong></div><span>{points.length} {points.length === 1 ? "tappa" : "tappe"}</span></header><div ref={mapElement} className="day-map-canvas" aria-label="Mappa delle attività della giornata" /><footer>Marker numerati secondo l’ordine dell’itinerario e posizionati sul luogo selezionato.</footer></section>;
}
