type SherpaIncluded = { id: string; type: string; attributes?: { title?: string; description?: string; category?: string; enforcement?: string; documentTypes?: string[]; lastUpdatedAt?: string; sources?: Array<{ title?: string; url?: string }> } };
type SherpaResponse = { data?: { attributes?: { informationGroups?: Array<{ type?: string; headline?: string; enforcement?: string }> } }; included?: SherpaIncluded[] };

export function sherpaConfigured() { return Boolean(process.env.SHERPA_API_KEY); }
export async function getTravelRequirements(input: { passport: string; origin: string; destination: string; departureDate: string; arrivalDate: string }) {
  const host = process.env.SHERPA_ENV === "production" ? "https://requirements-api.joinsherpa.com" : "https://requirements-api.sandbox.joinsherpa.com";
  const response = await fetch(`${host}/v3/trips?include=restriction,procedure`, { method: "POST", headers: { "Content-Type": "application/vnd.api+json", "x-api-key": process.env.SHERPA_API_KEY || "" }, body: JSON.stringify({ data: { type: "TRIP", attributes: { locale: "it-IT", traveller: { passports: [input.passport] }, currency: "EUR", travelNodes: [{ type: "ORIGIN", locationCode: input.origin, departure: { date: input.departureDate, time: "09:00", travelMode: "AIR" } }, { type: "DESTINATION", locationCode: input.destination, arrival: { date: input.arrivalDate, time: "18:00", travelMode: "AIR" } }] } } }), cache: "no-store" });
  if (!response.ok) throw new Error("Sherpa non disponibile"); return response.json() as Promise<SherpaResponse>;
}
