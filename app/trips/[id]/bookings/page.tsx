"use client";

import { ChangeEvent, useEffect, useLayoutEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Mail,
  MapPin,
  Paperclip,
  Pencil,
  Plane,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { TripCover } from "../../../components/trip-cover";
import { TripTabs } from "../../../components/trip-tabs";
import { TravelCategoryIcon, travelCategoryFromText, travelCategoryLabel } from "../../../components/travel-category-icon";
import { syncTripResource, syncTripSnapshot } from "../../../../lib/trip-sync";
import { useTripPermissions } from "../../../../lib/use-trip-permissions";
import { useAutocompleteKeyboard } from "../../../../lib/use-autocomplete-keyboard";
import { fetchDestinationImage } from "../../../../lib/destination-images";

type Booking = {
  id: string;
  title: string;
  type: "flight" | "hotel" | "train" | "car" | "activity";
  startDate: string;
  endDate: string;
  reference: string;
  status: "confirmed" | "pending";
  provider?: string;
  location?: string;
  notes?: string;
  source?: "manual" | "email";
  importedAt?: string | null;
  originAirport?: string;
  destinationAirport?: string;
};
type AirportOption = {
  iata: string;
  icao: string;
  airport: string;
  countryCode: string;
};
type FlightOption = {
  id: string;
  airline: string;
  flightNumber: string;
  departureAt: string;
  arrivalAt: string;
  origin: string;
  destination: string;
  stops: number;
  price?: string | null;
};
const starterBookings: Booking[] = [
  {
    id: "outbound",
    title: "Volo Roma → Tokyo",
    type: "flight",
    startDate: "2027-08-03T10:20",
    endDate: "2027-08-04T07:45",
    reference: "AZ 786",
    status: "confirmed",
  },
  {
    id: "hotel",
    title: "Tokyo Stay Shibuya",
    type: "hotel",
    startDate: "2027-08-04T15:00",
    endDate: "2027-08-08T11:00",
    reference: "HGB-2027-55621",
    status: "confirmed",
  },
  {
    id: "museum",
    title: "Museo Nazionale di Tokyo",
    type: "activity",
    startDate: "2027-08-08T09:30",
    endDate: "2027-08-08T11:30",
    reference: "2 biglietti",
    status: "pending",
  },
];
const emptyDraft = {
  title: "",
  type: "activity" as Booking["type"],
  startDate: "",
  endDate: "",
  reference: "",
  status: "confirmed" as Booking["status"],
  provider: "",
  location: "",
  notes: "",
  source: "manual" as Booking["source"],
  originAirport: "",
  destinationAirport: "",
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function bookingTitle(item: Booking) {
  return item.type === "flight" ? item.title.replace(/^Volo\s+/i, "") : item.title;
}

function BookingVisual({ item }: { item: Booking }) {
  const category = travelCategoryFromText(item.type, `${item.title} ${item.provider || ""}`);
  const [image, setImage] = useState("");
  const supportsPhoto = ["hotel", "food", "activity", "place"].includes(category);
  useEffect(() => {
    let active = true;
    setImage("");
    if (supportsPhoto && item.location?.trim()) {
      void fetchDestinationImage("", item.location).then((result) => { if (active) setImage(result); });
    }
    return () => { active = false; };
  }, [item.location, supportsPhoto]);
  return (
    <div
      className={`booking-icon booking-icon-${category} ${image ? "booking-photo" : ""}`}
      title={travelCategoryLabel(category)}
      style={image ? { backgroundImage: `linear-gradient(rgba(8,24,55,.08),rgba(8,24,55,.28)),url(${image})` } : undefined}
    >
      {!image && <TravelCategoryIcon category={category} size={21} />}
      {image && <span><TravelCategoryIcon category={category} size={14} /></span>}
    </div>
  );
}
const airportCode = (value: string) => value.split(" · ")[0] || value;
function AirportField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [matches, setMatches] = useState<AirportOption[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const query = value.trim();
    if (query.length < 2 || query.includes(" · ")) {
      setMatches([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/airports?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : []))
        .then(setMatches)
        .catch(() => setMatches([]));
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);
  const keyboard = useAutocompleteKeyboard({
    itemCount: matches.length,
    isOpen: open,
    resetKey: value,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
    onSelect: selectAirport,
  });
  function selectAirport(index: number) {
    const airport = matches[index];
    if (!airport) return;
    onChange(`${airport.iata} · ${airport.airport}`);
    setOpen(false);
  }
  const optionsId = `airport-options-${label.toLocaleLowerCase("it").replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <label className="autocomplete-field">
      {label}
      <input
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={keyboard.onKeyDown}
        placeholder="Città, aeroporto o codice IATA"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={optionsId}
        aria-activedescendant={
          keyboard.activeIndex >= 0
            ? `${optionsId}-${keyboard.activeIndex}`
            : undefined
        }
        required
      />
      {open && matches.length > 0 && (
        <div
          className="autocomplete-menu airport-menu"
          id={optionsId}
          role="listbox"
        >
          {matches.map((airport, index) => (
            <button
              type="button"
              id={`${optionsId}-${index}`}
              role="option"
              aria-selected={keyboard.activeIndex === index}
              className={
                keyboard.activeIndex === index ? "keyboard-active" : undefined
              }
              key={airport.icao || airport.iata}
              onMouseEnter={() => keyboard.setActiveIndex(index)}
              onClick={() => selectAirport(index)}
            >
              <Plane size={16} />
              <strong>{airport.iata}</strong>
              <span>{airport.airport}</span>
              <small>{airport.countryCode}</small>
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

export default function BookingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const highlightedBookingId = useSearchParams().get("booking");
  const { canManage } = useTripPermissions(id);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [flightOptions, setFlightOptions] = useState<FlightOption[]>([]);
  const [flightSearchError, setFlightSearchError] = useState("");
  const [searchingFlights, setSearchingFlights] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [attachmentCounts, setAttachmentCounts] = useState<
    Record<string, number>
  >({});
  useLayoutEffect(() => {
    if (
      showEditor &&
      !editingId &&
      document.activeElement instanceof HTMLElement
    )
      document.activeElement.blur();
  }, [editingId, showEditor]);
  useEffect(() => {
    async function load() {
      const saved = window.localStorage.getItem(`mova-bookings-${id}`);
      const cached = saved ? (JSON.parse(saved) as Booking[]) : starterBookings;
      try {
        const response = await fetch(`/api/trips/${id}`);
        if (response.ok) {
          const remote = await response.json();
          setBookings(remote.bookings);
          setAttachmentCounts(
            remote.documents.reduce(
              (
                counts: Record<string, number>,
                document: { bookingId?: string | null },
              ) => {
                if (document.bookingId)
                  counts[document.bookingId] =
                    (counts[document.bookingId] || 0) + 1;
                return counts;
              },
              {},
            ),
          );
          window.localStorage.setItem(
            `mova-bookings-${id}`,
            JSON.stringify(remote.bookings),
          );
          const needsRefresh = remote.bookings.some(
            (booking: Booking) =>
              !remote.activities.some(
                (activity: {
                  bookingId?: string | null;
                  bookingEvent?: string | null;
                }) =>
                  activity.bookingId === booking.id &&
                  activity.bookingEvent === "start",
              ) ||
              Boolean(
                booking.endDate &&
                  booking.type !== "activity" &&
                  !remote.activities.some(
                    (activity: {
                      bookingId?: string | null;
                      bookingEvent?: string | null;
                    }) =>
                      activity.bookingId === booking.id &&
                      activity.bookingEvent === "end",
                  ),
              ),
          );
          if (needsRefresh)
            void syncTripResource(id, "bookings", remote.bookings);
          return;
        }
      } catch {
        /* Cache offline. */
      }
      setBookings(cached);
    }
    void load();
  }, [id]);
  async function persist(next: Booking[]) {
    const ordered = [...next].sort((a, b) =>
      a.startDate.localeCompare(b.startDate),
    );
    setBookings(ordered);
    window.localStorage.setItem(`mova-bookings-${id}`, JSON.stringify(ordered));
    return syncTripResource(id, "bookings", ordered);
  }
  function openNew() {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    setEditingId(null);
    setDraft(emptyDraft);
    setFlightOptions([]);
    setFlightSearchError("");
    setSaveError("");
    setShowEditor(true);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(".booking-modal")
        ?.scrollTo({ top: 0 }),
    );
  }
  function openEdit(item: Booking) {
    setEditingId(item.id);
    setDraft({
      title: item.title,
      type: item.type,
      startDate: item.startDate.slice(0, 16),
      endDate: item.endDate?.slice(0, 16) || "",
      reference: item.reference || "",
      status: "confirmed",
      provider: item.provider || "",
      location: item.location || "",
      notes: item.notes || "",
      source: item.source || "manual",
      originAirport: item.originAirport || "",
      destinationAirport: item.destinationAirport || "",
    });
    setShowEditor(true);
  }
  async function save() {
    if (
      !draft.startDate ||
      (draft.type === "flight"
        ? !draft.originAirport || !draft.destinationAirport
        : !draft.title)
    )
      return;
    setSaving(true);
    setSaveError("");
    const confirmedDraft = { ...draft, endDate: "", status: "confirmed" as const };
    const completed =
      draft.type === "flight"
        ? {
            ...confirmedDraft,
            title: `${airportCode(draft.originAirport)} → ${airportCode(draft.destinationAirport)}`,
            location: `${draft.originAirport} → ${draft.destinationAirport}`,
          }
        : confirmedDraft;
    const saved = await persist(
      editingId
        ? bookings.map((item) =>
            item.id === editingId ? { ...item, ...completed } : item,
          )
        : [...bookings, { id: `${Date.now()}`, ...completed }],
    );
    setSaving(false);
    if (!saved) {
      setSaveError("Non è stato possibile salvare la prenotazione. Riprova.");
      return;
    }
    setShowEditor(false);
  }
  async function findFlights() {
    setSearchingFlights(true);
    setFlightSearchError("");
    setFlightOptions([]);
    const query = new URLSearchParams({
      origin: airportCode(draft.originAirport),
      destination: airportCode(draft.destinationAirport),
      date: draft.startDate.slice(0, 10),
    });
    const response = await fetch(`/api/flights?${query}`);
    const result = await response.json();
    setSearchingFlights(false);
    if (!response.ok)
      return setFlightSearchError(result.error || "Ricerca non disponibile.");
    setFlightOptions(result.flights || []);
    if (!result.flights?.length)
      setFlightSearchError("Nessun volo trovato per questa rotta e data.");
  }
  function selectFlight(flight: FlightOption) {
    setDraft({
      ...draft,
      provider: flight.airline,
      reference: flight.flightNumber,
      startDate: flight.departureAt.slice(0, 16),
      endDate: "",
    });
    setFlightOptions([]);
    setFlightSearchError("");
  }
  async function attachConfirmation(
    item: Booking,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("name", `${item.title} · conferma`);
    form.set("category", "shared");
    form.set("bookingId", item.id);
    const response = await fetch(`/api/trips/${id}/documents`, {
      method: "POST",
      body: form,
    });
    if (response.ok)
      setAttachmentCounts((current) => ({
        ...current,
        [item.id]: (current[item.id] || 0) + 1,
      }));
    event.target.value = "";
  }
  const groups = (
    ["flight", "hotel", "train", "car", "activity"] as Booking["type"][]
  )
    .map((type) => ({
      type,
      items: bookings.filter((item) => item.type === type),
    }))
    .filter((group) => group.items.length);
  const transportCount = bookings.filter((item) => ["flight", "train", "car"].includes(item.type)).length;
  const hotelCount = bookings.filter((item) => item.type === "hotel").length;
  const activityCount = bookings.filter((item) => item.type === "activity").length;
  useEffect(() => {
    if (
      !highlightedBookingId ||
      !bookings.some((item) => item.id === highlightedBookingId)
    )
      return;
    const timer = window.setTimeout(
      () =>
        document
          .getElementById(`booking-${highlightedBookingId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [bookings, highlightedBookingId]);

  return (
    <main className="trip-detail-shell bookings-shell">
      <header className="detail-topbar">
        <button
          className="detail-brand home-brand-button"
          onClick={() => router.push("/")}
          aria-label="Torna alla Home"
        >
          mova
        </button>
      </header>
      <TripCover tripId={id} />
      <div className="expenses-title">
        <p className="section-kicker">ORGANIZZAZIONE</p>
        <h1>Prenotazioni</h1>
        <p>Voli, soggiorni, trasporti e attività in un unico posto.</p>
      </div>
      <TripTabs tripId={id} />
      <section className="bookings-panel">
        <div className="booking-overview">
          <div>
            <strong>{bookings.length}</strong>
            <span>Prenotazioni</span>
          </div>
          <div>
            <strong>{transportCount}</strong>
            <span>Trasporti</span>
          </div>
          <div>
            <strong>{hotelCount}</strong>
            <span>Hotel</span>
          </div>
          <div>
            <strong>{activityCount}</strong>
            <span>Attività</span>
          </div>
          {canManage && (
            <button
              className="primary-button booking-add-button"
              onClick={openNew}
            >
              <Plus size={18} /> Aggiungi Prenotazione
            </button>
          )}
        </div>
        {groups.map((group) => (
          <div className="booking-group" key={group.type}>
            {group.items.map((item) => (
              <article
                id={`booking-${item.id}`}
                className={`booking-row ${highlightedBookingId === item.id ? "booking-highlighted" : ""}`}
                key={item.id}
              >
                <BookingVisual item={item} />
                <div>
                  <div className="booking-title-line">
                    <strong>{bookingTitle(item)}</strong>
                    {item.source === "email" && (
                      <span className="booking-source">
                        <Mail size={11} /> Email
                      </span>
                    )}
                  </div>
                  <span>
                    <CalendarDays size={14} /> {dateLabel(item.startDate)}
                  </span>
                  {item.location && (
                    <span>
                      <MapPin size={14} /> {item.location}
                    </span>
                  )}
                  {(item.provider || item.reference) && (
                    <small>
                      {[item.provider, item.reference]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  )}
                  {item.notes && <p className="booking-notes">{item.notes}</p>}
                  {attachmentCounts[item.id] ? (
                    <button
                      className="booking-documents-link"
                      onClick={() =>
                        router.push(
                          `/trips/${id}/documents?booking=${encodeURIComponent(item.id)}`,
                        )
                      }
                    >
                      <Paperclip size={13} /> {attachmentCounts[item.id]}{" "}
                      {attachmentCounts[item.id] === 1
                        ? "allegato"
                        : "allegati"}
                    </button>
                  ) : null}
                </div>
                {canManage && (
                  <div className="person-actions">
                    <label
                      className="booking-attach-button"
                      title="Allega conferma"
                    >
                      <Paperclip size={17} />
                      {attachmentCounts[item.id] ? (
                        <small>{attachmentCounts[item.id]}</small>
                      ) : null}
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={(event) => attachConfirmation(item, event)}
                      />
                    </label>
                    <button
                      onClick={() => openEdit(item)}
                      aria-label={`Modifica ${item.title}`}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      onClick={() =>
                        persist(
                          bookings.filter((booking) => booking.id !== item.id),
                        )
                      }
                      aria-label={`Elimina ${item.title}`}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        ))}
      </section>
      {showEditor && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setShowEditor(false)}
        >
          <div
            className="modal booking-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="section-kicker">PRENOTAZIONE</p>
                <h2>
                  {editingId ? "Modifica Prenotazione" : "Nuova Prenotazione"}
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowEditor(false)}
                aria-label="Chiudi"
              >
                <X size={20} />
              </button>
            </div>
            <form
              className="trip-form"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <label>
                Tipo
                <select
                  value={draft.type}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      type: event.target.value as Booking["type"],
                    })
                  }
                >
                  <option value="flight">Volo</option>
                  <option value="hotel">Hotel</option>
                  <option value="train">Treno</option>
                  <option value="car">Auto o Transfer</option>
                  <option value="activity">Attività</option>
                </select>
              </label>
              {draft.type === "flight" ? (
                <div className="form-grid airport-fields">
                  <AirportField
                    label="Aeroporto di Partenza"
                    value={draft.originAirport}
                    onChange={(value) =>
                      setDraft({ ...draft, originAirport: value })
                    }
                  />
                  <AirportField
                    label="Aeroporto di Arrivo"
                    value={draft.destinationAirport}
                    onChange={(value) =>
                      setDraft({ ...draft, destinationAirport: value })
                    }
                  />
                </div>
              ) : (
                <label>
                  Titolo
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      setDraft({ ...draft, title: event.target.value })
                    }
                    placeholder="Nome della prenotazione"
                    required
                    autoFocus
                  />
                </label>
              )}
              <label>
                Data e Ora
                <input
                  type="datetime-local"
                  value={draft.startDate}
                  onChange={(event) =>
                    setDraft({ ...draft, startDate: event.target.value })
                  }
                  required
                />
              </label>
              {draft.type === "flight" && (
                <>
                  <button
                    type="button"
                    className="secondary-button flight-search-button"
                    onClick={findFlights}
                    disabled={
                      searchingFlights ||
                      !draft.originAirport ||
                      !draft.destinationAirport ||
                      !draft.startDate
                    }
                  >
                    <Plane size={17} />{" "}
                    {searchingFlights
                      ? "Ricerca in corso…"
                      : "Trova i voli di questo giorno"}
                  </button>
                  {flightSearchError && (
                    <div className="flight-search-error">
                      {flightSearchError}
                    </div>
                  )}
                  {flightOptions.length > 0 && (
                    <div className="flight-options">
                      {flightOptions.map((flight) => (
                        <button
                          type="button"
                          key={flight.id}
                          onClick={() => selectFlight(flight)}
                        >
                          <span>
                            <strong>{flight.flightNumber}</strong>
                            <small>{flight.airline}</small>
                          </span>
                          <span>
                            <strong>
                              {new Date(flight.departureAt).toLocaleTimeString(
                                "it-IT",
                                { hour: "2-digit", minute: "2-digit" },
                              )}{" "}
                              →{" "}
                              {new Date(flight.arrivalAt).toLocaleTimeString(
                                "it-IT",
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </strong>
                            <small>
                              {flight.stops
                                ? `${flight.stops} scali`
                                : "Diretto"}
                              {flight.price ? ` · ${flight.price}` : ""}
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              <div className="form-grid">
                <label>
                  Fornitore
                  <input
                    value={draft.provider}
                    onChange={(event) =>
                      setDraft({ ...draft, provider: event.target.value })
                    }
                    placeholder="Compagnia, hotel, agenzia…"
                  />
                </label>
                {draft.type !== "flight" && (
                  <label>
                    Luogo
                    <input
                      value={draft.location}
                      onChange={(event) =>
                        setDraft({ ...draft, location: event.target.value })
                      }
                      placeholder="Stazione, struttura, indirizzo…"
                    />
                  </label>
                )}
              </div>
              <label>
                Riferimento o Conferma
                <input
                  value={draft.reference}
                  onChange={(event) =>
                    setDraft({ ...draft, reference: event.target.value })
                  }
                  placeholder="Codice prenotazione, numero volo…"
                />
              </label>
              <label>
                Note
                <textarea
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft({ ...draft, notes: event.target.value })
                  }
                  placeholder="Check-in, bagagli, condizioni o altre informazioni utili"
                  rows={3}
                />
              </label>
              {saveError && <div className="flight-search-error">{saveError}</div>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowEditor(false)}
                >
                  Annulla
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? "Salvataggio…" : "Salva prenotazione"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
