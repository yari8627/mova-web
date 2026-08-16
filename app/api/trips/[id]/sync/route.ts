import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { tripAccess } from "../../../../../lib/trip-access";
import { notifyTripMembers } from "../../../../../lib/notifications";

type Item = Record<string, unknown>;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const { id } = await params; const body = await request.json(); const trip = body.trip;
  if (!trip || trip.id !== id) return NextResponse.json({ error: "Dati viaggio non validi" }, { status: 400 });
  const existing = await prisma.trip.findUnique({ where: { id } });
  const access = existing ? await tripAccess(id, user, true) : null;
  if (access && (!access.allowed || access.role === "participant")) return NextResponse.json({ error: "Non hai il permesso di modificare questi dati" }, { status: 403 });
  if (access?.allowed && access.role === "co-organizer" && body.participants) return NextResponse.json({ error: "Solo il proprietario può modificare ruoli o rimuovere partecipanti" }, { status: 403 });

  await prisma.$transaction(async (tx) => {
    await tx.trip.upsert({ where: { id }, update: { name: trip.name, country: trip.country, countryCode: trip.countryCode, city: trip.city, startDate: new Date(`${trip.startDate}T12:00:00`), endDate: new Date(`${trip.endDate}T12:00:00`), people: Number(trip.people) || 1, theme: trip.theme || "blue", budget: body.budget === undefined ? undefined : body.budget }, create: { id, name: trip.name, country: trip.country, countryCode: trip.countryCode || "🌍", city: trip.city, startDate: new Date(`${trip.startDate}T12:00:00`), endDate: new Date(`${trip.endDate}T12:00:00`), people: Number(trip.people) || 1, theme: trip.theme || "blue", budget: body.budget ?? null, ownerId: user.id } });
    if (body.activities) { await tx.activity.deleteMany({ where: { tripId: id } }); await tx.activity.createMany({ data: body.activities.map((item: Item) => ({ id: String(item.id), tripId: id, day: Number(item.day), title: String(item.title), place: String(item.place), placeAddress: item.placeAddress ? String(item.placeAddress) : null, latitude: Number.isFinite(Number(item.latitude)) ? Number(item.latitude) : null, longitude: Number.isFinite(Number(item.longitude)) ? Number(item.longitude) : null, photoName: item.photoName ? String(item.photoName) : null, photoAttribution: item.photoAttribution ? String(item.photoAttribution) : null, photoAttributionUri: item.photoAttributionUri ? String(item.photoAttributionUri) : null, time: String(item.time), done: Boolean(item.done), bookingId: item.bookingId ? String(item.bookingId) : null, bookingEvent: item.bookingEvent ? String(item.bookingEvent) : null })) }); }
    if (body.bookings) {
      const bookingItems = body.bookings as Item[];
      const bookingIds = bookingItems.map((item) => String(item.id));
      await tx.activity.deleteMany({ where: { tripId: id, bookingId: { not: null, notIn: bookingIds } } });
      await tx.document.updateMany({ where: { tripId: id, bookingId: { not: null, notIn: bookingIds } }, data: { bookingId: null } });
      await tx.booking.deleteMany({ where: { tripId: id } });
      await tx.booking.createMany({ data: bookingItems.map((item) => ({ id: String(item.id), tripId: id, title: String(item.title || "Prenotazione"), type: String(item.type || "activity"), startDate: new Date(String(item.startDate)), endDate: item.endDate ? new Date(String(item.endDate)) : null, reference: item.reference ? String(item.reference) : null, status: String(item.status || "pending"), provider: item.provider ? String(item.provider) : null, location: item.location ? String(item.location) : null, notes: item.notes ? String(item.notes) : null, source: String(item.source || "manual"), importedAt: item.importedAt ? new Date(String(item.importedAt)) : null, originAirport: item.originAirport ? String(item.originAirport) : null, destinationAirport: item.destinationAirport ? String(item.destinationAirport) : null })) });
      const persistedTrip = await tx.trip.findUniqueOrThrow({ where: { id } });
      const tripStart = new Date(persistedTrip.startDate); tripStart.setHours(0, 0, 0, 0);
      for (const item of bookingItems) {
        const bookingId = String(item.id); const type = String(item.type || "activity"); const baseTitle = String(item.title || "Prenotazione");
        const eventTitle = (event: "start" | "end") => type === "hotel" ? `${event === "start" ? "Check-in" : "Check-out"} · ${baseTitle}` : type === "car" ? `${event === "start" ? "Ritiro" : "Riconsegna"} · ${baseTitle}` : type === "flight" || type === "train" ? `${event === "start" ? "Partenza" : "Arrivo"} · ${baseTitle}` : baseTitle;
        const eventPlace = (event: "start" | "end") => String(type === "flight" ? event === "start" ? item.originAirport || item.location || item.provider : item.destinationAirport || item.location || item.provider : item.location || item.provider || "Da definire");
        const events = [{ event: "start" as const, value: String(item.startDate) }, ...(item.endDate && type !== "activity" ? [{ event: "end" as const, value: String(item.endDate) }] : [])];
        const expectedIds = events.map((event) => `booking-${bookingId}-${event.event}`);
        await tx.activity.deleteMany({ where: { tripId: id, bookingId, id: { notIn: expectedIds } } });
        for (const event of events) {
          const eventDate = new Date(event.value); const calendarDate = new Date(eventDate); calendarDate.setHours(0, 0, 0, 0);
          const day = Math.max(1, Math.floor((calendarDate.getTime() - tripStart.getTime()) / 86400000) + 1);
          const time = event.value.match(/T(\d{2}:\d{2})/)?.[1] || eventDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
          const activityId = `booking-${bookingId}-${event.event}`;
          await tx.activity.upsert({ where: { id: activityId }, update: { day, title: eventTitle(event.event), place: eventPlace(event.event), time, bookingId, bookingEvent: event.event }, create: { id: activityId, tripId: id, bookingId, bookingEvent: event.event, day, title: eventTitle(event.event), place: eventPlace(event.event), time, done: false } });
        }
      }
    }
    if (body.documents) { await tx.document.deleteMany({ where: { tripId: id } }); await tx.document.createMany({ data: body.documents.map((item: Item) => ({ id: String(item.id), tripId: id, name: String(item.name), category: String(item.category), fileName: String(item.fileName), size: Number(item.size), offline: Boolean(item.offline), requirementKey: item.requirementKey ? String(item.requirementKey) : null, bookingId: item.bookingId ? String(item.bookingId) : null })) }); }
    if (body.expenses) { await tx.expense.deleteMany({ where: { tripId: id } }); await tx.expense.createMany({ data: body.expenses.map((item: Item) => ({ id: String(item.id), tripId: id, description: String(item.description), amount: Number(item.amount), category: String(item.category), paidBy: String(item.paidBy), date: new Date(String(item.date)), sharedWith: item.sharedWith ? JSON.stringify(item.sharedWith) : null, kind: String(item.kind || "expense"), recipient: item.recipient ? String(item.recipient) : null })) }); }
    if (body.participants) { await tx.participant.deleteMany({ where: { tripId: id } }); await tx.participant.createMany({ data: body.participants.map((item: Item) => ({ id: String(item.id), tripId: id, name: String(item.name), email: String(item.email), role: String(item.role || "participant"), status: String(item.status || "pending") })) }); }
  });
  const change = body.activities ? { type: "itinerary", title: "Itinerario aggiornato", message: `${user.name} ha modificato l’itinerario.`, link: `/trips/${id}` } : body.bookings ? { type: "booking", title: "Prenotazioni aggiornate", message: `${user.name} ha modificato le prenotazioni.`, link: `/trips/${id}/bookings` } : body.documents ? { type: "document", title: "Documenti aggiornati", message: `${user.name} ha modificato i documenti.`, link: `/trips/${id}/documents` } : body.expenses ? { type: "expense", title: "Spese aggiornate", message: `${user.name} ha modificato le spese.`, link: `/trips/${id}/expenses` } : body.participants ? { type: "participants", title: "Gruppo aggiornato", message: `${user.name} ha modificato i partecipanti.`, link: `/trips/${id}/participants` } : null;
  if (change) await notifyTripMembers(id, user.id, change);
  return NextResponse.json({ synchronized: true });
}
