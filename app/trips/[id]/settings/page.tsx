"use client";
import { TripHeader } from "../../../components/trip-header";
import styles from "./settings.module.css";
import boutique from "../itinerary.module.css";
import { FormEvent, useEffect, useState } from "react";
import { Archive, ChevronDown, LogOut, Save, Trash2, UserRoundCog } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { fetchTripSnapshot, readTripSnapshot, removeTripSnapshot } from "../../../../lib/trip-client-cache";
import { TripTabs } from "../../../components/trip-tabs";
import { TripCover } from "../../../components/trip-cover";
import { useTripPermissions } from "../../../../lib/use-trip-permissions";

type Draft = { name: string; country: string; countryCode: string; city: string; startDate: string; endDate: string; people: number; theme: string };
type Person = { email: string; name: string; status: string; role?: string };
const empty: Draft = { name: "", country: "", countryCode: "🌍", city: "", startDate: "", endDate: "", people: 1, theme: "blue" };

export default function SettingsPage() { const { id } = useParams<{ id: string }>(); const router = useRouter(); const { role, canManage } = useTripPermissions(id); const [draft, setDraft] = useState(empty); const [people, setPeople] = useState<Person[]>([]); const [message, setMessage] = useState(""); const [transferEmail, setTransferEmail] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const apply = (trip: ReturnType<typeof readTripSnapshot>) => {
      if (!trip || cancelled) return;
      setDraft({ name: trip.name, country: trip.country, countryCode: trip.countryCode || "", city: trip.city || "", startDate: trip.startDate.slice(0, 10), endDate: trip.endDate.slice(0, 10), people: trip.people, theme: trip.theme });
      setPeople(trip.participants.filter((person: Person) => person.status === "confirmed" && person.role !== "owner" && person.email.trim().toLowerCase() !== trip.owner?.email?.trim().toLowerCase()));
    };
    apply(readTripSnapshot(id));
    void fetchTripSnapshot(id).then(apply);
    return () => { cancelled = true; };
  }, [id]);
  async function save(event: FormEvent) { event.preventDefault(); const response = await fetch(`/api/trips/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) }); if (response.ok) removeTripSnapshot(id); setMessage(response.ok ? "Modifiche salvate" : (await response.json()).error); }
  async function archive() { if (!confirm("Archiviare questo viaggio? Non comparirà più nella Home.")) return; const response = await fetch(`/api/trips/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: true }) }); if (response.ok) removeTripSnapshot(id); if (response.ok) router.push("/"); }
  async function remove() { if (!confirm("Eliminare definitivamente il viaggio e tutti i suoi dati?")) return; setMessage(""); const response = await fetch(`/api/trips/${id}`, { method: "DELETE" }); if (response.ok) removeTripSnapshot(id); if (!response.ok) { const result = await response.json().catch(() => ({})); setMessage(result.error || "Non è stato possibile eliminare il viaggio."); return; } const savedTrips = JSON.parse(localStorage.getItem("mova-trips") || "[]") as Array<{ id: string }>; localStorage.setItem("mova-trips", JSON.stringify(savedTrips.filter((trip) => trip.id !== id))); ["itinerary", "bookings", "documents", "expenses", "participants", "budget"].forEach((resource) => localStorage.removeItem(`mova-${resource}-${id}`)); router.replace("/"); router.refresh(); }
  async function leave() { if (!confirm("Vuoi uscire da questo viaggio?")) return; const response = await fetch(`/api/trips/${id}/leave`, { method: "POST" }); if (response.ok) removeTripSnapshot(id); if (response.ok) router.push("/"); else setMessage((await response.json()).error); }
  const validTransfer = people.some(person => person.email === transferEmail);
  // Confirmation gate: a future security dialog can replace confirm here.
  async function transfer() { if (!validTransfer || !confirm("Trasferire definitivamente la proprietà?")) return; const response = await fetch(`/api/trips/${id}/transfer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: transferEmail }) }); if (response.ok) removeTripSnapshot(id); if (response.ok) router.push(`/trips/${id}/overview`); else setMessage((await response.json()).error); }
  return <main className={`trip-detail-shell settings-shell ${boutique.itinerary} ${styles.tripSettings}`}>
    <TripHeader tripId={id} />
    <TripCover tripId={id} />
    <TripTabs tripId={id} />
    <div className="expenses-title"><p className="section-kicker">GESTIONE VIAGGIO</p><h1 className="trip-section-title">Impostazioni</h1><p>Personalizza e gestisci il tuo viaggio.</p></div>
    {message && <div className="settings-message" role="status">{message}</div>}
    {canManage && <form className="settings-card trip-form" onSubmit={save}>
      <h2>Informazioni principali</h2>
      <label>Nome del viaggio<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
      <div className="form-grid"><label>Paese<input value={draft.country} onChange={(event) => setDraft({ ...draft, country: event.target.value })} required /></label><label>Città e tappe<input value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} required /></label></div>
      <div className={`form-grid ${styles.dateGrid}`}><label>Partenza<input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} required /></label><label>Ritorno<input type="date" min={draft.startDate} value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} required /></label></div>
      <button className="primary-button settings-save"><Save size={18} /> Salva modifiche</button>
    </form>}
    <section className="settings-card settings-danger"><h2>Gestione avanzata</h2>
      {role === "owner" ? <>
        <div><span><Archive size={20} /></span><div><strong>Archivia viaggio</strong><p>Nascondilo dalla Home conservando tutti i dati.</p></div><button className="secondary-button" onClick={archive}>Archivia</button></div>
        <div className={styles.transferRow}>
          <button type="button" className={styles.transferToggle} aria-expanded={transferOpen} aria-controls="trip-transfer-controls" onClick={() => setTransferOpen(!transferOpen)}>
            <span className={styles.transferIcon}><UserRoundCog size={20} /></span>
            <span><strong>Trasferisci proprietà</strong><span className={styles.transferDescription}>Il nuovo proprietario deve essere un partecipante confermato.</span></span>
            <ChevronDown size={18} className={styles.transferChevron} aria-hidden="true" />
          </button>
          <div id="trip-transfer-controls" className={`${styles.transferPanel} ${transferOpen ? styles.transferExpanded : ""}`} inert={!transferOpen} aria-hidden={!transferOpen}>
            <div><div className={styles.transferControls}>
              <select aria-label="Nuovo proprietario" value={transferEmail} onChange={(event) => setTransferEmail(event.target.value)} disabled={!transferOpen}><option value="">Seleziona partecipante</option>{people.map((person) => <option key={person.email} value={person.email}>{person.name}</option>)}</select>
              <button className="secondary-button" onClick={transfer} disabled={!transferOpen || !validTransfer}>Trasferisci</button>
            </div></div>
          </div>
        </div>
        <div className="danger-row"><span><Trash2 size={20} /></span><div><strong>Elimina definitivamente</strong><p>Rimuove viaggio, file e dati collegati.</p></div><button className="danger-button" onClick={remove}>Elimina</button></div>
      </> : <div className="danger-row"><span><LogOut size={20} /></span><div><strong>Esci dal viaggio</strong><p>Perderai l’accesso ai contenuti condivisi.</p></div><button className="danger-button" onClick={leave}>Esci</button></div>}
    </section>
  </main>;
}
