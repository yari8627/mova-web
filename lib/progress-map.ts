import { feature } from "topojson-client";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import countries from "i18n-iso-countries";
import localeIt from "i18n-iso-countries/langs/it.json";

export type MapCountry = { code: string; name: string; path: string };
export type WorldTopology = { type: "Topology"; objects: { countries: object } };
type WorldFeature = { id?: string | number; geometry: Parameters<ReturnType<typeof geoPath>>[0] };
countries.registerLocale(localeIt);

function normalizeMapFeature(item: WorldFeature, code: string): WorldFeature {
  if (code !== "FR") return item;
  const geometry = item.geometry as unknown as { type: string; coordinates?: number[][][][] };
  if (geometry.type !== "MultiPolygon" || !geometry.coordinates) return item;
  const europeanTerritories = geometry.coordinates.filter((polygon) =>
    polygon[0]?.some(([longitude, latitude]) => longitude >= -6 && longitude <= 10 && latitude >= 41 && latitude <= 52),
  );
  return { ...item, geometry: { ...geometry, coordinates: europeanTerritories } as never };
}

// The same projection, normalization and paths as the approved map.
export function buildMapCountries(topology: WorldTopology): MapCountry[] {
  const collection = feature(topology as never, topology.objects.countries as never) as unknown as { features: WorldFeature[] };
  const projection = geoNaturalEarth1().fitExtent([[12, 12], [948, 488]], collection as never);
  const path = geoPath(projection);
  return collection.features.map((item) => {
    const numeric = String(item.id || "").padStart(3, "0");
    const code = countries.numericToAlpha2(numeric) || "";
    return { code, name: countries.getName(code, "it") || code, path: path(normalizeMapFeature(item, code) as never) || "" };
  }).filter((item) => item.code && item.path);
}

// Public geography only: no visited status, account IDs or other personal data.
// Share in-flight work across mounts (including Strict Mode); allow retry on failure.
let pending: Promise<MapCountry[]> | undefined;
export function loadMapCountries(): Promise<MapCountry[]> {
  if (!pending) {
    pending = fetch("/world-countries.json").then(response => {
      if (!response.ok) throw new Error("Mappa non disponibile");
      return response.json() as Promise<WorldTopology>;
    }).then(buildMapCountries).catch(error => {
      pending = undefined;
      throw error;
    });
  }
  return pending;
}
