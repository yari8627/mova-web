import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { tripAccess } from "../../../lib/trip-access";
import { normalizeTripCountry } from "../../../lib/country-names";

export async function GET() { const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 }); const trips = await prisma.trip.findMany({ where: { archivedAt: null, OR: [{ ownerId: user.id }, { participants: { some: { email: user.email, status: "confirmed" } } }] }, orderBy: { startDate: "asc" } }); return NextResponse.json(trips.map(normalizeTripCountry)); }

export async function POST(request: Request) {
  const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 }); const body = await request.json();
  if (!String(body.country || "").trim() || !String(body.city || "").trim()) return NextResponse.json({ error: "Seleziona Paese e città del viaggio" }, { status: 400 });
  const existing = await prisma.trip.findUnique({ where: { id: body.id } });
  if (existing) { const access = await tripAccess(body.id, user, true); if (!access.allowed) return NextResponse.json({ error: "Non hai accesso a questo viaggio" }, { status: 403 }); return NextResponse.json(access.trip); }
  const normalized = normalizeTripCountry({ country: String(body.country), name: String(body.name) });
  const trip = await prisma.trip.create({ data: { id: body.id, name: normalized.name, country: normalized.country, countryCode: body.countryCode || "🌍", city: body.city, startDate: new Date(`${body.startDate}T12:00:00`), endDate: new Date(`${body.endDate}T12:00:00`), people: Number(body.people) || 1, theme: body.theme || "blue", ownerId: user.id } });
  return NextResponse.json(trip, { status: 201 });
}
