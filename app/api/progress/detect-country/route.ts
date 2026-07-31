import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";

export async function POST(request: Request) {
  if (!await currentUser()) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const body = await request.json(); const latitude = Number(body.latitude); const longitude = Number(body.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return NextResponse.json({ error: "Posizione non valida" }, { status: 400 });
  try { const query = new URLSearchParams({ lat: String(latitude), lon: String(longitude), format: "jsonv2", zoom: "3", "accept-language": "it" }); const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, { headers: { "User-Agent": "MOVA travel progress/0.1" }, cache: "no-store" }); if (!response.ok) throw new Error(); const result = await response.json(); const code = result.address?.country_code?.toUpperCase(); if (!code) throw new Error(); return NextResponse.json({ countryCode: code, country: result.address?.country }); } catch { return NextResponse.json({ error: "Non è stato possibile riconoscere il Paese" }, { status: 502 }); }
}
