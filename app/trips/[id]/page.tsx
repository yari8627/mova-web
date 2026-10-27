"use client";

import { ItineraryPlacePhoto } from "../../components/itinerary-place-photo";
import { useTripUserId } from "../../components/trip-session";
import { TripHeader } from "../../components/trip-header";
import { applyActivityPlace, editActivityPlace, prepareActivityDraft, restoreActivityMetadata, activityRoute, latestActivityRequest, type TitleSource } from "../../../lib/itinerary-activity";
import styles from "./itinerary.module.css";
import { sortActivities, numberActivities, moveActivity } from "../../../lib/activity-order";
import { useTripPaneActive } from "../../components/trip-pane-path";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { Country } from "country-state-city";
import { CalendarDays, Check, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, ExternalLink, GripVertical, MapPin, MapPinned, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { TripTabs } from "../../components/trip-tabs";
import { TripCover } from "../../components/trip-cover";
import { syncTripResource, syncActivityCompletion } from "../../../lib/trip-sync";
import { useTripPermissions } from "../../../lib/use-trip-permissions";
import { useAutocompleteKeyboard } from "../../../lib/use-autocomplete-keyboard";
import { fetchTripSnapshot, readTripSnapshot } from "../../../lib/trip-client-cache";

type Trip = { id: string; name: string; country: string; countryCode: string; city: string; startDate: string; endDate: string; people: number; theme: "blue" | "teal" | "sand" | "sakura" };
type Activity = { placeId?: string; titleSource?: TitleSource; sortOrder?: number; id: string; day: number; title: string; place: string; placeAddress?: string; latitude?: number; longitude?: number; photoName?: string; photoUrl?: string; photoAttribution?: string; photoAttributionUri?: string; time: string; done: boolean; bookingId?: string | null; bookingEvent?: "start" | "end" | null };
type PlaceResult = { id: string; placeId?: string; provider?: "google" | "openstreetmap"; name: string; address: string; latitude?: number; longitude?: number; type: string; photoName?: string; photoUrl?: string; photoAttribution?: string; photoAttributionUri?: string };
type WeatherDay = { date: string; code: number };

const starterActivities: Activity[] = [
  { id: "arrival", day: 1, title: "Arrivo e primo orientamento", place: "Centro città", time: "15:30", done: true },
  { id: "districts", day: 2, title: "Quartieri iconici e cucina locale", place: "Mercato centrale", time: "09:00", done: false },
  { id: "excursion", day: 3, title: "Escursione fuori città", place: "Punto di incontro", time: "08:15", done: false },
];

const emptyActivity: Omit<Activity, "id" | "done"> = { day: 1, title: "", place: "", time: "" };

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

function WeatherIcon({ code }: { code: number }) {
  const weather = [
    { codes: [0, 1], icon: Sun, label: "Sereno" },
    { codes: [2], icon: CloudSun, label: "Parzialmente nuvoloso" },
    { codes: [3], icon: Cloud, label: "Nuvoloso" },
    { codes: [45, 48], icon: CloudFog, label: "Nebbia" },
    { codes: [51, 53, 55, 56, 57], icon: CloudDrizzle, label: "Pioviggine" },
    { codes: [61, 63, 65, 66, 67, 80, 81, 82], icon: CloudRain, label: "Pioggia" },
    { codes: [71, 73, 75, 77, 85, 86], icon: CloudSnow, label: "Neve" },
    { codes: [95, 96, 99], icon: CloudLightning, label: "Temporale" },
  ].find(item => item.codes.includes(code));
  const Icon = weather?.icon;
  const label = weather?.label ?? "Previsioni non disponibili";
  return <span className="itinerary-weather-icon" role="img" aria-label={label} title={label}>{Icon ? <Icon size={22} aria-hidden="true" /> : <span aria-hidden="true">—</span>}</span>;
}

export default function TripPage() {
  const paneActive = useTripPaneActive();
  const userId = useTripUserId();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { canEditItinerary, canInvite } = useTripPermissions(id);
  const [trip, setTrip] = useState<Trip | null>(null);
  const savingActivity = useRef(false);
  const searchRequests = useRef(latestActivityRequest());
  const selectionRequests = useRef(latestActivityRequest());
  const [placeSelecting, setPlaceSelecting] = useState(false);
  const [routeMessage, setRouteMessage] = useState<{ day: number; text: string } | null>(null);
  const [activitySaving, setActivitySaving] = useState(false);
  const [activityError, setActivityError] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const activitiesRef = useRef<Activity[]>([]);
  const pendingCompletions = useRef(new Map<string, { done: boolean; promise: Promise<boolean> }>());
  const [completionSaving, setCompletionSaving] = useState<Set<string>>(() => new Set());
  const updateActivities = useCallback((value: Activity[] | ((current: Activity[]) => Activity[])) => {
    const next = typeof value === "function" ? value(activitiesRef.current) : value;
    activitiesRef.current = next;
    setActivities(next);
  }, []);
  function applyIncomingActivities(incoming: Activity[]) {
    updateActivities(incoming.map(item => pendingCompletions.current.has(item.id) ? { ...item, done: pendingCompletions.current.get(item.id)!.done } : item));
  }
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
  const [weatherDays, setWeatherDays] = useState<WeatherDay[]>([]);
  const [placeSessionToken, setPlaceSessionToken] = useState(() => crypto.randomUUID());
  const autoScrolledTrip = useRef<string | null>(null);
  const itineraryDaysRef = useRef<HTMLDivElement | null>(null);

  const countryIsoCode = useMemo(() => {
    if (!trip) return null;
    const names = new Intl.DisplayNames(["it"], { type: "region" });
    return Country.getAllCountries().find((country) => country.name.toLocaleLowerCase() === trip.country.toLocaleLowerCase() || names.of(country.isoCode)?.toLocaleLowerCase() === trip.country.toLocaleLowerCase())?.isoCode ?? null;
  }, [trip]);
  const placeKeyboard = useAutocompleteKeyboard({ itemCount: placeMatches.length, isOpen: placeSearchOpen, resetKey: draft.place, onOpen: () => setPlaceSearchOpen(true), onClose: () => setPlaceSearchOpen(false), onSelect: selectPlace });

  function closeEditor() {
    if (savingActivity.current) return;
    selectionRequests.current.cancel();
    setPlaceSelecting(false);
    setShowEditor(false);
  }

  async function selectPlace(index: number) {
    let place = placeMatches[index];
    if (!place) return;
    searchRequests.current.cancel();
    const request = selectionRequests.current.begin();
    setPlaceSearchOpen(false); setPlaceSelecting(true); setActivityError("");
    try {
      if (place.provider === "google" && place.placeId) {
        const response = await fetch('/api/places?placeId=' + encodeURIComponent(place.placeId) + '&sessionToken=' + encodeURIComponent(placeSessionToken) + '&detail=location', { signal: request.signal });
        if (!response.ok) throw new Error();
        const details = await response.json() as PlaceResult | null;
        if (!details?.name) throw new Error();
        place = details;
      }
      if (!request.isCurrent()) return;
      setDraft(current => request.isCurrent() ? applyActivityPlace(current, place) : current);
      setEditorStep(2);
    } catch {
      if (request.isCurrent()) setActivityError("Luogo non caricato. Riprova a selezionarlo.");
    } finally { if (request.isCurrent()) setPlaceSelecting(false); }
  }

  useEffect(() => {
    const query = draft.place.trim();
    if (!paneActive || !showEditor || editorStep !== 1 || !placeSearchOpen || query.length < 3) { searchRequests.current.cancel(); setPlaceMatches([]); setPlaceSearching(false); return; }
    const request = searchRequests.current.begin();
    const timer = window.setTimeout(async () => {
      setPlaceSearching(true);
      try {
        const response = await fetch('/api/places?q=' + encodeURIComponent(query) + '&countryCode=' + encodeURIComponent(countryIsoCode || "") + '&sessionToken=' + encodeURIComponent(placeSessionToken), { signal: request.signal });
        if (!response.ok) throw new Error();
        const matches = await response.json() as PlaceResult[];
        if (request.isCurrent()) setPlaceMatches(matches);
      } catch { if (request.isCurrent()) setPlaceMatches([]); }
      finally { if (request.isCurrent()) setPlaceSearching(false); }
    }, 300);
    return () => { window.clearTimeout(timer); searchRequests.current.cancel(); };
  }, [countryIsoCode, draft.place, placeSessionToken, showEditor, placeSearchOpen, editorStep, paneActive]);

  useEffect(() => () => selectionRequests.current.cancel(), []);
  useEffect(() => { if (!paneActive) { selectionRequests.current.cancel(); setPlaceSelecting(false); } }, [paneActive]);

  useEffect(() => {
    const stored = window.localStorage.getItem("mova-trips");
    const trips = stored ? (JSON.parse(stored) as Trip[]) : [];
    const savedActivities = window.localStorage.getItem(`mova-itinerary-${id}`);
    const fallbackTrip = trips.find((item) => item.id === id) ?? null;
    const cachedTrip = readTripSnapshot(id) as Trip | null;
    setTrip(cachedTrip ? { ...cachedTrip, startDate: cachedTrip.startDate.slice(0, 10), endDate: cachedTrip.endDate.slice(0, 10) } : fallbackTrip);
    const snapshot = readTripSnapshot(id);
    applyIncomingActivities(snapshot ? sortActivities(snapshot.activities) : savedActivities ? sortActivities(JSON.parse(savedActivities)) : []);
    async function load() { const remote = await fetchTripSnapshot(id); if (remote) { const cached = savedActivities ? JSON.parse(savedActivities) as Activity[] : []; const metadataById = new Map(cached.map(item => [item.id, item])); const mergedActivities = remote.activities.map((item: Activity) => restoreActivityMetadata(item, metadataById.get(item.id))); setTrip({ ...remote, startDate: remote.startDate.slice(0, 10), endDate: remote.endDate.slice(0, 10) } as Trip); applyIncomingActivities(sortActivities(mergedActivities)); window.localStorage.setItem(`mova-itinerary-${id}`, JSON.stringify(mergedActivities)); } }
    void load();
  }, [id]);

  useEffect(() => {
    if (!trip?.country) return;
    const cacheKey = `mova-weather-${id}`;
    try {
      const cached = JSON.parse(window.localStorage.getItem(cacheKey) || "null") as { days?: WeatherDay[] } | null;
      if (cached?.days) setWeatherDays(cached.days);
    } catch { /* Cache opzionale. */ }
    const query = new URLSearchParams({ country: trip.country, city: trip.city || "", start: trip.startDate, end: trip.endDate });
    fetch(`/api/weather?${query}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result: { days?: WeatherDay[] } | null) => {
        if (!result) return;
        const next = result.days || [];
        setWeatherDays(next);
        try { window.localStorage.setItem(cacheKey, JSON.stringify({ days: next, savedAt: Date.now() })); } catch { /* Cache opzionale. */ }
      })
      .catch(() => undefined);
  }, [id, trip]);

  useEffect(() => {
    if (!paneActive || !trip || autoScrolledTrip.current === trip.id) return;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    const start = new Date(`${trip.startDate}T12:00:00`);
    const end = new Date(`${trip.endDate}T12:00:00`);
    if (today < start || today > end) return;
    const currentDay = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
    autoScrolledTrip.current = trip.id;
    const timer = window.setTimeout(() => document.getElementById(`itinerary-day-${currentDay}`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" }), 250);
    return () => window.clearTimeout(timer);
  }, [trip, paneActive]);

  useEffect(() => {
    const container = itineraryDaysRef.current;
    if (!paneActive || !trip || !container) return;
    const elements = Array.from(container.querySelectorAll<HTMLElement>(".itinerary-day"));
    // Horizontal visibility is independent of activity count/section height.
    // Tap, swipe and interrupted smooth scrolls all use the same actual position.
    let visibleDay: number | undefined;
    const updateVisibleDay = (synchronous: boolean) => {
      if (!container.clientWidth || !elements.length) return;
      const left = container.getBoundingClientRect().left;
      const visible = elements.reduce((nearest, element) =>
        Math.abs(element.getBoundingClientRect().left - left) < Math.abs(nearest.getBoundingClientRect().left - left) ? element : nearest);
      const day = Number(visible.id.replace("itinerary-day-", ""));
      if (day === visibleDay) return;
      visibleDay = day;
      const select = () => setActiveDay(day);
      // Native scroll events must update the highlight before the next paint.
      if (synchronous) flushSync(select);
      else select();
    };
    const onScroll = () => updateVisibleDay(true);
    updateVisibleDay(false);
    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [trip, activities.length, paneActive]);

  function toggleActivity(activityId: string): Promise<boolean> {
    if (!canEditItinerary || savingActivity.current || pendingCompletions.current.has(activityId)) return Promise.resolve(false);
    const activity = activitiesRef.current.find(item => item.id === activityId);
    if (!activity) return Promise.resolve(false);
    const done = !activity.done;
    const job = { done, promise: Promise.resolve(false) };
    pendingCompletions.current.set(activityId, job);
    setCompletionSaving(new Set(pendingCompletions.current.keys()));
    setActivityError("");
    updateActivities(current => current.map(item => item.id === activityId ? { ...item, done } : item));
    job.promise = (async () => {
      try {
        if (!await syncActivityCompletion(id, activityId, done)) throw new Error();
        return true;
      } catch {
        updateActivities(current => current.map(item => item.id === activityId ? { ...item, done: activity.done } : item));
        setActivityError("Stato non salvato. Controlla la connessione e riprova.");
        return false;
      } finally {
        pendingCompletions.current.delete(activityId);
        setCompletionSaving(new Set(pendingCompletions.current.keys()));
        // Store only settled states; never serialize another pending optimistic toggle.
        if (!pendingCompletions.current.size) {
          try { window.localStorage.setItem('mova-itinerary-' + id, JSON.stringify(activitiesRef.current)); } catch { /* Server remains authoritative. */ }
          window.dispatchEvent(new CustomEvent("mova-itinerary-updated", { detail: { tripId: id } }));
        }
      }
    })();
    return job.promise;
  }

  async function persist(next: Activity[]) {
    if (!canEditItinerary || savingActivity.current) return false;
    savingActivity.current = true;
    setActivitySaving(true);
    setActivityError("");
    try {
      // Whole-list writes must not overwrite a pending completion or its rollback.
      await Promise.all([...pendingCompletions.current.values()].map(job => job.promise));
      const current = new Map(activitiesRef.current.map(item => [item.id, item]));
      const ordered = numberActivities(next.map(item => current.has(item.id) ? { ...item, done: current.get(item.id)!.done } : item));
      if (!await syncTripResource(id, "activities", ordered, trip || undefined)) throw new Error();
      updateActivities(ordered);
      try { window.localStorage.setItem('mova-itinerary-' + id, JSON.stringify(ordered)); } catch { /* Server save is authoritative even if storage is full. */ }
      window.dispatchEvent(new CustomEvent("mova-itinerary-updated", { detail: { tripId: id } }));
      return true;
    } catch {
      setActivityError("Modifica non salvata. Controlla la connessione e riprova.");
      return false;
    } finally {
      savingActivity.current = false;
      setActivitySaving(false);
    }
  }

  function openNew(day?: number) {
    if (savingActivity.current) return;
    selectionRequests.current.cancel(); setPlaceSelecting(false); setActivityError("");
    setEditingId(null);
    const availableDays = trip ? tripDays(trip.startDate, trip.endDate) : [{ day: 1, date: new Date() }];
    const firstEmptyDay = availableDays.find((item) => !activities.some((activity) => activity.day === item.day))?.day;
    setDraft({ ...emptyActivity, day: day ?? firstEmptyDay ?? availableDays[0].day });
    setPlaceSessionToken(crypto.randomUUID());
    setEditorStep(1);
    setShowEditor(true);
  }

  function openEdit(activity: Activity) {
    if (savingActivity.current) return;
    selectionRequests.current.cancel(); setPlaceSelecting(false); setActivityError("");
    setEditingId(activity.id);
    setDraft({ day: activity.day, title: activity.title, place: activity.place, placeId: activity.placeId, placeAddress: activity.placeAddress, latitude: activity.latitude, longitude: activity.longitude, photoName: activity.photoName, photoUrl: activity.photoUrl, photoAttribution: activity.photoAttribution, photoAttributionUri: activity.photoAttributionUri, time: activity.time, titleSource: activity.titleSource });
    setEditorStep(2);
    setShowEditor(true);
  }

  async function saveActivity() {
    if (savingActivity.current || placeSelecting) return;
    let prepared: typeof draft;
    try { prepared = prepareActivityDraft(draft); } catch (error) { setActivityError((error as Error).message); return; }
    const next = editingId
      ? activities.map((item) => item.id === editingId ? { ...item, ...prepared } : item)
      : [...activities, { id: `${Date.now()}`, ...prepared, done: false }];
    if (await persist(next)) setShowEditor(false);
  }

  function dropActivity(day: number, beforeId?: string) {
    if (!draggedId) return;
    void persist(moveActivity(activities, draggedId, day, beforeId));
    setDraggedId(null);
    setDropTarget(null);
  }

  const days = useMemo(() => trip ? tripDays(trip.startDate, trip.endDate) : [], [trip?.startDate, trip?.endDate]);
  const activitiesByDay = useMemo(() => {
    const result = new Map<number, Activity[]>();
    for (const activity of activities) { const items = result.get(activity.day) || []; items.push(activity); result.set(activity.day, items); }
    return result;
  }, [activities]);

  if (!trip) return <main className="detail-loading">Caricamento del viaggio…</main>;


  function scrollToDay(day: number) {
    document.getElementById(`itinerary-day-${day}`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }

  function openDayRoute(dayActivities: Activity[]) {
    const result = activityRoute(dayActivities);
    setRouteMessage(result.message ? { day: dayActivities[0]?.day ?? activeDay, text: result.message } : null);
    if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return <main className={`trip-detail-shell ${styles.itinerary}`}>
    <TripHeader tripId={id} />

    <TripCover tripId={id} />
    <div className="trip-swipe-body">
    <TripTabs tripId={id} />
    {activityError && !showEditor && <p className="auth-error" role="alert">{activityError}</p>}

    <div className="detail-grid itinerary-only-grid">
      <section className="itinerary-panel">
        <div className="panel-heading"><div><p className="section-kicker">PROGRAMMA</p><h2 className="trip-section-title">Itinerario</h2></div>{canEditItinerary && <button className="primary-button" onClick={() => openNew()}><Plus size={18} /> Aggiungi attività</button>}</div>
        <p className="itinerary-range">{days.length} {days.length === 1 ? "giorno" : "giorni"}, dal {formatDate(trip.startDate)} al {formatDate(trip.endDate)}</p>
        <nav className="itinerary-day-nav" aria-label="Giorni del viaggio">{days.map(({ day, date }) => { const weather = weatherDays.find((item) => item.date === date.toISOString().slice(0, 10)); return <button key={day} className={activeDay === day ? "active" : undefined} aria-pressed={activeDay === day} aria-controls={`itinerary-day-${day}`} onClick={() => scrollToDay(day)}><small>{new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(date)}</small><strong>{date.getDate()}</strong>{weather && <WeatherIcon code={weather.code} />}</button>; })}</nav>
        <div className="itinerary-days" ref={itineraryDaysRef}>{days.map(({ day, date }) => { const dayActivities = activitiesByDay.get(day) || []; return <section className="itinerary-day" id={`itinerary-day-${day}`} key={day}>
          <header className="itinerary-day-heading"><div><strong>Giorno {day}</strong><span>{formatDay(date)}</span>{dayActivities[0]?.place && <small><MapPin size={13} /> {dayActivities[0].place}</small>}</div>{canEditItinerary && <button onClick={() => openNew(day)}><Plus size={16} /> Aggiungi</button>}</header>
          {dayActivities.length === 0 ? <div className={`empty-itinerary-day drop-zone ${dropTarget === `day-${day}` ? "drag-over" : ""}`} onDragOver={(event) => { event.preventDefault(); setDropTarget(`day-${day}`); }} onDrop={() => dropActivity(day)}><CalendarDays size={19} /><span>{draggedId ? "Rilascia qui l’attività" : "Nessuna attività programmata"}</span></div> : <div className="timeline">{dayActivities.map((item) => { return <div key={item.id} className={styles.timelineEntry}>
          <div className={`activity-drop-line ${dropTarget === `before-${item.id}` ? "drag-over" : ""}`} onDragOver={(event) => { event.preventDefault(); setDropTarget(`before-${item.id}`); }} onDrop={() => dropActivity(day, item.id)}><span>Rilascia qui</span></div>
          <article className={`timeline-item ${draggedId === item.id ? "dragging" : ""}`} draggable={canEditItinerary && !activitySaving} onDragStart={(event) => { setDraggedId(item.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }} onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}>
            <div className={styles.activityTime}>{item.time && <time>{item.time}</time>}<button className={`activity-check ${item.done ? "done" : ""}`} disabled={!canEditItinerary || activitySaving || completionSaving.has(item.id)} onClick={() => toggleActivity(item.id)} aria-label={item.done ? "Segna da completare" : "Segna come completata"}>{item.done && <Check size={15} />}</button></div>
            <div className="timeline-card">
              <div className={`timeline-card-content ${item.place ? "has-photo" : ""}`}>
                {item.place && <ItineraryPlacePhoto target={item} country={trip.country} countryCode={countryIsoCode || ""} userId={userId} active={paneActive} />}
                <div className="timeline-card-main">
                  <div className="timeline-card-heading">
                    <div className="timeline-card-title"><div>{item.bookingId && <button className="booking-link-chip" onClick={() => router.push(`/trips/${id}/bookings?booking=${encodeURIComponent(item.bookingId!)}`)}>Prenotazione sincronizzata</button>}<h3>{item.title}</h3></div></div>
                  </div>
                  <div className="activity-meta"><span><MapPin size={16} /> {item.placeAddress || item.place}</span></div>

                </div>
              </div>
                  {canEditItinerary && <div className="activity-actions activity-actions-below"><span className="drag-handle" title="Trascina per spostare" aria-label="Trascina per spostare"><GripVertical size={18} /></span><button disabled={activitySaving} onClick={() => openEdit(item)} aria-label="Modifica attività"><Pencil size={16} /></button><button disabled={activitySaving} onClick={() => persist(activities.filter((activity) => activity.id !== item.id))} aria-label="Elimina attività"><Trash2 size={16} /></button></div>}
            </div>
          </article>
        </div>; })}<div className={`activity-drop-line activity-drop-line-last ${dropTarget === `end-${day}` ? "drag-over" : ""}`} onDragOver={(event) => { event.preventDefault(); setDropTarget(`end-${day}`); }} onDrop={() => dropActivity(day)}><span>Rilascia qui</span></div><div className="day-route-action"><button type="button" onClick={() => openDayRoute(dayActivities)}><MapPinned size={20} /><span><strong>Crea percorso</strong><small>Apri le tappe della giornata in Google Maps</small></span><ExternalLink size={16} /></button></div>{routeMessage?.day === day && <p className={styles.routeMessage} role="status">{routeMessage.text}</p>}</div>}
        </section>; })}</div>
      </section>

    </div>

    {showEditor && <div className="modal-backdrop activity-backdrop" onMouseDown={closeEditor}><div className="modal activity-modal" role="dialog" aria-modal="true" aria-labelledby="activity-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="activity-sheet-handle" />
      <div className="modal-header"><div><p className="section-kicker">{editingId ? "ITINERARIO" : `PASSO ${editorStep} DI 2`}</p><h2 id="activity-title">{editingId ? "Modifica attività" : editorStep === 1 ? "Dove vuoi andare?" : "Quando?"}</h2></div><button className="icon-button" onClick={closeEditor} aria-label="Chiudi"><X size={20} /></button></div>
      <form className="trip-form" aria-busy={activitySaving || placeSelecting} onSubmit={(event) => { event.preventDefault(); if (editorStep === 1) { if (draft.place.trim() && !placeSelecting) setEditorStep(2); } else { saveActivity(); } }}>
        <fieldset className={styles.editorFields} disabled={activitySaving}>
        {editorStep === 1 ? <>
          {activityError && <p className="auth-error" role="alert">{activityError}</p>}
          {placeSelecting && <span role="status">Caricamento luogo…</span>}
          <label className="autocomplete-field activity-place-first">Cerca un luogo<input value={draft.place} onFocus={() => { if (draft.place.trim().length >= 3) setPlaceSearchOpen(true); }} onChange={(event) => { selectionRequests.current.cancel(); searchRequests.current.cancel(); setPlaceSelecting(false); setPlaceMatches([]); setDraft(current => editActivityPlace(current, event.target.value)); setPlaceSearchOpen(event.target.value.trim().length >= 3); }} onKeyDown={placeKeyboard.onKeyDown} placeholder={`Ristorante, museo, attrazione o luogo in ${trip.country}`} autoComplete="off" role="combobox" aria-expanded={placeSearchOpen && placeMatches.length > 0} aria-controls="place-options" aria-activedescendant={placeKeyboard.activeIndex >= 0 ? `place-option-${placeKeyboard.activeIndex}` : undefined} required />{placeSearching && <span className="autocomplete-status">Ricerca luoghi…</span>}{placeSearchOpen && placeMatches.length > 0 && <div className="autocomplete-menu activity-place-menu" id="place-options" role="listbox">{placeMatches.map((place, index) => <button type="button" id={`place-option-${index}`} role="option" aria-selected={placeKeyboard.activeIndex === index} className={placeKeyboard.activeIndex === index ? "keyboard-active" : undefined} key={place.id} onMouseEnter={() => placeKeyboard.setActiveIndex(index)} onClick={() => selectPlace(index)}><MapPin size={17} /><span><strong>{place.name}</strong><small>{place.address || trip.country}</small></span></button>)}{placeMatches.some((place) => place.provider === "google") && <div className="google-attribution"><img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" /></div>}</div>}</label>
          <div className="activity-search-hint"><MapPin size={18} /><span>Cerca città, ristoranti, attrazioni, hotel e qualsiasi luogo disponibile sulla mappa.</span></div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeEditor}>Annulla</button><button type="button" className="primary-button" disabled={!draft.place.trim() || placeSelecting} onClick={() => setEditorStep(2)}>Continua</button></div>
        </> : <>
          <button type="button" className="selected-place-summary" onClick={() => { setPlaceSessionToken(crypto.randomUUID()); setEditorStep(1); }}><MapPin size={19} /><span><strong>{draft.place}</strong><small>{draft.placeAddress || "Tocca per cambiare luogo"}</small></span></button>
          {activityError && <p className="auth-error" role="alert">{activityError}</p>}<label>Nome attività (facoltativo)<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value, titleSource: event.target.value.trim() ? "custom" : "place" })} placeholder={draft.place || "Es. Visita al museo"} /></label>
          <div className="form-grid"><label>Giorno<select value={draft.day} onChange={(event) => setDraft({ ...draft, day: Number(event.target.value) })}>{days.map(({ day, date }) => { const now = new Date(); const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate(); return <option key={day} value={day}>Giorno {day} · {formatDay(date)}{isToday ? " · Oggi" : ""}</option>; })}</select></label><label>Orario (facoltativo)<input type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></label></div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => editingId ? closeEditor() : setEditorStep(1)}>{editingId ? "Annulla" : "Indietro"}</button><button type="submit" disabled={activitySaving} className="primary-button">{activitySaving ? "Salvataggio…" : "Salva attività"}</button></div>
        </>}
        </fieldset>
      </form>
    </div></div>}
  </div>
</main>;
}
