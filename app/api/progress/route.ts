import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Country } from "country-state-city";
import { currentUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

const regionNames = new Intl.DisplayNames(["it"], { type: "region" });
function countryCode(name: string) { const normalized = name.trim().toLocaleLowerCase("it"); return Country.getAllCountries().find((country) => country.name.toLocaleLowerCase() === normalized || regionNames.of(country.isoCode)?.toLocaleLowerCase("it") === normalized)?.isoCode; }

export async function GET() {
  const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const trips = await prisma.trip.findMany({ where: { startDate: { lte: new Date() }, OR: [{ ownerId: user.id }, { participants: { some: { email: user.email, status: "confirmed" } } }] }, select: { country: true, startDate: true } });
  for (const trip of trips) { const code = countryCode(trip.country); if (code) await prisma.visitedCountry.upsert({ where: { userId_countryCode: { userId: user.id, countryCode: code } }, update: {}, create: { id: randomUUID(), userId: user.id, countryCode: code, visitedAt: trip.startDate, source: "trip" } }); }
  const countries = await prisma.visitedCountry.findMany({ where: { userId: user.id }, orderBy: { visitedAt: "desc" } });
  return NextResponse.json(countries);
}

export async function POST(request: Request) {
  const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const body = await request.json(); const code = String(body.countryCode || "").toUpperCase();
  if (!Country.getCountryByCode(code)) return NextResponse.json({ error: "Paese non valido" }, { status: 400 });
  const record = await prisma.visitedCountry.upsert({ where: { userId_countryCode: { userId: user.id, countryCode: code } }, update: { visitedAt: body.visitedAt ? new Date(body.visitedAt) : new Date(), source: body.source === "position" ? "position" : "manual" }, create: { id: randomUUID(), userId: user.id, countryCode: code, visitedAt: body.visitedAt ? new Date(body.visitedAt) : new Date(), source: body.source === "position" ? "position" : "manual" } });
  return NextResponse.json(record);
}

export async function DELETE(request: Request) {
  const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const code = new URL(request.url).searchParams.get("countryCode")?.toUpperCase(); if (!code) return NextResponse.json({ error: "Paese richiesto" }, { status: 400 });
  await prisma.visitedCountry.deleteMany({ where: { userId: user.id, countryCode: code } }); return NextResponse.json({ deleted: true });
}
