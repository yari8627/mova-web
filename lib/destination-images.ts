export const curatedDestinationImages: Record<string, string> = {
  Thailandia: "/destinations/thailand.webp", Thailand: "/destinations/thailand.webp",
  Giappone: "/destinations/japan.webp", Japan: "/destinations/japan.webp",
  Egitto: "/destinations/egypt.webp", Egypt: "/destinations/egypt.webp",
  Italia: "/destinations/italy.webp", Italy: "/destinations/italy.webp",
};

export function firstDestination(city?: string) { return city?.split("·")[0]?.trim() || ""; }
export async function fetchDestinationImage(country: string, city?: string) {
  if (curatedDestinationImages[country]) return curatedDestinationImages[country];
  if (!country && !city) return "";
  try {
    const response = await fetch(`/api/city-image?city=${encodeURIComponent(firstDestination(city))}&country=${encodeURIComponent(country)}`);
    if (!response.ok) return "";
    const result = await response.json(); return String(result.image || "");
  } catch { return ""; }
}
