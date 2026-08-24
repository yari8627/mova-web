"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  MapPin,
  Paperclip,
  ReceiptText,
  Settings,
  TicketCheck,
  Users,
} from "lucide-react";
import { TripCover } from "../../../components/trip-cover";
import { TripTabs } from "../../../components/trip-tabs";
import { syncTripSnapshot } from "../../../../lib/trip-sync";
import { fetchTripSnapshot, readTripSnapshot } from "../../../../lib/trip-client-cache";
import { useTripPermissions } from "../../../../lib/use-trip-permissions";

type Activity = {
  id: string;
  day: number;
  title: string;
  place: string;
  time: string;
  done: boolean;
  bookingId?: string | null;
};
type Booking = {
  id: string;
  title?: string;
  type?: string;
  startDate?: string;
  status: "confirmed" | "pending";
};
type Document = {
  id: string;
  name?: string;
  offline: boolean;
  bookingId?: string | null;
  storageKey?: string | null;
};
type Expense = { id: string; amount: number; kind?: "expense" | "settlement" };
type Participant = { id: string; status: "confirmed" | "pending" };
type TripDates = { startDate: string; endDate: string };
type PackingItem = { id: string; packed: boolean };

const starterActivities: Activity[] = [
  {
    id: "arrival",
    day: 1,
    title: "Arrivo e primo orientamento",
    place: "Centro città",
    time: "15:30",
    done: true,
  },
  {
    id: "districts",
    day: 2,
    title: "Quartieri iconici e cucina locale",
    place: "Mercato centrale",
    time: "09:00",
    done: false,
  },
  {
    id: "excursion",
    day: 3,
    title: "Escursione fuori città",
    place: "Punto di incontro",
    time: "08:15",
    done: false,
  },
];
const starterBookings: Booking[] = [
  { id: "outbound", status: "confirmed" },
  { id: "hotel", status: "confirmed" },
  { id: "museum", status: "pending" },
];
const starterDocuments: Document[] = [
  { id: "passport", offline: true },
  { id: "insurance", offline: true },
];
const starterExpenses: Expense[] = [
  { id: "hotel", amount: 420 },
  { id: "dinner", amount: 135.6 },
  { id: "train", amount: 276 },
];
const starterParticipants: Participant[] = [
  { id: "giulia", status: "confirmed" },
  { id: "marco", status: "confirmed" },
  { id: "luca", status: "confirmed" },
];
const money = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

function readSaved<T>(key: string, fallback: T): T {
  const saved = window.localStorage.getItem(key);
  return saved ? (JSON.parse(saved) as T) : fallback;
}
function tripGroup(remote: {
  owner?: { id: string; name: string; email: string } | null;
  participants: Participant[];
}) {
  const owner = remote.owner
    ? { id: `owner-${remote.owner.id}`, status: "confirmed" as const }
    : null;
  return [owner, ...remote.participants].filter(Boolean) as Participant[];
}

export default function OverviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { canInvite } = useTripPermissions(id);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [budget, setBudget] = useState<number | null>(null);
  const [tripDates, setTripDates] = useState<TripDates | null>(null);
  const [packingItems, setPackingItems] = useState<PackingItem[]>([]);
  const [checkInCompleted, setCheckInCompleted] = useState(false);
  const [savingCheckIn, setSavingCheckIn] = useState(false);
  useEffect(() => {
    async function load() {
      const activityItems = readSaved(
        `mova-itinerary-${id}`,
        starterActivities,
      );
      const bookingItems = readSaved(`mova-bookings-${id}`, starterBookings);
      const documentItems = readSaved(`mova-documents-${id}`, starterDocuments);
      const expenseItems = readSaved(`mova-expenses-${id}`, starterExpenses);
      const participantItems = readSaved(
        `mova-participants-${id}`,
        starterParticipants,
      );
      const savedBudget = window.localStorage.getItem(`mova-budget-${id}`);
      const budgetValue = savedBudget ? Number(savedBudget) : null;
      setActivities(activityItems);
      setBookings(bookingItems);
      setDocuments(documentItems);
      setExpenses(expenseItems);
      setParticipants(participantItems);
      setBudget(budgetValue);
      try {
        const remote = await fetchTripSnapshot(id);
        if (remote) {
          const group = tripGroup(remote);
          setActivities(remote.activities);
          setBookings(remote.bookings);
          setDocuments(remote.documents);
          setExpenses(remote.expenses);
          setParticipants(group);
          setBudget(remote.budget);
          window.localStorage.setItem(
            `mova-itinerary-${id}`,
            JSON.stringify(remote.activities),
          );
          window.localStorage.setItem(
            `mova-bookings-${id}`,
            JSON.stringify(remote.bookings),
          );
          window.localStorage.setItem(
            `mova-documents-${id}`,
            JSON.stringify(remote.documents),
          );
          window.localStorage.setItem(
            `mova-expenses-${id}`,
            JSON.stringify(remote.expenses),
          );
          window.localStorage.setItem(
            `mova-participants-${id}`,
            JSON.stringify(group),
          );
          if (remote.budget === null)
            window.localStorage.removeItem(`mova-budget-${id}`);
          else
            window.localStorage.setItem(
              `mova-budget-${id}`,
              String(remote.budget),
            );
          return;
        }
      } catch {
        /* Cache offline. */
      }
    }
    void load();
  }, [id]);
  useEffect(() => {
    const cached = readTripSnapshot(id);
    if (cached) setTripDates({ startDate: cached.startDate.slice(0, 10), endDate: cached.endDate.slice(0, 10) });
    fetchTripSnapshot(id)
      .then((trip) => {
        if (trip)
          setTripDates({
            startDate: trip.startDate.slice(0, 10),
            endDate: trip.endDate.slice(0, 10),
          });
      })
      .catch(() => undefined);
  }, [id]);
  useEffect(() => {
    Promise.all(
      ["personal", "shared"].map((scope) =>
        fetch(`/api/trips/${id}/packing?scope=${scope}`, {
          cache: "no-store",
        }).then((response) =>
          response.ok ? (response.json() as Promise<PackingItem[]>) : [],
        ),
      ),
    )
      .then(([personal, shared]) => setPackingItems([...personal, ...shared]))
      .catch(() => setPackingItems([]));
  }, [id]);
  useEffect(() => {
    fetch(`/api/trips/${id}/check-in`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (value) setCheckInCompleted(Boolean(value.completed));
      })
      .catch(() => undefined);
  }, [id]);
  const nextActivity = useMemo(
    () => {
      let firstAvailableDay = 1;
      if (tripDates) {
        const now = new Date();
        const current = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
        const start = new Date(`${tripDates.startDate}T12:00:00`);
        const end = new Date(`${tripDates.endDate}T12:00:00`);
        if (current > end) firstAvailableDay = Number.POSITIVE_INFINITY;
        else if (current >= start) firstAvailableDay = Math.floor((current.getTime() - start.getTime()) / 86400000) + 1;
      }
      return [...activities]
        .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time))
        .find((item) => !item.done && item.day >= firstAvailableDay);
    },
    [activities, tripDates],
  );
  const confirmedBookings = bookings.filter(
    (item) => item.status === "confirmed",
  ).length;
  const pendingBookings = bookings.length - confirmedBookings;
  const offlineDocuments = documents.filter((item) => item.offline).length;
  const totalExpenses = expenses
    .filter((item) => item.kind !== "settlement")
    .reduce((sum, item) => sum + item.amount, 0);
  const confirmedPeople = participants.filter(
    (item) => item.status === "confirmed",
  ).length;
  const pendingPeople = participants.length - confirmedPeople;
  const packedCount = packingItems.filter((item) => item.packed).length;
  const today = useMemo(() => {
    if (!tripDates) return null;
    const now = new Date();
    const current = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      12,
    );
    const start = new Date(`${tripDates.startDate}T12:00:00`);
    const end = new Date(`${tripDates.endDate}T12:00:00`);
    const daysFromStart = Math.floor(
      (current.getTime() - start.getTime()) / 86400000,
    );
    if (current < start)
      return {
        phase: "before" as const,
        day: 0,
        distance: Math.ceil((start.getTime() - current.getTime()) / 86400000),
        activities: [] as Activity[],
      };
    if (current > end)
      return {
        phase: "after" as const,
        day: daysFromStart + 1,
        distance: Math.floor((current.getTime() - end.getTime()) / 86400000),
        activities: [] as Activity[],
      };
    const day = daysFromStart + 1;
    return {
      phase: "active" as const,
      day,
      distance: 0,
      activities: activities
        .filter((item) => item.day === day)
        .sort((a, b) => a.time.localeCompare(b.time)),
    };
  }, [activities, tripDates]);

  function openDeviceWallet() {
    if (!checkInCompleted) return;
    const agent = navigator.userAgent;
    const isIOS =
      /iPhone|iPad|iPod/i.test(agent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(agent);
    if (isIOS) {
      window.location.href = "shoebox://";
      window.setTimeout(() => {
        if (!document.hidden) router.push(`/trips/${id}/documents`);
      }, 1200);
      return;
    }
    if (isAndroid) {
      window.location.href =
        "intent://wallet#Intent;scheme=googlewallet;package=com.google.android.apps.walletnfcrel;S.browser_fallback_url=https%3A%2F%2Fwallet.google.com%2F;end";
      return;
    }
    window.open("https://wallet.google.com/", "_blank", "noopener,noreferrer");
  }

  async function updateCheckIn(completed: boolean) {
    if (savingCheckIn) return;
    const previous = checkInCompleted;
    setCheckInCompleted(completed);
    setSavingCheckIn(true);
    try {
      const response = await fetch(`/api/trips/${id}/check-in`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!response.ok) throw new Error("Salvataggio non riuscito");
    } catch {
      setCheckInCompleted(previous);
    } finally {
      setSavingCheckIn(false);
    }
  }

  return (
    <main className="trip-detail-shell overview-shell">
      <header className="detail-topbar">
        <button
          className="detail-brand home-brand-button"
          onClick={() => router.push("/")}
          aria-label="Torna alla Home"
        >
          mova
        </button>
        <button
          className="secondary-button"
          onClick={() => router.push(`/trips/${id}/settings`)}
        >
          <Settings size={18} /> Gestisci
        </button>
        {canInvite && (
          <button
            className="primary-button"
            onClick={() => router.push(`/trips/${id}/participants`)}
          >
            <Users size={18} /> Invita
          </button>
        )}
      </header>
      <TripCover tripId={id} />
      <TripTabs tripId={id} />
      <section className="today-dashboard">
        <header>
          <div>
            <p className="section-kicker">OGGI</p>
            <h2>
              {today?.phase === "active"
                ? `Giorno ${today.day} del viaggio`
                : today?.phase === "before"
                  ? `Partenza tra ${today.distance} ${today.distance === 1 ? "giorno" : "giorni"}`
                  : today?.phase === "after"
                    ? "Viaggio concluso"
                    : "Preparazione del viaggio"}
            </h2>
            <p>
              {today?.phase === "active"
                ? new Intl.DateTimeFormat("it-IT", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  }).format(new Date())
                : today?.phase === "before"
                  ? "Controlla le ultime cose prima di partire."
                  : today?.phase === "after"
                    ? "Le informazioni del viaggio restano sempre disponibili."
                    : "Caricamento delle informazioni di oggi…"}
            </p>
          </div>
          <button
            className="secondary-button"
            onClick={() => router.push(`/trips/${id}`)}
          >
            Apri itinerario <ChevronRight size={17} />
          </button>
        </header>
        {today?.phase === "active" ? (
          today.activities.length ? (
            <div className="today-activities">
              {today.activities.map((activity) => {
                const linkedDocuments = documents.filter(
                  (document) =>
                    document.bookingId &&
                    document.bookingId === activity.bookingId,
                );
                return (
                  <article key={activity.id}>
                    <time>{activity.time}</time>
                    <span className={activity.done ? "done" : ""}>
                      {activity.done ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <Clock3 size={16} />
                      )}
                    </span>
                    <div>
                      <strong>{activity.title}</strong>
                      <p>
                        <MapPin size={14} /> {activity.place}
                      </p>
                      {linkedDocuments.length > 0 && (
                        <button
                          onClick={() =>
                            router.push(
                              `/trips/${id}/documents?booking=${encodeURIComponent(activity.bookingId!)}`,
                            )
                          }
                        >
                          <Paperclip size={13} /> {linkedDocuments.length}{" "}
                          {linkedDocuments.length === 1
                            ? "documento collegato"
                            : "documenti collegati"}
                        </button>
                      )}
                    </div>
                    <ChevronRight size={18} />
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="today-empty">
              <CalendarDays size={25} />
              <div>
                <strong>Nessuna Attività Prevista Oggi</strong>
                <p>Puoi aggiungerla dall’Itinerario.</p>
              </div>
            </div>
          )
        ) : (
          <div className="today-preparation wallet-preparation">
            <article
              className={`checkin-wallet-card${checkInCompleted ? " completed" : ""}`}
            >
              <div className="checkin-title-row">
                <strong>Check-in Effettuato?</strong>
                <label className="checkin-checkbox" aria-label="Check-in effettuato">
                  <input
                    type="checkbox"
                    checked={checkInCompleted}
                    disabled={savingCheckIn}
                    onChange={(event) => void updateCheckIn(event.target.checked)}
                  />
                  <span aria-hidden="true">
                    {checkInCompleted && <CheckCircle2 size={18} />}
                  </span>
                </label>
              </div>
              <button onClick={openDeviceWallet}>
                <Image
                  className="travel-wallet-icon"
                  src="/icons/wallet-travel-ticket.png"
                  width={44}
                  height={44}
                  alt=""
                  aria-hidden="true"
                />
                <span>
                  <small>Apri Wallet</small>
                </span>
                <ChevronRight size={19} />
              </button>
            </article>
            <button
              className={`packing-wallet-card${packingItems.length === 0 ? "" : packedCount === packingItems.length ? " completed" : " incomplete"}`}
              onClick={() => router.push(`/trips/${id}/packing`)}
            >
              <Image
                className="travel-card-icon"
                src="/icons/suitcase-travel.png"
                width={44}
                height={44}
                alt=""
                aria-hidden="true"
              />
              <span>
                <strong>Valigia</strong>
                <small>
                  {packedCount}/{packingItems.length} Pronti
                </small>
              </span>
              <ChevronRight size={19} />
            </button>
          </div>
        )}
      </section>
      <section className="overview-heading">
        <div>
          <p className="section-kicker">PANORAMICA</p>
          <h2>Tutto sotto controllo</h2>
          <p>Le informazioni più importanti, aggiornate dalle altre sezioni.</p>
        </div>
      </section>
      <section className="overview-grid">
        <button
          className="overview-card overview-next"
          onClick={() => router.push(`/trips/${id}`)}
        >
          <span className="overview-icon">
            <CalendarDays size={22} />
          </span>
          <div>
            <small>PROSSIMA ATTIVITÀ</small>
            {nextActivity ? (
              <>
                <strong>{nextActivity.title}</strong>
                <p>
                  <Clock3 size={15} /> Giorno {nextActivity.day} ·{" "}
                  {nextActivity.time} · {nextActivity.place}
                </p>
              </>
            ) : (
              <>
                <strong>Programma completato</strong>
                <p>
                  <CheckCircle2 size={15} /> Non ci sono attività da svolgere
                </p>
              </>
            )}
          </div>
          <ChevronRight size={20} />
        </button>
        <button
          className="overview-card"
          onClick={() => router.push(`/trips/${id}/expenses`)}
        >
          <span className="overview-icon">
            <ReceiptText size={22} />
          </span>
          <div>
            <small>SPESE</small>
            <strong>{money.format(totalExpenses)}</strong>
            <p>
              {budget === null
                ? "Budget non impostato"
                : `${money.format(Math.max(budget - totalExpenses, 0))} disponibili`}
            </p>
          </div>
          <ChevronRight size={20} />
        </button>
        <button
          className="overview-card"
          onClick={() => router.push(`/trips/${id}/bookings`)}
        >
          <span className="overview-icon">
            <TicketCheck size={22} />
          </span>
          <div>
            <small>PRENOTAZIONI</small>
            <strong>{confirmedBookings} confermate</strong>
            <p>
              {pendingBookings
                ? `${pendingBookings} in attesa`
                : "Nessuna in attesa"}
            </p>
          </div>
          <ChevronRight size={20} />
        </button>
        <button
          className="overview-card"
          onClick={() => router.push(`/trips/${id}/documents`)}
        >
          <span className="overview-icon">
            <FileCheck2 size={22} />
          </span>
          <div>
            <small>DOCUMENTI</small>
            <strong>{documents.length} caricati</strong>
            <p>{offlineDocuments} disponibili offline</p>
          </div>
          <ChevronRight size={20} />
        </button>
        <button
          className="overview-card"
          onClick={() => router.push(`/trips/${id}/participants`)}
        >
          <span className="overview-icon">
            <Users size={22} />
          </span>
          <div>
            <small>PARTECIPANTI</small>
            <strong>
              {participants.length}{" "}
              {participants.length === 1 ? "persona" : "persone"}
            </strong>
            <p>
              {pendingPeople
                ? `${confirmedPeople} ${confirmedPeople === 1 ? "confermato" : "confermati"} · ${pendingPeople} in attesa`
                : "Tutti hanno confermato"}
            </p>
          </div>
          <ChevronRight size={20} />
        </button>
      </section>
    </main>
  );
}
