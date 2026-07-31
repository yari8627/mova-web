"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Country } from "country-state-city";
import { CalendarDays, Check, Clock3, GripVertical, MapPin, Pencil, Plus, Trash2, Users, WalletCards, X } from "lucide-react";
import { TripTabs } from "../../components/trip-tabs";
import { DayActivityMap } from "../../components/day-activity-map";
import { useDestinationImage } from "../../components/use-destination-image";
import { syncTripResource, syncTripSnapshot } from "../../../lib/trip-sync";
import { useTripPermissions } from "../../../lib/use-trip-permissions";
import { useAutocompleteKeyboard } from "../../../lib/use-autocomplete-keyboard";

type Trip = { id: string; name: string; country: string; countryCode: string; city: string; startDate: string; endDate: string; people: number; theme: "blue" | "teal" | "sand" | "sakura" };
type Activity = { id: string; day: number; title: string; place: string; placeAddress?: string; latitude?: number; longitude?: number; time: string; done: boolean; bookingId?: string | null; bookingEvent?: "start" | "end" | null };
type PlaceResult = { id: string; name: string; address: string; latitude: number; longitude: number; type: string };

const fallbackTrips: Trip[] = [
  { id: "japan-2027", name: "Giappone 2027", country: "Giappone", countryCode: "🇯🇵", city: "Tokyo · Kyoto · Osaka", startDate: "2027-08-03", endDate: "2027-08-17", people: 3, theme: "sakura" },
  { id: "egypt-2027", name: "Egitto 2027", country: "Egitto", countryCode: "🇪🇬", city: "Il Cairo · Luxor", startDate: "2027-11-05", endDate: "2027-11-13", people: 2, theme: "sand" },
];

const starterActivities: Activity[] = [
  { id: "arrival", day: 1, title: "Arrivo e primo orientamento", place: "Centro città", time: "15:30", done: true },
  { id: "districts", day: 2, title: "Quartieri iconici e cucina locale", place: "Mercato centrale", time: "09:00", done: false },
  { id: "excursion", day: 3, title: "Escursione fuori città", place: "Punto di incontro", time: "08:15", done: false },
];

const emptyActivity: Omit<Activity, "id" | "done"> = { day: 1, title: "", place: "", time: "09:00" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function tripDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const total = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { day: index + 1, date };
  });
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

function sortActivities(items: Activity[]) {
  return [...items].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  const safe = Math.max(0, Math.min(1439, Math.round(value)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function destinationImage(country: string) {
  const images: Record<string, string> = {
    Thailandia: "/destinations/thailand.webp",
    Giappone: "/destinations/japan.webp",
    Egitto: "/destinations/egypt.webp",
    Italia: "/destinations/italy.webp",
  };
  return images[country];
}

export default function TripPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { canManage, canInvite } = useTripPermissions(id);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [activities, setActivities] = useState<Activity[]>(starterActivities);
  const [budget, setBudget] = useState<number | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyActivity);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false);
  const [placeMatches, setPlaceMatches] = useState<PlaceResult[]>([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [cityImages, setCityImages] = useState<Record<string, string>>({});
  const coverImage = useDestinationImage(trip?.country, trip?.city);
  const autoScrolledTrip = useRef<string | null>(null);

  const countryIsoCode = useMemo(() => {
    if (!trip) return null;
    const names = new Intl.DisplayNames(["it"], { type: "region" });
    return Country.getAllCountries().find((country) => country.name.toLocaleLowerCase() === trip.country.toLocaleLowerCase() || names.of(country.isoCode)?.toLocaleLowerCase() === trip.country.toLocaleLowerCase())?.isoCode ?? null;
  }, [trip]);
  const placeKeyboard = useAutocompleteKeyboard({ itemCount: placeMatches.length, isOpen: placeSearchOpen, resetKey: draft.place, onOpen: () => setPlaceSearchOpen(true), onClose: () => setPlaceSearchOpen(false), onSelect: selectPlace });

  function selectPlace(index: number) { const place = placeMatches[index]; if (!place) return; setDraft({ ...draft, place: place.name, placeAddress: place.address, latitude: place.latitude, longitude: place.longitude }); setPlaceSearchOpen(false); }

  useEffect(() => {
    const query = draft.place.trim();
    if (!showEditor || query.length < 2) { setPlaceMatches([]); setPlaceSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPlaceSearching(true);
      try { const response = await fetch(`/api/places?q=${encodeURIComponent(query)}&countryCode=${encodeURIComponent(countryIsoCode || "")}`, { signal: controller.signal }); if (response.ok) setPlaceMatches(await response.json()); }
      catch { if (!controller.signal.aborted) setPlaceMatches([]); }
      finally { if (!controller.signal.aborted) setPlaceSearching(false); }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [countryIsoCode, draft.place, showEditor]);

  useEffect(() => {
    const stored = window.localStorage.getItem("mova-trips");
    const trips = stored ? (JSON.parse(stored) as Trip[]) : fallbackTrips;
    const savedActivities = window.localStorage.getItem(`mova-itinerary-${id}`);
    const savedBudget = window.localStorage.getItem(`mova-budget-${id}`);
    const fallbackTrip = trips.find((item) => item.id === id) ?? fallbackTrips.find((item) => item.id === id) ?? null;
    async function load() { try { const response = await fetch(`/api/trips/${id}`); if (response.ok) { const remote = await response.json(); setTrip({ ...remote, startDate: remote.startDate.slice(0, 10), endDate: remote.endDate.slice(0, 10) }); setActivities(sortActivities(remote.activities)); setBudget(remote.budget); window.localStorage.setItem(`mova-itinerary-${id}`, JSON.stringify(remote.activities)); return; } } catch { /* Cache offline. */ } setTrip(fallbackTrip); setActivities(savedActivities ? sortActivities(JSON.parse(savedActivities)) : starterActivities); setBudget(savedBudget ? Number(savedBudget) : null); }
    void load();
  }, [id]);

  useEffect(() => {
    if (!trip) return;
    const cities = [...new Set(activities.map((activity) => activity.place.trim()).filter(Boolean))];
    const missing = cities.filter((city) => cityImages[city] === undefined);
    if (!missing.length) return;
    void Promise.all(missing.map(async (city) => {
      try {
        const response = await fetch(`/api/city-image?strategy=exact-v2&city=${encodeURIComponent(city)}&country=${encodeURIComponent(trip.country)}`);
        const result = await response.json();
        return [city, result.image || destinationImage(trip.country) || ""] as const;
      } catch { return [city, destinationImage(trip.country) || ""] as const; }
    })).then((entries) => setCityImages((current) => ({ ...current, ...Object.fromEntries(entries) })));
  }, [activities, cityImages, trip]);

  useEffect(() => {
    if (!trip || autoScrolledTrip.current === trip.id) return;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    const start = new Date(`${trip.startDate}T12:00:00`);
    const end = new Date(`${trip.endDate}T12:00:00`);
    if (today < start || today > end) return;
    const currentDay = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
    autoScrolledTrip.current = trip.id;
    const timer = window.setTimeout(() => document.getElementById(`itinerary-day-${currentDay}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    return () => window.clearTimeout(timer);
  }, [trip]);

  async function persist(next: Activity[]) {
    const ordered = sortActivities(next);
    setActivities(ordered);
    window.localStorage.setItem(`mova-itinerary-${id}`, JSON.stringify(ordered));
    await syncTripResource(id, "activities", ordered);
    window.dispatchEvent(new CustomEvent("mova-itinerary-updated", { detail: { tripId: id } }));
  }

  function openNew(day?: number) {
    setEditingId(null);
    const availableDays = trip ? tripDays(trip.startDate, trip.endDate) : [{ day: 1, date: new Date() }];
    const firstEmptyDay = availableDays.find((item) => !activities.some((activity) => activity.day === item.day))?.day;
    setDraft({ ...emptyActivity, day: day ?? firstEmptyDay ?? availableDays[0].day });
    setShowEditor(true);
  }

  function openEdit(activity: Activity) {
    setEditingId(activity.id);
    setDraft({ day: activity.day, title: activity.title, place: activity.place, placeAddress: activity.placeAddress, latitude: activity.latitude, longitude: activity.longitude, time: activity.time });
    setShowEditor(true);
  }

  async function saveActivity() {
    if (!draft.title.trim() || !draft.place.trim()) return;
    const next = editingId
      ? activities.map((item) => item.id === editingId ? { ...item, ...draft } : item)
      : [...activities, { id: `${Date.now()}`, ...draft, done: false }];
    await persist(next);
    setShowEditor(false);
  }

  function dropActivity(day: number, beforeId?: string) {
    if (!draggedId) return;
    const dragged = activities.find((item) => item.id === draggedId);
    if (!dragged) return;
    const destination = sortActivities(activities.filter((item) => item.id !== draggedId && item.day === day));
    const insertionIndex = beforeId ? Math.max(0, destination.findIndex((item) => item.id === beforeId)) : destination.length;
    const previous = destination[insertionIndex - 1];
    const following = destination[insertionIndex];
    let minutes = 9 * 60;
    if (previous && following) {
      const previousMinutes = timeToMinutes(previous.time);
      const followingMinutes = timeToMinutes(following.time);
      if (followingMinutes - previousMinutes <= 1) {
        const reordered = [...destination];
        reordered.splice(insertionIndex, 0, dragged);
        const firstTime = Math.min(timeToMinutes(reordered[0].time), 20 * 60);
        const normalized = new Map(reordered.map((item, index) => [item.id, minutesToTime(firstTime + index * 5)]));
        persist(activities.map((item) => item.id === draggedId ? { ...item, day, time: normalized.get(item.id)! } : normalized.has(item.id) ? { ...item, time: normalized.get(item.id)! } : item));
        setDraggedId(null);
        setDropTarget(null);
        return;
      }
      minutes = (previousMinutes + followingMinutes) / 2;
    } else if (following) minutes = timeToMinutes(following.time) - 1;
    else if (previous) minutes = timeToMinutes(previous.time) + 1;
    persist(activities.map((item) => item.id === draggedId ? { ...item, day, time: minutesToTime(minutes) } : item));
    setDraggedId(null);
    setDropTarget(null);
  }

  if (!trip) return <main className="detail-loading">Caricamento del viaggio…</main>;

  const days = tripDays(trip.startDate, trip.endDate);

  return <main className="trip-detail-shell">
    <header className="detail-topbar">
      <button className="detail-brand home-brand-button" onClick={() => router.push("/")} aria-label="Torna alla Home">mova</button>
      {canInvite && <button className="primary-button" onClick={() => router.push(`/trips/${id}/participants`)}><Users size={18} /> Invita</button>}
    </header>

    <section className={`detail-hero theme-${trip.theme}`} style={coverImage ? { backgroundImage: `linear-gradient(90deg, rgba(7,18,45,.78), rgba(7,18,45,.16)), url(${coverImage})` } : undefined}><div>
      <p className="detail-eyebrow">{trip.countryCode} {trip.country}</p><h1>{trip.name}</h1><p>{trip.city}</p>
      <div className="detail-meta"><span><CalendarDays size={18} /> {formatDate(trip.startDate)} – {formatDate(trip.endDate)}</span><span><Users size={18} /> {trip.people} partecipanti</span></div>
    </div></section>

    <TripTabs tripId={id} />

    <div className="detail-grid">
      <section className="itinerary-panel">
        <div className="panel-heading"><div><p className="section-kicker">PROGRAMMA</p><h2>Itinerario</h2><p className="itinerary-range">{days.length} {days.length === 1 ? "giorno" : "giorni"}, dal {formatDate(trip.startDate)} al {formatDate(trip.endDate)}</p></div>{canManage && <button className="primary-button" onClick={() => openNew()}><Plus size={18} /> Aggiungi attività</button>}</div>
        <div className="itinerary-days">{days.map(({ day, date }) => { const dayActivities = activities.filter((activity) => activity.day === day); return <section className="itinerary-day" id={`itinerary-day-${day}`} key={day}>
          <header className={`itinerary-day-heading ${dayActivities.length && cityImages[dayActivities[0].place] ? "has-city-image" : ""}`} style={dayActivities.length && cityImages[dayActivities[0].place] ? { backgroundImage: `linear-gradient(90deg, rgba(7,18,45,.88), rgba(7,18,45,.38)), url("${cityImages[dayActivities[0].place]}")` } : undefined}><div><strong>Giorno {day}</strong><span>{formatDay(date)}</span>{dayActivities[0]?.place && <small><MapPin size={13} /> {dayActivities[0].place}</small>}</div>{canManage && <button onClick={() => openNew(day)}><Plus size={16} /> Aggiungi</button>}</header>
          {dayActivities.length === 0 ? <div className={`empty-itinerary-day drop-zone ${dropTarget === `day-${day}` ? "drag-over" : ""}`} onDragOver={(event) => { event.preventDefault(); setDropTarget(`day-${day}`); }} onDrop={() => dropActivity(day)}><CalendarDays size={19} /><span>{draggedId ? "Rilascia qui l’attività" : "Nessuna attività programmata"}</span></div> : <div className="timeline">{dayActivities.map((item) => { return <div key={item.id}>
          <div className={`activity-drop-line ${dropTarget === `before-${item.id}` ? "drag-over" : ""}`} onDragOver={(event) => { event.preventDefault(); setDropTarget(`before-${item.id}`); }} onDrop={() => dropActivity(day, item.id)}><span>Rilascia qui</span></div>
          <article className={`timeline-item ${draggedId === item.id ? "dragging" : ""}`} draggable={canManage} onDragStart={(event) => { setDraggedId(item.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }} onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}>
          <button className={`timeline-dot ${item.done ? "done" : ""}`} disabled={!canManage} onClick={() => persist(activities.map((activity) => activity.id === item.id ? { ...activity, done: !activity.done } : activity))} aria-label={item.done ? "Segna da completare" : "Segna come completata"}>{item.done && <Check size={15} />}</button>
          <div className="timeline-card"><div className="timeline-card-heading"><div>{item.bookingId && <button className="booking-link-chip" onClick={() => router.push(`/trips/${id}/bookings?booking=${encodeURIComponent(item.bookingId!)}`)}>Prenotazione sincronizzata</button>}<h3>{item.title}</h3></div>{canManage && <div className="activity-actions">
            <span className="drag-handle" title="Trascina per spostare" aria-label="Trascina per spostare"><GripVertical size={18} /></span>
            <button onClick={() => openEdit(item)} aria-label="Modifica attività"><Pencil size={16} /></button>
            <button onClick={() => persist(activities.filter((activity) => activity.id !== item.id))} aria-label="Elimina attività"><Trash2 size={16} /></button>
          </div>}</div><div className="activity-meta"><span><MapPin size={16} /> {item.place}</span><span><Clock3 size={16} /> {item.time}</span></div></div>
        </article></div>; })}<div className={`activity-drop-line activity-drop-line-last ${dropTarget === `end-${day}` ? "drag-over" : ""}`} onDragOver={(event) => { event.preventDefault(); setDropTarget(`end-${day}`); }} onDrop={() => dropActivity(day)}><span>Rilascia qui</span></div></div>}
          {dayActivities.length > 0 && <DayActivityMap activities={dayActivities} countryCode={countryIsoCode} />}
        </section>; })}</div>
      </section>

      <aside className="detail-aside"><article className="quick-card"><p className="section-kicker">ORGANIZZAZIONE</p><h3>{activities.filter((item) => item.done).length} di {activities.length} completate</h3><div className="progress-track"><span style={{ width: `${activities.length ? activities.filter((item) => item.done).length / activities.length * 100 : 0}%` }} /></div><p className="aside-copy">Completa le attività principali prima della partenza.</p></article><article className="quick-card"><p className="section-kicker">BUDGET</p><div className="budget-row"><WalletCards size={24} /><div><strong>{budget === null ? "Non impostato" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(budget)}</strong><span>{budget === null ? "Puoi aggiungerlo nella sezione Spese" : "budget totale del viaggio"}</span></div></div></article></aside>
    </div>

    {showEditor && <div className="modal-backdrop" onMouseDown={() => setShowEditor(false)}><div className="modal activity-modal" role="dialog" aria-modal="true" aria-labelledby="activity-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-header"><div><p className="section-kicker">ITINERARIO</p><h2 id="activity-title">{editingId ? "Modifica attività" : "Nuova attività"}</h2></div><button className="icon-button" onClick={() => setShowEditor(false)} aria-label="Chiudi"><X size={20} /></button></div>
      <form className="trip-form" onSubmit={(event) => { event.preventDefault(); saveActivity(); }}>
        <label>Nome attività<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Es. Visita al museo" required autoFocus /></label>
        <div className="form-grid"><label>Giorno<select value={draft.day} onChange={(event) => setDraft({ ...draft, day: Number(event.target.value) })}>{days.map(({ day, date }) => { const now = new Date(); const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate(); return <option key={day} value={day}>Giorno {day} · {formatDay(date)}{isToday ? " · Oggi" : ""}</option>; })}</select></label><label>Orario<input type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></label></div>
        <label className="autocomplete-field">Luogo<input value={draft.place} onFocus={() => { if (draft.place.trim().length >= 2) setPlaceSearchOpen(true); }} onChange={(event) => { setDraft({ ...draft, place: event.target.value, placeAddress: undefined, latitude: undefined, longitude: undefined }); setPlaceSearchOpen(true); }} onKeyDown={placeKeyboard.onKeyDown} placeholder={`Cerca ristoranti, hotel, musei o indirizzi in ${trip.country}`} autoComplete="off" role="combobox" aria-expanded={placeSearchOpen && placeMatches.length > 0} aria-controls="place-options" aria-activedescendant={placeKeyboard.activeIndex >= 0 ? `place-option-${placeKeyboard.activeIndex}` : undefined} required />{placeSearching && <span className="autocomplete-status">Ricerca luoghi…</span>}{placeSearchOpen && placeMatches.length > 0 && <div className="autocomplete-menu activity-place-menu" id="place-options" role="listbox">{placeMatches.map((place, index) => <button type="button" id={`place-option-${index}`} role="option" aria-selected={placeKeyboard.activeIndex === index} className={placeKeyboard.activeIndex === index ? "keyboard-active" : undefined} key={place.id} onMouseEnter={() => placeKeyboard.setActiveIndex(index)} onClick={() => selectPlace(index)}><MapPin size={17} /><span><strong>{place.name}</strong><small>{place.address || trip.country}</small></span></button>)}</div>}</label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowEditor(false)}>Annulla</button><button type="submit" className="primary-button">Salva attività</button></div>
      </form>
    </div></div>}
  </main>;
}
