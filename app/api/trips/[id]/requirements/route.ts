import { NextResponse } from "next/server";
import countries from "i18n-iso-countries";
import italian from "i18n-iso-countries/langs/it.json";
import english from "i18n-iso-countries/langs/en.json";
import { currentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { getTravelRequirements, sherpaConfigured } from "../../../../../lib/sherpa";
import { tripAccess } from "../../../../../lib/trip-access";

countries.registerLocale(italian); countries.registerLocale(english);
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const { id } = await params; const access = await tripAccess(id, user); if (!access.allowed) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  if (!sherpaConfigured()) return NextResponse.json({ configured: false });
  const trip = await prisma.trip.findUnique({ where: { id } }); if (!trip) return NextResponse.json({ error: "Viaggio non trovato" }, { status: 404 });
  const destination = countries.getAlpha3Code(trip.country, "it") || countries.getAlpha3Code(trip.country, "en") || (trip.country.length === 3 ? trip.country.toUpperCase() : "");
  if (!destination) return NextResponse.json({ error: "Paese di destinazione non riconosciuto" }, { status: 422 });
  try { const result = await getTravelRequirements({ passport: user.passportCountry, origin: user.passportCountry, destination, departureDate: trip.startDate.toISOString().slice(0, 10), arrivalDate: trip.endDate.toISOString().slice(0, 10) }); const groups = result.data?.attributes?.informationGroups || []; const visaGroup = groups.find((group) => group.type === "VISA_REQUIREMENTS"); const relevant = (result.included || []).filter((item) => item.type === "PROCEDURE" || item.type === "RESTRICTION").filter((item) => item.attributes?.title && (item.attributes.documentTypes?.length || ["DOC_REQUIRED", "DOC_REQUIREMENT", "PASSPORT", "VISA", "NO_VISA"].includes(item.attributes.category || ""))); const seen = new Set<string>(); const items = relevant.filter((item) => { const key = item.attributes?.title?.trim().toLowerCase() || item.id; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 12).map((item) => ({ title: item.attributes?.title || "Requisito di ingresso", detail: item.attributes?.description || "Consulta la fonte ufficiale per i dettagli.", required: ["REQUIRED", "DOC_REQUIRED", "VISA", "PASSPORT"].includes(item.attributes?.enforcement || item.attributes?.category || ""), source: item.attributes?.sources?.find((source) => source.url)?.url || null, updated: item.attributes?.lastUpdatedAt || null })); const source = relevant.flatMap((item) => item.attributes?.sources || []).find((item) => item.url); const latest = relevant.map((item) => item.attributes?.lastUpdatedAt).filter(Boolean).sort().at(-1); return NextResponse.json({ configured: true, visa: visaGroup?.headline || "Requisiti di ingresso disponibili", visaRequired: visaGroup?.enforcement === "REQUIRED", items, source: source?.url || "https://www.viaggiaresicuri.it/", updated: latest || new Date().toISOString(), passportCountry: user.passportCountry }); } catch { return NextResponse.json({ error: "Requisiti aggiornati temporaneamente non disponibili" }, { status: 502 }); }
}
