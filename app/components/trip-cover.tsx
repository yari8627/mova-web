"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Users } from "lucide-react";
import { useDestinationImage } from "./use-destination-image";

type Trip = {
  id: string;
  name: string;
  country: string;
  countryCode?: string;
  city?: string;
  startDate?: string;
  endDate?: string;
  people?: number;
  theme?: string;
};

function formatDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

export function TripCover({ tripId }: { tripId: string }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const image = useDestinationImage(trip?.country, trip?.city);

  useEffect(() => { async function load() { const saved = JSON.parse(localStorage.getItem("mova-trips") || "[]") as Trip[]; const fallback = saved.find((item) => item.id === tripId) || null; try { const response = await fetch(`/api/trips/${tripId}`); if (response.ok) { const remote = await response.json(); setTrip({ ...remote, startDate: remote.startDate.slice(0, 10), endDate: remote.endDate.slice(0, 10) }); return; } } catch { /* Usa la cache locale. */ } setTrip(fallback); } void load(); }, [tripId]);

  if (!trip) return null;
  const dateRange = [formatDate(trip.startDate), formatDate(trip.endDate)].filter(Boolean).join(" – ");

  return <section
    className={`shared-trip-cover theme-${trip.theme || "blue"}`}
    style={image ? { backgroundImage: `linear-gradient(90deg, rgba(5, 17, 47, .82), rgba(5, 17, 47, .18)), url(${image})` } : undefined}
  >
    <div>
      <p className="detail-eyebrow">{trip.countryCode} {trip.country}</p>
      <h1>{trip.name}</h1>
      <p>{trip.city || trip.country}</p>
      <div className="detail-meta">
        {dateRange && <span><CalendarDays size={18} /> {dateRange}</span>}
        {!!trip.people && <span><Users size={18} /> {trip.people} partecipanti</span>}
      </div>
    </div>
  </section>;
}
