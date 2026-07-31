type TokenResponse = { access_token?: string; expires_in?: number };
let cachedToken: { value: string; expiresAt: number } | null = null;

function baseUrl() { return process.env.AMADEUS_ENV === "production" ? "https://api.amadeus.com" : "https://test.api.amadeus.com"; }
export function amadeusConfigured() { return Boolean(process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET); }
async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.value;
  const response = await fetch(`${baseUrl()}/v1/security/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.AMADEUS_API_KEY || "", client_secret: process.env.AMADEUS_API_SECRET || "" }), cache: "no-store" });
  if (!response.ok) throw new Error("Autenticazione Amadeus non riuscita");
  const token = await response.json() as TokenResponse; if (!token.access_token) throw new Error("Token Amadeus assente");
  cachedToken = { value: token.access_token, expiresAt: Date.now() + (token.expires_in || 1200) * 1000 }; return token.access_token;
}

export async function searchFlights(origin: string, destination: string, date: string) {
  const token = await accessToken(); const url = new URL(`${baseUrl()}/v2/shopping/flight-offers`);
  Object.entries({ originLocationCode: origin, destinationLocationCode: destination, departureDate: date, adults: "1", currencyCode: "EUR", max: "20" }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error("Ricerca voli non disponibile");
  return response.json() as Promise<{ data?: Array<{ id: string; itineraries: Array<{ duration: string; segments: Array<{ departure: { iataCode: string; at: string }; arrival: { iataCode: string; at: string }; carrierCode: string; number: string }> }>; validatingAirlineCodes?: string[]; price?: { total: string; currency: string } }>; dictionaries?: { carriers?: Record<string, string> } }>;
}
