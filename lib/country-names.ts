const countryNameOverrides: Record<string, string> = {
  CN: "Cina",
};

export function canonicalCountryName(countryCode: string, fallback: string) {
  return countryNameOverrides[countryCode.toUpperCase()] || fallback;
}

export function normalizeTripCountry<T extends { country: string; name: string }>(trip: T): T {
  if (trip.country !== "Cina continentale") return trip;
  return {
    ...trip,
    country: "Cina",
    name: trip.name.replace(/^Cina continentale(?=\s|$)/, "Cina"),
  };
}
