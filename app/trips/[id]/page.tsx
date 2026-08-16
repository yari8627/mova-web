"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Country } from "country-state-city";
import { CalendarDays, Check, Clock3, ExternalLink, GripVertical, MapPin, Navigation, Pencil, Plus, Trash2, Users, WalletCards, X } from "lucide-react";
import { TripTabs } from "../../components/trip-tabs";
import { useDestinationImage } from "../../components/use-destination-image";
import { syncTripResource, syncTripSnapshot } from "../../../lib/trip-sync";
import { useTripPermissions } from "../../../lib/use-trip-permissions";
import { useAutocompleteKeyboard } from "../../../lib/use-autocomplete-keyboard";

type Trip = { id: string; name: string; country: string; countryCode: string; city: string; startDate: string; endDate: string; people: number; theme: "blue" | "teal" | "sand" | "sakura" };
type Activity = { id: string; day: number; title: string; place: string; placeAddress?: string; latitude?: number; longitude?: number; photoName?: string; photoAttribution?: string; photoAttributionUri?: string; time: string; done: boolean; bookingId?: string | null; bookingEvent?: "start" | "end" | null };
type PlaceResult = { id: string; placeId?: string; provider?: "google" | "openstreetmap"; name: string; address: string; latitude?: number; longitude?: number; type: string; photoName?: string; photoAttribution?: string; photoAttributionUri?: string };

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

export default function TripPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { canManage, canInvite } = useTripPermissions(id);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [budget, setBudget] = useState<number | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editorStep, setEditorStep] = useState<1 | 2>(1);
  const [activeDay, setActiveDay] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyActivity);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false);
  const [placeMatches, setPlaceMatches] = useState<PlaceResult[]>([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [placeSessionToken, setPlaceSessionToken] = useState(() => crypto.randomUUID());
  const coverImage = useDestinationImage(trip?.country, trip?.city);
  const autoScrolledTrip = useRef<string | null>(null);
  const itineraryDaysRef = useRef<HTMLDivElement | null>(null);
  const photoLookups = useRef(new Set<string>());

  const countryIsoCode = useMemo(() => {
    if (!trip) return null;
    const names = new Intl.DisplayNames(["it"], { type: "region" });
    return Country.getAllCountries().find((country) => country.name.toLocaleLowerCase() === trip.country.toLocaleLowerCase() || names.of(country.isoCode)?.toLocaleLowerCase() === trip.country.toLocaleLowerCase())?.isoCode ?? null;
  }, [trip]);
  const placeKeyboard = useAutocompleteKeyboard({ itemCount: placeMatches.length, isOpen: placeSearchOpen, resetKey: draft.place, onOpen: () => setPlaceSearchOpen(true), onClose: () => setPlaceSearchOpen(false), onSelect: selectPlace });

  async function selectPlace(index: number) { let place = placeMatches[index]; if (!place) return; setPlaceSearchOpen(false); if (place.provider === "google" && place.placeId) { try { const response = await fetch(`/api/places?placeId=${encodeURIComponent(place.placeId)}&sessionToken=${encodeURIComponent(placeSessionToken)}`); if (response.ok) place = await response.json(); } catch { /* Mantiene il risultato selezionato. */ } } setDraft({ ...draft, title: draft.title || place.name, place: place.name, placeAddress: place.address, latitude: place.latitude, longitude: place.longitude, photoName: place.photoName, photoAttribution: place.photoAttribution, photoAttributionUri: place.photoAttributionUri }); setEditorStep(2); }

  useEffect(() => {
    const query = draft.place.trim();
    if (!showEditor || query.length < 3) { setPlaceMatches([]); setPlaceSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPlaceSearching(true);
      try { const response = await fetch(`/api/places?q=${encodeURIComponent(query)}&countryCode=${encodeURIComponent(countryIsoCode || "")}&sessionToken=${encodeURIComponent(placeSessionToken)}`, { signal: controller.signal }); if (response.ok) setPlaceMatches(await response.json()); }
      catch { if (!controller.signal.aborted) setPlaceMatches([]); }
      finally { if (!controller.signal.aborted) setPlaceSearching(false); }
    }, 500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [countryIsoCode, draft.place, placeSessionToken, showEditor]);

  useEffect(() => {
    if (!trip || !countryIsoCode) return;
    const activity = activities.find((item) => !item.photoName && item.place && !photoLookups.current.has(item.id));
    if (!activity || photoLookups.current.size >= 12) return;
    const targetActivity = activity;
    let cancelled = false;
    photoLookups.current.add(targetActivity.id);
    async function enrich() {
      try {
          const token = crypto.randomUUID();
          const query = [targetActivity.place, targetActivity.placeAddress, trip?.country].filter(Boolean).join(", ");
          const suggestionsResponse = await fetch(`/api/places?q=${encodeURIComponent(query)}&countryCode=${encodeURIComponent(countryIsoCode || "")}&sessionToken=${encodeURIComponent(token)}`);
          if (!suggestionsResponse.ok) return;
          const suggestions = await suggestionsResponse.json() as PlaceResult[];
          const match = suggestions.find((place) => place.provider === "google" && place.placeId);
          if (!match?.placeId) return;
          const detailsResponse = await fetch(`/api/places?placeId=${encodeURIComponent(match.placeId)}&sessionToken=${encodeURIComponent(token)}`);
          if (!detailsResponse.ok) return;
          const details = await detailsResponse.json() as PlaceResult;
          if (!details.photoName || cancelled) return;
          setActivities((current) => {
            const next = current.map((item) => item.id === targetActivity.id ? { ...item, photoName: details.photoName, photoAttribution: details.photoAttribution, photoAttributionUri: details.photoAttributionUri } : item);
            window.localStorage.setItem(`mova-itinerary-${id}`, JSON.stringify(next));
            return next;
          });
      } catch { /* La card mantiene il layout senza immagine. */ }
    }
    void enrich();
    return () => { cancelled = true; };
  }, [activities, countryIsoCode, id, trip]);

  useEffect(() => {
    const stored = window.localStorage.getItem("mova-trips");
    const trips = stored ? (JSON.parse(stored) as Trip[]) : [];
    const savedActivities = window.localStorage.getItem(`mova-itinerary-${id}`);
    const savedBudget = window.localStorage.getItem(`mova-budget-${id}`);
    const fallbackTrip = trips.find((item) => item.id === id) ?? null;
    async function load() { try { const response = await fetch(`/api/trips/${id}`); if (response.ok) { const remote = await response.json(); const cached = savedActivities ? JSON.parse(savedActivities) as Activity[] : []; const photoById = new Map(cached.filter((item) => item.photoName).map((item) => [item.id, item])); const mergedActivities = remote.activities.map((item: Activity) => photoById.has(item.id) ? { ...item, photoName: photoById.get(item.id)?.photoName, photoAttribution: photoById.get(item.id)?.photoAttribution, photoAttributionUri: photoById.get(item.id)?.photoAttributionUri } : item); setTrip({ ...remote, startDate: remote.startDate.slice(0, 10), endDate: remote.endDate.slice(0, 10) }); setActivities(sortActivities(mergedActivities)); setBudget(remote.budget); window.localStorage.setItem(`mova-itinerary-${id}`, JSON.stringify(mergedActivities)); return; } } catch { /* Cache offline. */ } setTrip(fallbackTrip); setActivities(savedActivities ? sortActivities(JSON.parse(savedActivities)) : []); setBudget(savedBudget ? Number(savedBudget) : null); }
    void load();
  }, [id]);

  useEffect(() => {
    if (!trip || autoScrolledTrip.current === trip.id) return;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    const start = new Date(`${trip.startDate}T12:00:00`);
    const end = new Date(`${trip.endDate}T12:00:00`);
    if (today < start || today > end) return;
    const currentDay = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
    setActiveDay(currentDay);
    autoScrolledTrip.current = trip.id;
    const timer = window.setTimeout(() => document.getElementById(`itinerary-day-${currentDay}`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" }), 250);
    return () => window.clearTimeout(timer);
  }, [trip]);

  useEffect(() => {
    if (!trip) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveDay(Number(visible.target.id.replace("itinerary-day-", "")));
    }, { root: itineraryDaysRef.current, threshold: [.55, .75] });
    const elements = document.querySelectorAll<HTMLElement>(".itinerary-day");
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [trip, activities.length]);

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
    setPlaceSessionToken(crypto.randomUUID());
    setEditorStep(1);
    setShowEditor(true);
  }

  function openEdit(activity: Activity) {
    setEditingId(activity.id);
    setDraft({ day: activity.day, title: activity.title, place: activity.place, placeAddress: activity.placeAddress, latitude: activity.latitude, longitude: activity.longitude, photoName: activity.photoName, photoAttribution: activity.photoAttribution, photoAttributionUri: activity.photoAttributionUri, time: activity.time });
    setEditorStep(2);
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

  function scrollToDay(day: number) {
    setActiveDay(day);
    document.getElementById(`itinerary-day-${day}`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }

  function openDayRoute(dayActivities: Activity[]) {
    const stops = sortActivities(dayActivities).map((activity) => Number.isFinite(activity.latitude) && Number.isFinite(activity.longitude) ? `${activity.latitude},${activity.longitude}` : [activity.place, activity.placeAddress].filter(Boolean).join(", "));
    if (!stops.length) return;
    if (stops.length === 1) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stops[0])}`, "_blank", "noopener,noreferrer");
      return;
    }
    const params = new URLSearchParams({ api: "1", origin: stops[0], destination: stops[stops.length - 1], travelmode: "walking" });
    if (stops.length > 2) params.set("waypoints", stops.slice(1, -1).join("|"));
    window.open(`https://www.google.com/maps/dir/?${params}`, "_blank", "noopener,noreferrer");
  }

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
        <nav className="itinerary-day-nav" aria-label="Giorni del viaggio">{days.map(({ day, date }) => <button key={day} className={activeDay === day ? "active" : undefined} onClick={() => scrollToDay(day)}><small>{new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(date)}</small><strong>{date.getDate()}</strong></button>)}</nav>
        <div className="itinerary-days" ref={itineraryDaysRef}>{days.map(({ day, date }) => { const dayActivities = activities.filter((activity) => activity.day === day); return <section className="itinerary-day" id={`itinerary-day-${day}`} key={day}>
          <header className="itinerary-day-heading"><div><strong>Giorno {day}</strong><span>{formatDay(date)}</span>{dayActivities[0]?.place && <small><MapPin size={13} /> {dayActivities[0].place}</small>}</div>{canManage && <button onClick={() => openNew(day)}><Plus size={16} /> Aggiungi</button>}</header>
          {dayActivities.length === 0 ? <div className={`empty-itinerary-day drop-zone ${dropTarget === `day-${day}` ? "drag-over" : ""}`} onDragOver={(event) => { event.preventDefault(); setDropTarget(`day-${day}`); }} onDrop={() => dropActivity(day)}><CalendarDays size={19} /><span>{draggedId ? "Rilascia qui l’attività" : "Nessuna attività programmata"}</span></div> : <div className="timeline">{dayActivities.map((item) => { return <div key={item.id}>
          <div className={`activity-drop-line ${dropTarget === `before-${item.id}` ? "drag-over" : ""}`} onDragOver={(event) => { event.preventDefault(); setDropTarget(`before-${item.id}`); }} onDrop={() => dropActivity(day, item.id)}><span>Rilascia qui</span></div>
          <article className={`timeline-item ${draggedId === item.id ? "dragging" : ""}`} draggable={canManage} onDragStart={(event) => { setDraggedId(item.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }} onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}>
            <div className="timeline-card">
              <div className="timeline-card-content">
                {item.photoName && <figure className="activity-place-photo"><img src={`/api/places/photo?name=${encodeURIComponent(item.photoName)}`} alt={item.place} loading="lazy" onError={(event) => { event.currentTarget.closest("figure")?.setAttribute("hidden", ""); }} />{item.photoAttribution && <figcaption>{item.photoAttributionUri ? <a href={item.photoAttributionUri} target="_blank" rel="noreferrer">{item.photoAttribution}</a> : item.photoAttribution}</figcaption>}</figure>}
                <div className="timeline-card-main">
                  <div className="timeline-card-heading">
                    <div className="timeline-card-title"><button className={`activity-check ${item.done ? "done" : ""}`} disabled={!canManage} onClick={() => persist(activities.map((activity) => activity.id === item.id ? { ...activity, done: !activity.done } : activity))} aria-label={item.done ? "Segna da completare" : "Segna come completata"}>{item.done && <Check size={15} />}</button><div>{item.bookingId && <button className="booking-link-chip" onClick={() => router.push(`/trips/${id}/bookings?booking=${encodeURIComponent(item.bookingId!)}`)}>Prenotazione sincronizzata</button>}<h3>{item.title}</h3></div></div>
                    {canManage && <div className="activity-actions"><span className="drag-handle" title="Trascina per spostare" aria-label="Trascina per spostare"><GripVertical size={18} /></span><button onClick={() => openEdit(item)} aria-label="Modifica attività"><Pencil size={16} /></button><button onClick={() => persist(activities.filter((activity) => activity.id !== item.id))} aria-label="Elimina attività"><Trash2 size={16} /></button></div>}
                  </div>
                  <div className="activity-meta"><span><MapPin size={16} /> {item.place}</span><span><Clock3 size={16} /> {item.time}</span></div>
                </div>
              </div>
            </div>
          </article>
        </div>; })}<div className={`activity-drop-line activity-drop-line-last ${dropTarget === `end-${day}` ? "drag-over" : ""}`} onDragOver={(event) => { event.preventDefault(); setDropTarget(`end-${day}`); }} onDrop={() => dropActivity(day)}><span>Rilascia qui</span></div><div className="day-route-action"><button type="button" onClick={() => openDayRoute(dayActivities)}><Navigation size={18} /><span><strong>Crea percorso</strong><small>Apri le tappe della giornata in Google Maps</small></span><ExternalLink size={16} /></button></div></div>}
        </section>; })}</div>
      </section>

      <aside className="detail-aside"><article className="quick-card"><p className="section-kicker">ORGANIZZAZIONE</p><h3>{activities.filter((item) => item.done).length} di {activities.length} completate</h3><div className="progress-track"><span style={{ width: `${activities.length ? activities.filter((item) => item.done).length / activities.length * 100 : 0}%` }} /></div><p className="aside-copy">Completa le attività principali prima della partenza.</p></article><article className="quick-card"><p className="section-kicker">BUDGET</p><div className="budget-row"><WalletCards size={24} /><div><strong>{budget === null ? "Non impostato" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(budget)}</strong><span>{budget === null ? "Puoi aggiungerlo nella sezione Spese" : "budget totale del viaggio"}</span></div></div></article></aside>
    </div>

    {showEditor && <div className="modal-backdrop activity-backdrop" onMouseDown={() => setShowEditor(false)}><div className="modal activity-modal" role="dialog" aria-modal="true" aria-labelledby="activity-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="activity-sheet-handle" />
      <div className="modal-header"><div><p className="section-kicker">{editingId ? "ITINERARIO" : `PASSO ${editorStep} DI 2`}</p><h2 id="activity-title">{editingId ? "Modifica attività" : editorStep === 1 ? "Dove vuoi andare?" : "Quando?"}</h2></div><button className="icon-button" onClick={() => setShowEditor(false)} aria-label="Chiudi"><X size={20} /></button></div>
      <form className="trip-form" onSubmit={(event) => { event.preventDefault(); saveActivity(); }}>
        {editorStep === 1 ? <>
          <label className="autocomplete-field activity-place-first">Cerca un luogo<input value={draft.place} onFocus={() => { if (draft.place.trim().length >= 3) setPlaceSearchOpen(true); }} onChange={(event) => { setDraft({ ...draft, place: event.target.value, placeAddress: undefined, latitude: undefined, longitude: undefined }); setPlaceSearchOpen(event.target.value.trim().length >= 3); }} onKeyDown={placeKeyboard.onKeyDown} placeholder={`Ristorante, museo, attrazione o luogo in ${trip.country}`} autoComplete="off" role="combobox" aria-expanded={placeSearchOpen && placeMatches.length > 0} aria-controls="place-options" aria-activedescendant={placeKeyboard.activeIndex >= 0 ? `place-option-${placeKeyboard.activeIndex}` : undefined} required autoFocus />{placeSearching && <span className="autocomplete-status">Ricerca luoghi…</span>}{placeSearchOpen && placeMatches.length > 0 && <div className="autocomplete-menu activity-place-menu" id="place-options" role="listbox">{placeMatches.map((place, index) => <button type="button" id={`place-option-${index}`} role="option" aria-selected={placeKeyboard.activeIndex === index} className={placeKeyboard.activeIndex === index ? "keyboard-active" : undefined} key={place.id} onMouseEnter={() => placeKeyboard.setActiveIndex(index)} onClick={() => selectPlace(index)}><MapPin size={17} /><span><strong>{place.name}</strong><small>{place.address || trip.country}</small></span></button>)}{placeMatches.some((place) => place.provider === "google") && <div className="google-attribution"><img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" /></div>}</div>}</label>
          <div className="activity-search-hint"><MapPin size={18} /><span>Cerca città, ristoranti, attrazioni, hotel e qualsiasi luogo disponibile sulla mappa.</span></div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowEditor(false)}>Annulla</button><button type="button" className="primary-button" disabled={!draft.place.trim()} onClick={() => setEditorStep(2)}>Continua</button></div>
        </> : <>
          <button type="button" className="selected-place-summary" onClick={() => { setPlaceSessionToken(crypto.randomUUID()); setEditorStep(1); }}><MapPin size={19} /><span><strong>{draft.place}</strong><small>{draft.placeAddress || "Tocca per cambiare luogo"}</small></span></button>
          <label>Nome attività<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Es. Visita al museo" required autoFocus /></label>
          <div className="form-grid"><label>Giorno<select value={draft.day} onChange={(event) => setDraft({ ...draft, day: Number(event.target.value) })}>{days.map(({ day, date }) => { const now = new Date(); const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate(); return <option key={day} value={day}>Giorno {day} · {formatDay(date)}{isToday ? " · Oggi" : ""}</option>; })}</select></label><label>Orario<input type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></label></div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => editingId ? setShowEditor(false) : setEditorStep(1)}>{editingId ? "Annulla" : "Indietro"}</button><button type="submit" className="primary-button">Salva attività</button></div>
        </>}
      </form>
    </div></div>}
  </main>;
}
