import type { Prisma } from "@prisma/client";
/** Shared projection: booking is the source of truth; caller owns the transaction and permission lock. */
export async function syncBookingActivities(tx: Prisma.TransactionClient, id: string, bookingItems: Record<string, unknown>[]) {
      const persistedTrip = await tx.trip.findUniqueOrThrow({ where: { id } });
      const tripStart = Date.parse(`${persistedTrip.startDate.toISOString().slice(0,10)}T00:00:00Z`);
      const lastActivity = await tx.activity.findFirst({ where: { tripId: id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
      let nextOrder = (lastActivity?.sortOrder ?? -1) + 1;
      for (const item of bookingItems) {
        const bookingId = String(item.id); const type = String(item.type || "activity"); const baseTitle = String(item.title || "Prenotazione");
        const eventTitle = (event: "start" | "end") => type === "hotel" ? `${event === "start" ? "Check-in" : "Check-out"} · ${baseTitle}` : type === "car" ? `${event === "start" ? "Ritiro" : "Riconsegna"} · ${baseTitle}` : type === "flight" || type === "train" ? `${event === "start" ? "Partenza" : "Arrivo"} · ${baseTitle}` : baseTitle;
        const eventPlace = (event: "start" | "end") => String(type === "flight" || type === "train" ? event === "start" ? item.originAirport || item.location || item.provider : item.destinationAirport || item.location || item.provider : item.location || item.provider || "Da definire");
        const sourceTimes=String(item.notes || "").match(/(?:Orari origine Gmail|Limiti orari origine Gmail \(non appuntamenti\)):\s*(\S+)(?: → (\S+))?/);
        const sourceTime=(value:unknown,source:string|undefined,event:string)=>{
          if(source && Date.parse(source)===Date.parse(String(value)))return source;
          const note=String(item.notes || "").split("\n").find(line=>line.startsWith(`Check-${event=== "start"?"in":"out"} ${item.provider}:`));
          const parts=note?.match(/(\d{2})\/(\d{2})\/(\d{4})[^\n]*?((?:[01]\d|2[0-3]):[0-5]\d)[^\n]*?([+-]\d{2}:\d{2}|Z)/);
          const civil=parts?`${parts[3]}-${parts[2]}-${parts[1]}T${parts[4]}${parts[5]}`:"";
          return civil && Date.parse(civil)===Date.parse(String(value))?civil:value instanceof Date?value.toISOString():String(value);
        };
        const events = [{ event: "start" as const, value: sourceTime(item.startDate,sourceTimes?.[1],"start") }, ...(item.endDate && type !== "activity" ? [{ event: "end" as const, value: sourceTime(item.endDate,sourceTimes?.[2],"end") }] : [])];
        const expectedIds = events.map((event) => `booking-${bookingId}-${event.event}`);
        await tx.activity.deleteMany({ where: { tripId: id, bookingId, id: { notIn: expectedIds } } });
        for (const event of events) {
          const eventDate = new Date(event.value); const calendarDate = Date.parse(`${event.value.slice(0,10)}T00:00:00Z`);
          const day = Math.max(1, Math.round((calendarDate - tripStart) / 86400000) + 1);
          const clock = event.value.match(/T(\d{2}:\d{2})/)?.[1] || eventDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
          const time = clock;
          const activityId = `booking-${bookingId}-${event.event}`;
          await tx.activity.upsert({ where: { id: activityId }, update: { day, title: eventTitle(event.event), place: eventPlace(event.event), time, bookingId, bookingEvent: event.event }, create: { sortOrder: nextOrder++, id: activityId, tripId: id, bookingId, bookingEvent: event.event, day, title: eventTitle(event.event), place: eventPlace(event.event), time, done: false } });
        }
      }
}
