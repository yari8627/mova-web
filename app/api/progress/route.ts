import { randomUUID } from "crypto";
import { performance } from "node:perf_hooks";
import { NextResponse } from "next/server";
import { Country } from "country-state-city";
import { currentUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { progressCacheScope } from "../../../lib/progress-cache-scope";
import { PROGRESS_SCOPE_HEADER, PROGRESS_OWNER_HEADER, PROGRESS_EXPIRY_HEADER } from "../../../lib/progress-cache-contract";

const regionNames = new Intl.DisplayNames(["it"], { type: "region" });
function countryCode(name: string) { const normalized = name.trim().toLocaleLowerCase("it"); return Country.getAllCountries().find((country) => country.name.toLocaleLowerCase() === normalized || regionNames.of(country.isoCode)?.toLocaleLowerCase("it") === normalized)?.isoCode; }

export async function GET() {
  // Temporary opt-in diagnostics: durations only, never identifiers or query parameters.
  const diagnostics = process.env.NAMI_PROGRESS_TIMING === "1";
  const started = performance.now();
  const spans: string[] = [];
  let cacheScope: Awaited<ReturnType<typeof progressCacheScope>> | null = null;
  async function measure<T>(name: string, run: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try { return await run(); }
    finally { if (diagnostics) spans.push(`${name};dur=${(performance.now() - start).toFixed(2)}`); }
  }
  function respond(body: unknown, status = 200) {
    const start = performance.now();
    const response = NextResponse.json(body, { status });
    response.headers.set("Cache-Control", "private, no-store");
    if (cacheScope) {
      response.headers.set(PROGRESS_SCOPE_HEADER, cacheScope.scope);
      response.headers.set(PROGRESS_OWNER_HEADER, cacheScope.owner);
      response.headers.set(PROGRESS_EXPIRY_HEADER, cacheScope.expiresAt);
    }
    if (diagnostics) {
      spans.push(`serialize;dur=${(performance.now() - start).toFixed(2)}`, `total;dur=${(performance.now() - started).toFixed(2)}`);
      response.headers.set("Server-Timing", spans.join(", "));
    }
    return response;
  }
  const user = await measure("auth", currentUser); if (!user) return respond({ error: "Accesso richiesto" }, 401);
  cacheScope = await progressCacheScope(user.id, user.sessionExpiresAt);
  const countries = await measure("visits", () => prisma.visitedCountry.findMany({ where: { userId: user.id }, orderBy: { visitedAt: "desc" } }));
  const trips = await measure("trips", () => prisma.trip.findMany({ where: { startDate: { lte: new Date() }, OR: [{ ownerId: user.id }, { participants: { some: { email: user.email, status: "confirmed" } } }] }, select: { country: true, startDate: true } }));
  // Preserve the first occurrence, just like the former sequential upserts.
  // Existing manual/position visits must never have their date or source overwritten.
  const imported = new Map<string, { id: string; userId: string; countryCode: string; visitedAt: Date; source: string }>();
  const deduplicateStarted = performance.now();
  const existing = new Set(countries.map(country => country.countryCode));
  for (const trip of trips) {
    const code = countryCode(trip.country);
    if (code && !existing.has(code) && !imported.has(code)) imported.set(code, { id: randomUUID(), userId: user.id, countryCode: code, visitedAt: trip.startDate, source: "trip" });
  }
  if (diagnostics) spans.push(`deduplicate;dur=${(performance.now() - deduplicateStarted).toFixed(2)}`);
  if (!imported.size) return respond(countries);
  await measure("sync", () => prisma.visitedCountry.createMany({ data: [...imported.values()], skipDuplicates: true }));
  // Always reread after an attempted import, even if a concurrent writer won every
  // conflict. Return the persisted IDs, dates and sources, never synthesized visits.
  const synchronized = await measure("reread", () => prisma.visitedCountry.findMany({ where: { userId: user.id }, orderBy: { visitedAt: "desc" } }));
  return respond(synchronized);
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
