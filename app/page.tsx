"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAutocompleteKeyboard } from "../lib/use-autocomplete-keyboard";
import { curatedDestinationImages, fetchDestinationImage } from "../lib/destination-images";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  Compass,
  Earth,
  Home,
  Map,
  Mail,
  Menu,
  Plane,
  Plus,
  Users,
  UserPlus,
  WalletCards,
  X,
} from "lucide-react";

type Trip = {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  city: string;
  startDate: string;
  endDate: string;
  people: number;
  theme: "blue" | "teal" | "sand" | "sakura";
  status: "planning" | "upcoming" | "active" | "past";
};

type TripDraft = {
  name: string;
  country: string;
  city: string;
  startDate: string;
  endDate: string;
  people: number;
};

type AppNotification = { id: string; type: string; title: string; message: string; link?: string | null; readAt?: string | null; createdAt: string };
type TravelCompanion = { name: string; email: string; trips: number };
type TripGuest = { name: string; email: string };
type SessionUser = { id: string; name: string; email: string; avatarUrl?: string | null };
type TripProgress = { flights: number; hotels: number; activities: number };
type CountryOption = { isoCode: string; name: string; displayName: string; flag: string };
type CityOption = { name: string; stateCode: string };

const emptyDraft: TripDraft = {
  name: "",
  country: "",
  city: "",
  startDate: "",
  endDate: "",
  people: 2,
};

const countryFlags: Record<string, string> = {
  Giappone: "🇯🇵",
  Egitto: "🇪🇬",
  Thailandia: "🇹🇭",
  Italia: "🇮🇹",
};

const navItems = [
  { label: "Home", icon: Home },
  { label: "Viaggi", icon: Plane },
  { label: "Progressi", icon: Earth },
  { label: "Profilo", icon: CircleUserRound },
];

function formatDate(value: string) {
  if (!value) return "Data da definire";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Data da definire";
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function daysUntil(value: string) {
  const today = new Date();
  const target = new Date(`${value}T12:00:00`);
  return Math.max(0, Math.ceil((target.getTime() - today.getTime()) / 86400000));
}

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function closestCurrentTrip(items: Trip[]) {
  const today = localDateKey();
  const current = items.filter((trip) => trip.endDate >= today);
  return [...current].sort((a, b) => {
    const aActive = a.startDate <= today && a.endDate >= today;
    const bActive = b.startDate <= today && b.endDate >= today;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return a.startDate.localeCompare(b.startDate);
  })[0];
}

function suggestedTripName(draft: TripDraft) {
  const destination = draft.country.trim() || draft.city.split("·")[0]?.trim() || "Viaggio";
  const year = draft.startDate.slice(0, 4) || String(new Date().getFullYear());
  return `${destination} ${year}`;
}

export default function Page() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [draft, setDraft] = useState<TripDraft>(emptyDraft);
  const [customTripName, setCustomTripName] = useState(false);
  const [frequentTravelers, setFrequentTravelers] = useState<TravelCompanion[]>([]);
  const [tripGuests, setTripGuests] = useState<TripGuest[]>([]);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestError, setGuestError] = useState("");
  const [tripImages, setTripImages] = useState<Record<string, string>>({});
  const [mobileMenu, setMobileMenu] = useState(false);
  const [countrySearchOpen, setCountrySearchOpen] = useState(false);
  const [citySearchOpen, setCitySearchOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryOption | null>(null);
  const [countryMatches, setCountryMatches] = useState<CountryOption[]>([]);
  const [cityMatches, setCityMatches] = useState<CityOption[]>([]);
  const [tripProgress, setTripProgress] = useState<TripProgress>({ flights: 0, hotels: 0, activities: 0 });

  useEffect(() => {
    async function loadAccountTrips() {
      try {
        const sessionResponse = await fetch("/api/auth/me", { cache: "no-store" });
        const session = await sessionResponse.json() as { user: SessionUser | null };
        if (!session.user) { router.replace("/auth"); return; }
        setCurrentUser(session.user);
        const response = await fetch("/api/trips", { cache: "no-store" });
        if (response.ok) {
          const accountTrips = (await response.json() as Array<Omit<Trip, "status"> & { startDate: string; endDate: string }>).map((trip) => ({ ...trip, startDate: trip.startDate.slice(0, 10), endDate: trip.endDate.slice(0, 10), status: "upcoming" as const }));
          setTrips(accountTrips);
        }
        const notificationResponse = await fetch("/api/notifications", { cache: "no-store" });
        if (notificationResponse.ok) { const result = await notificationResponse.json(); setNotifications(result.notifications); }
        setAuthReady(true);
      } catch {
        router.replace("/auth");
      }
    }
    void loadAccountTrips();
  }, [router]);

  async function openNotification(item: AppNotification) { if (!item.readAt) { await fetch(`/api/notifications/${item.id}`, { method: "PATCH" }); setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, readAt: new Date().toISOString() } : notification)); } setNotificationsOpen(false); if (item.link) router.push(item.link); }
  async function markAllNotificationsRead() { await fetch("/api/notifications", { method: "PATCH" }); setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() }))); }

  useEffect(() => { let active = true; const missing = trips.filter((trip) => !curatedDestinationImages[trip.country]); if (!missing.length) return; void Promise.all(missing.map(async (trip) => [trip.id, await fetchDestinationImage(trip.country, trip.city)] as const)).then((entries) => { if (active) setTripImages((current) => ({ ...current, ...Object.fromEntries(entries.filter(([, image]) => image)) })); }); return () => { active = false; }; }, [trips]);

  const inProgramTrips = useMemo(() => { const today = localDateKey(); return [...trips.filter((trip) => trip.endDate >= today)].sort((a, b) => a.startDate.localeCompare(b.startDate)); }, [trips]);
  const completedTrips = useMemo(() => { const today = localDateKey(); return [...trips.filter((trip) => trip.endDate < today)].sort((a, b) => b.endDate.localeCompare(a.endDate)); }, [trips]);
  const selectedTrip = useMemo(() => closestCurrentTrip(trips) ?? completedTrips[0], [trips, completedTrips]);
  useEffect(() => {
    if (!selectedTrip?.id) { setTripProgress({ flights: 0, hotels: 0, activities: 0 }); return; }
    let active = true;
    const percentage = (completed: number, total: number) => total ? Math.round(completed / total * 100) : 0;
    void fetch(`/api/trips/${selectedTrip.id}`, { cache: "no-store" }).then(async (response) => response.ok ? response.json() : null).then((trip) => {
      if (!active || !trip) return;
      const bookings = trip.bookings as Array<{ type: string; status: string }>;
      const activities = trip.activities as Array<{ done: boolean }>;
      const flights = bookings.filter((item) => item.type === "flight");
      const hotels = bookings.filter((item) => item.type === "hotel");
      const confirmed = (item: { status: string }) => item.status === "confirmed" || item.status === "completed";
      setTripProgress({ flights: percentage(flights.filter(confirmed).length, flights.length), hotels: percentage(hotels.filter(confirmed).length, hotels.length), activities: percentage(activities.filter((item) => item.done).length, activities.length) });
    }).catch(() => { if (active) setTripProgress({ flights: 0, hotels: 0, activities: 0 }); });
    return () => { active = false; };
  }, [selectedTrip?.id]);
  function imageForTrip(trip: Trip) { return curatedDestinationImages[trip.country] || tripImages[trip.id] || ""; }
  const firstName = currentUser?.name.trim().split(/\s+/)[0] || "Viaggiatore";
  const userInitials = currentUser?.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("it")).join("") || "MV";

  useEffect(() => {
    const query = draft.country.trim();
    if (!countrySearchOpen || !query) { setCountryMatches([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => fetch(`/api/destinations?kind=country&q=${encodeURIComponent(query)}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : []).then(setCountryMatches).catch(() => setCountryMatches([])), 160);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [draft.country, countrySearchOpen]);
  useEffect(() => {
    const query = draft.city.split("·").at(-1)?.trim() ?? "";
    if (!citySearchOpen || !selectedCountry || !query) { setCityMatches([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => fetch(`/api/destinations?kind=city&countryCode=${selectedCountry.isoCode}&q=${encodeURIComponent(query)}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : []).then(setCityMatches).catch(() => setCityMatches([])), 160);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [draft.city, citySearchOpen, selectedCountry]);
  const countryKeyboard = useAutocompleteKeyboard({ itemCount: countryMatches.length, isOpen: countrySearchOpen, resetKey: draft.country, onOpen: () => setCountrySearchOpen(true), onClose: () => setCountrySearchOpen(false), onSelect: selectCountry });
  const cityKeyboard = useAutocompleteKeyboard({ itemCount: cityMatches.length, isOpen: citySearchOpen, resetKey: draft.city, onOpen: () => setCitySearchOpen(true), onClose: () => setCitySearchOpen(false), onSelect: selectCity });

  useEffect(() => { if (createStep === 3 && !customTripName) setDraft((current) => ({ ...current, name: suggestedTripName(current) })); }, [createStep, customTripName, draft.country, draft.city, draft.startDate]);

  function dismissAutocomplete(setOpen: (open: boolean) => void) {
    setOpen(false);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    requestAnimationFrame(() => setOpen(false));
  }
  function selectCountry(index: number) { const country = countryMatches[index]; if (!country) return; setSelectedCountry(country); setDraft({ ...draft, country: country.displayName, city: "" }); dismissAutocomplete(setCountrySearchOpen); }
  function selectCity(index: number) { const city = cityMatches[index]; if (!city) return; const previous = draft.city.split("·").slice(0, -1).map((part) => part.trim()).filter(Boolean); setDraft({ ...draft, city: [...previous, city.name].join(" · ") }); dismissAutocomplete(setCitySearchOpen); }

  function openCreate() {
    setDraft(emptyDraft);
    setSelectedCountry(null);
    setCountryMatches([]);
    setCityMatches([]);
    setCustomTripName(false);
    setTripGuests([]);
    setGuestEmail("");
    setGuestError("");
    setCreateStep(1);
    setShowCreate(true);
    void fetch("/api/travel-companions").then((response) => response.ok ? response.json() : []).then(setFrequentTravelers).catch(() => setFrequentTravelers([]));
  }

  function closeCreate() {
    setShowCreate(false);
    setCreateStep(1);
  }

  function toggleCompanion(companion: TravelCompanion) { setGuestError(""); setTripGuests((current) => current.some((item) => item.email === companion.email) ? current.filter((item) => item.email !== companion.email) : [...current, { name: companion.name, email: companion.email }]); }
  function addGuestEmail() {
    const email = guestEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setGuestError("Inserisci un indirizzo email valido."); return; }
    if (tripGuests.some((item) => item.email === email)) { setGuestError("Questa persona è già stata aggiunta."); return; }
    const known = frequentTravelers.find((item) => item.email === email);
    const fallbackName = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("it"));
    setTripGuests((current) => [...current, { name: known?.name || fallbackName, email }]); setGuestEmail(""); setGuestError("");
  }

  async function addTrip() {
    const country = draft.country;
    const themeMap: Record<string, Trip["theme"]> = {
      Giappone: "sakura",
      Egitto: "sand",
      Thailandia: "teal",
      Italia: "blue",
    };
    const flagMap: Record<string, string> = {
      Giappone: "🇯🇵",
      Egitto: "🇪🇬",
      Thailandia: "🇹🇭",
      Italia: "🇮🇹",
    };
    const name = draft.name.trim() || suggestedTripName(draft);
    const newTrip: Trip = {
      id: `${Date.now()}`,
      name,
      country,
      countryCode: selectedCountry?.flag ?? countryFlags[country] ?? "🌍",
      city: draft.city.trim(),
      startDate: draft.startDate,
      endDate: draft.endDate,
      people: 1 + tripGuests.length,
      theme: themeMap[country] ?? "blue",
      status: "planning",
    };
    setTrips((current) => [newTrip, ...current]);
    closeCreate();
    try {
      const tripResponse = await fetch("/api/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newTrip) });
      if (tripResponse.ok) await Promise.allSettled(tripGuests.map((guest) => fetch(`/api/trips/${newTrip.id}/invites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...guest, role: "participant" }) })));
    } catch {
      // Il salvataggio locale resta disponibile se il server è temporaneamente offline.
    }
  }

  if (!authReady || !currentUser) return <main className="auth-loading" aria-label="Caricamento account"><div className="brand">mova</div><p>Caricamento del tuo spazio di viaggio...</p></main>;

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div>
            <div className="brand">mova</div>
            <div className="brand-subtitle">Travel together</div>
          </div>
          <button className="icon-button mobile-only" onClick={() => setMobileMenu(false)} aria-label="Chiudi menu">
            <X size={20} />
          </button>
        </div>

        <nav className="main-nav" aria-label="Navigazione principale">
          {navItems.map(({ label, icon: Icon }, index) => (
            <button key={label} className={`nav-item ${index === 0 ? "active" : ""}`} onClick={() => { if (label === "Profilo") router.push("/auth"); if (label === "Progressi") router.push("/progress"); }}>
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-avatar">{userInitials}</div>
          <div>
            <strong>{currentUser.name}</strong>
            <span>Piano Free</span>
          </div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileMenu(true)} aria-label="Apri menu">
            <Menu size={22} />
          </button>
          <div className="topbar-title">
            <h1>Ciao, {firstName}</h1>
            <p>Continuiamo a costruire il tuo prossimo viaggio.</p>
          </div>
          <div className="notification-center">
            <button className="icon-button notification-button" aria-label="Notifiche" onClick={() => setNotificationsOpen((value) => !value)}><Bell size={21} />{notifications.some((item) => !item.readAt) && <span className="notification-dot" />}{notifications.filter((item) => !item.readAt).length > 0 && <span className="notification-count">{notifications.filter((item) => !item.readAt).length}</span>}</button>
            {notificationsOpen && <div className="notification-popover"><header><div><p className="section-kicker">AGGIORNAMENTI</p><h2>Notifiche</h2></div>{notifications.some((item) => !item.readAt) && <button onClick={markAllNotificationsRead}>Segna tutte come lette</button>}</header><div className="notification-list">{notifications.length ? notifications.map((item) => <button key={item.id} className={item.readAt ? "" : "unread"} onClick={() => openNotification(item)}><span className="notification-item-icon"><Bell size={17} /></span><div><strong>{item.title}</strong><p>{item.message}</p><small>{new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</small></div></button>) : <p className="notification-empty">Non ci sono ancora notifiche.</p>}</div></div>}
          </div>
        </header>

        <div className="page-grid">
          <section className="primary-column">
            {selectedTrip ? (
              <article className={`hero-card theme-${selectedTrip.theme}`} style={imageForTrip(selectedTrip) ? { backgroundImage: `url(${imageForTrip(selectedTrip)})` } : undefined}>
                <div className="hero-overlay" />
                <div className="hero-content">
                  <div className="eyebrow">
                    <span>{selectedTrip.countryCode}</span>
                    <span>{selectedTrip.country}</span>
                  </div>
                  <h2>{selectedTrip.name}</h2>
                  {selectedTrip.city && <p>{selectedTrip.city}</p>}
                  <div className="hero-meta">
                    <span><CalendarDays size={17} /> {formatDate(selectedTrip.startDate)} – {formatDate(selectedTrip.endDate)}</span>
                    <span><Users size={17} /> {selectedTrip.people} partecipanti</span>
                  </div>
                  <button className="light-button" onClick={() => router.push(`/trips/${selectedTrip.id}/overview`)}>
                    Apri viaggio <ChevronRight size={18} />
                  </button>
                </div>
                <div className="countdown" aria-label={daysUntil(selectedTrip.startDate) === 0 ? "Partenza oggi" : `Partenza tra ${daysUntil(selectedTrip.startDate)} ${daysUntil(selectedTrip.startDate) === 1 ? "giorno" : "giorni"}`}>
                  {daysUntil(selectedTrip.startDate) === 0 ? <strong className="countdown-today">Oggi</strong> : <><span>Tra</span><strong>{daysUntil(selectedTrip.startDate)}</strong><span>{daysUntil(selectedTrip.startDate) === 1 ? "giorno" : "giorni"}</span></>}
                </div>
              </article>
            ) : null}

            <div className="section-heading">
              <div>
                <p className="section-kicker">I TUOI VIAGGI</p>
                <h3>In Programma</h3>
              </div>
              <button className="primary-button" onClick={openCreate}>
                <Plus size={18} /> Nuovo Viaggio
              </button>
            </div>

            <div className="trip-grid">
              {!inProgramTrips.length && <div className="home-empty"><Plane size={28} /><div><strong>Nessun Viaggio in Programma</strong><p>Crea un nuovo viaggio oppure consulta quelli completati.</p></div></div>}
              {inProgramTrips.map((trip) => (
                <button
                  key={trip.id}
                  className={`trip-card ${selectedTrip?.id === trip.id ? "selected" : ""}`}
                  onClick={() => router.push(`/trips/${trip.id}/overview`)}
                >
                  <div className={`trip-thumbnail theme-${trip.theme}`} style={imageForTrip(trip) ? { backgroundImage: `linear-gradient(rgba(12,23,51,.08), rgba(12,23,51,.18)), url(${imageForTrip(trip)})` } : undefined}>
                    <span>{trip.countryCode}</span>
                  </div>
                  <div className="trip-card-copy">
                    <strong>{trip.name}</strong>
                    {trip.city && <span>{trip.city}</span>}
                    <small>{formatDate(trip.startDate)} · {trip.people} persone</small>
                  </div>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>

            <div className="section-heading completed-heading">
              <div>
                <p className="section-kicker">LA TUA STORIA</p>
                <h3>Completati</h3>
              </div>
            </div>
            <div className="trip-grid completed-trip-grid">
              {!completedTrips.length && <div className="home-empty completed-empty"><Check size={28} /><div><strong>Nessun Viaggio Completato</strong><p>I viaggi conclusi verranno raccolti automaticamente qui.</p></div></div>}
              {completedTrips.map((trip) => (
                <button
                  key={trip.id}
                  className="trip-card completed"
                  onClick={() => router.push(`/trips/${trip.id}/overview`)}
                >
                  <div className={`trip-thumbnail theme-${trip.theme}`} style={imageForTrip(trip) ? { backgroundImage: `linear-gradient(rgba(12,23,51,.28), rgba(12,23,51,.42)), url(${imageForTrip(trip)})` } : undefined}>
                    <span>{trip.countryCode}</span>
                  </div>
                  <div className="trip-card-copy">
                    <strong>{trip.name}</strong>
                    {trip.city && <span>{trip.city}</span>}
                    <small>Concluso il {formatDate(trip.endDate)} · {trip.people} persone</small>
                  </div>
                  <Check size={18} />
                </button>
              ))}
            </div>
          </section>

          <aside className="secondary-column">
            <div className="quick-card">
              <div className="section-kicker">STATO DEL VIAGGIO</div>
              <h3>Preparazione</h3>
              <div className="progress-row">
                <span>Voli</span><strong>{tripProgress.flights}%</strong>
              </div>
              <div className="progress-track"><span style={{ width: `${tripProgress.flights}%` }} /></div>
              <div className="progress-row">
                <span>Hotel</span><strong>{tripProgress.hotels}%</strong>
              </div>
              <div className="progress-track"><span style={{ width: `${tripProgress.hotels}%` }} /></div>
              <div className="progress-row">
                <span>Attività</span><strong>{tripProgress.activities}%</strong>
              </div>
              <div className="progress-track"><span style={{ width: `${tripProgress.activities}%` }} /></div>
            </div>

            <div className="quick-card">
              <div className="section-kicker">AZIONI RAPIDE</div>
              <div className="quick-actions">
                <button><CalendarDays size={19} /><span>Itinerario</span></button>
                <button><WalletCards size={19} /><span>Spese</span></button>
                <button><Map size={19} /><span>Mappa</span></button>
                <button><Compass size={19} /><span>App Utili</span></button>
              </div>
            </div>

            <div className="tip-card">
              <Plane size={22} />
              <div>
                <strong>Consiglio Mova</strong>
                <p>Invita gli altri partecipanti per organizzare il viaggio insieme.</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {showCreate && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeCreate}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="section-kicker">NUOVO VIAGGIO · PASSO {createStep} DI 3</div>
                <h2 id="create-title">{createStep === 1 ? "Dove vuoi andare?" : createStep === 2 ? "Quando si parte?" : "Ultimi dettagli"}</h2>
              </div>
              <button className="icon-button" onClick={closeCreate} aria-label="Chiudi"><X size={21} /></button>
            </div>
            <div className="step-progress" aria-label={`Passo ${createStep} di 3`}><span style={{ width: `${createStep * 33.333}%` }} /></div>
            <form onSubmit={(event) => { event.preventDefault(); if (createStep === 1 && !selectedCountry) return; createStep < 3 ? setCreateStep(createStep + 1) : addTrip(); }} className="trip-form">
              {createStep === 1 && <>
                <label className="autocomplete-field">Paese
                  <input value={draft.country} onFocus={() => setCountrySearchOpen(false)} onChange={(event) => { setSelectedCountry(null); setDraft({ ...draft, country: event.target.value, city: "" }); setCountrySearchOpen(Boolean(event.target.value.trim())); }} onKeyDown={countryKeyboard.onKeyDown} placeholder="Inizia a digitare un Paese" autoComplete="off" role="combobox" aria-expanded={countrySearchOpen && countryMatches.length > 0} aria-controls="country-options" aria-activedescendant={countryKeyboard.activeIndex >= 0 ? `country-option-${countryKeyboard.activeIndex}` : undefined} required />
                  {countrySearchOpen && countryMatches.length > 0 && <div className="autocomplete-menu" id="country-options" role="listbox">{countryMatches.map((country, index) => <button type="button" id={`country-option-${index}`} role="option" aria-selected={countryKeyboard.activeIndex === index} className={countryKeyboard.activeIndex === index ? "keyboard-active" : undefined} key={country.isoCode} onMouseEnter={() => countryKeyboard.setActiveIndex(index)} onClick={() => selectCountry(index)}><span>{country.flag}</span><strong>{country.displayName}</strong><small>{country.name !== country.displayName ? country.name : country.isoCode}</small></button>)}</div>}
                </label>
                <label className="autocomplete-field">Città o tappe <small className="optional-label">Facoltativo</small>
                  <input value={draft.city} disabled={!selectedCountry} onFocus={() => setCitySearchOpen(false)} onChange={(event) => { setDraft({ ...draft, city: event.target.value }); setCitySearchOpen(Boolean(event.target.value.trim())); }} onKeyDown={cityKeyboard.onKeyDown} placeholder={selectedCountry ? "Es. Roma · Firenze" : "Seleziona prima un Paese"} autoComplete="off" role="combobox" aria-expanded={citySearchOpen && cityMatches.length > 0} aria-controls="city-options" aria-activedescendant={cityKeyboard.activeIndex >= 0 ? `city-option-${cityKeyboard.activeIndex}` : undefined} />
                  {citySearchOpen && cityMatches.length > 0 && <div className="autocomplete-menu" id="city-options" role="listbox">{cityMatches.map((city, index) => <button type="button" id={`city-option-${index}`} role="option" aria-selected={cityKeyboard.activeIndex === index} className={cityKeyboard.activeIndex === index ? "keyboard-active" : undefined} key={`${city.name}-${city.stateCode}-${index}`} onMouseEnter={() => cityKeyboard.setActiveIndex(index)} onClick={() => selectCity(index)}><Map size={17} /><strong>{city.name}</strong><small>{city.stateCode}</small></button>)}</div>}
                  {selectedCountry && <small className="field-hint">Puoi continuare senza città oppure aggiungere una o più tappe.</small>}
                </label>
              </>}
              {createStep === 2 && <div className="form-grid">
                <label>Partenza
                  <input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} required />
                </label>
                <label>Ritorno
                  <input type="date" min={draft.startDate} value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} required />
                </label>
              </div>}
              {createStep === 3 && <>
                <label>Nome del viaggio
                  <input value={draft.name} onChange={(event) => { setCustomTripName(true); setDraft({ ...draft, name: event.target.value }); }} placeholder={`Es. ${suggestedTripName(draft)}`} required />
                </label>
                <section className="create-participants">
                  <div className="create-participants-heading"><div><strong>Partecipanti</strong><span>Tu sei già incluso nel viaggio</span></div><span><Users size={16} /> {1 + tripGuests.length}</span></div>
                  {frequentTravelers.length > 0 && <div className="frequent-travelers"><small>PERSONE CON CUI HAI GIÀ VIAGGIATO</small><div>{frequentTravelers.map((companion) => { const selected = tripGuests.some((item) => item.email === companion.email); return <button type="button" key={companion.email} className={selected ? "selected" : ""} onClick={() => toggleCompanion(companion)}><span className="companion-avatar">{companion.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span><strong>{companion.name}</strong><small>{companion.trips} {companion.trips === 1 ? "viaggio insieme" : "viaggi insieme"}</small></span><span className="companion-check">{selected ? <Check size={15} /> : <UserPlus size={15} />}</span></button>; })}</div></div>}
                  <div className="new-guest"><label>Invita una nuova persona</label><div><Mail size={17} /><input type="email" value={guestEmail} onChange={(event) => { setGuestEmail(event.target.value); setGuestError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addGuestEmail(); } }} placeholder="nome@email.com" /><button type="button" onClick={addGuestEmail} disabled={!guestEmail.trim()}><Plus size={17} /> Aggiungi</button></div>{guestError && <small className="guest-error">{guestError}</small>}</div>
                  {tripGuests.length > 0 && <div className="selected-guests">{tripGuests.map((guest) => <span key={guest.email}><span>{guest.name}</span><small>{guest.email}</small><button type="button" onClick={() => setTripGuests((current) => current.filter((item) => item.email !== guest.email))} aria-label={`Rimuovi ${guest.name}`}><X size={14} /></button></span>)}</div>}
                </section>
                <div className="trip-summary">
                  <span className="summary-flag">{selectedCountry?.flag ?? countryFlags[draft.country] ?? "🌍"}</span>
                  <div><strong>{draft.name || `Viaggio in ${draft.country}`}</strong><span>{[draft.city, `${formatDate(draft.startDate)} – ${formatDate(draft.endDate)}`, `${1 + tripGuests.length} ${1 + tripGuests.length === 1 ? "partecipante" : "partecipanti"}`].filter(Boolean).join(" · ")}</span></div>
                </div>
              </>}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={createStep === 1 ? closeCreate : () => setCreateStep(createStep - 1)}>{createStep === 1 ? "Annulla" : "Indietro"}</button>
                <button type="submit" className="primary-button" disabled={createStep === 1 && !selectedCountry}>{createStep === 3 ? "Crea viaggio" : "Continua"} <ChevronRight size={18} /></button>
              </div>
            </form>
          </div>
        </div>
      )}

      <nav className="mobile-bottom-nav" aria-label="Navigazione mobile">
        {navItems.map(({ label, icon: Icon }, index) => (
          <button key={label} className={index === 0 ? "active" : ""} onClick={() => { if (label === "Profilo") router.push("/auth"); if (label === "Progressi") router.push("/progress"); }}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
