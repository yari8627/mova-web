import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";

type GeoResult = { latitude: number; longitude: number; name: string };

export async function GET(request: NextRequest) {
  if (!await currentUser()) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const country = request.nextUrl.searchParams.get("country")?.trim().slice(0, 80) || "";
  const city = request.nextUrl.searchParams.get("city")?.trim().slice(0, 80) || "";
  const startDate = request.nextUrl.searchParams.get("start") || "";
  const endDate = request.nextUrl.searchParams.get("end") || "";
  if (!country || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return NextResponse.json({ error: "Dati del viaggio non validi" }, { status: 400 });

  try {
    const geocoding = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geocoding.searchParams.set("name", city ? `${city}, ${country}` : country);
    geocoding.searchParams.set("count", "1");
    geocoding.searchParams.set("language", "it");
    geocoding.searchParams.set("format", "json");
    const geoResponse = await fetch(geocoding, { signal: AbortSignal.timeout(4500), next: { revalidate: 2592000 } });
    const geoPayload = await geoResponse.json() as { results?: GeoResult[] };
    const location = geoPayload.results?.[0];
    if (!location) return NextResponse.json({ days: [], available: false, reason: "location" });

    const forecast = new URL("https://api.open-meteo.com/v1/forecast");
    forecast.searchParams.set("latitude", String(location.latitude));
    forecast.searchParams.set("longitude", String(location.longitude));
    forecast.searchParams.set("daily", "weather_code");
    forecast.searchParams.set("forecast_days", "16");
    forecast.searchParams.set("timezone", "auto");
    const weatherResponse = await fetch(forecast, { signal: AbortSignal.timeout(5000), next: { revalidate: 1800 } });
    if (!weatherResponse.ok) throw new Error("Previsioni non disponibili");
    const weather = await weatherResponse.json() as { daily?: { time?: string[]; weather_code?: number[] } };
    const dates = weather.daily?.time || [];
    const codes = weather.daily?.weather_code || [];
    const days = dates.map((date, index) => ({ date, code: codes[index] ?? 0 })).filter((day) => day.date >= startDate && day.date <= endDate);
    return NextResponse.json({ days, available: days.length > 0, reason: days.length ? null : "outside-window", location: location.name, updatedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ days: [], available: false, reason: "service" }, { status: 200 });
  }
}
