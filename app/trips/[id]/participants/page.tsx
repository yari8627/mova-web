"use client";

import styles from "./participants.module.css";
import boutique from "../itinerary.module.css";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Clock3, Copy, Pencil, Plus, Trash2, UserRound, Users, X } from "lucide-react";
import { TripCover } from "../../../components/trip-cover";
import { fetchTripSnapshot, readTripSnapshot, removeTripSnapshot } from "../../../../lib/trip-client-cache";
import { readPageCache, writePageCache } from "../../../../lib/page-cache";
import { useTripUserId } from "../../../components/trip-session";
import { TripTabs } from "../../../components/trip-tabs";
import { syncTripResource } from "../../../../lib/trip-sync";
import { useTripPermissions } from "../../../../lib/use-trip-permissions";

type Participant = { id: string; name: string; email: string; role: "owner" | "co-organizer" | "participant"; status: "confirmed" | "pending" };
const emptyDraft = { name: "", email: "", role: "participant" as Participant["role"], status: "pending" as Participant["status"] };

export default function ParticipantsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const userId = useTripUserId();
  const { canInvite, canAssignRoles } = useTripPermissions(id);
  const [people, setPeople] = useState<Participant[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  useEffect(() => {
    let cancelled = false;
    const snapshot = readTripSnapshot(id);
    const cached = readPageCache<Participant[]>(userId, `participants-${id}`);
    const cachedOwner: Participant[] = snapshot?.owner ? [{ id: `owner-${snapshot.owner.id}`, name: snapshot.owner.name, email: snapshot.owner.email, role: "owner", status: "confirmed" }] : [];
    setPeople(cached || (snapshot ? [...cachedOwner, ...snapshot.participants] : []));
    void fetchTripSnapshot(id).then((trip) => {
      if (!trip || cancelled) return;
      const owner: Participant | null = trip.owner ? { id: `owner-${trip.owner.id}`, name: trip.owner.name, email: trip.owner.email, role: "owner", status: "confirmed" } : null;
      const next = [...(owner ? [owner] : []), ...trip.participants] as Participant[];
      setPeople(next);
      writePageCache(userId, `participants-${id}`, next);
      window.localStorage.setItem(`mova-participants-${id}`, JSON.stringify(next));
    });
    return () => { cancelled = true; };
  }, [id, userId]);
  async function announce(next: Participant[]) {
    writePageCache(userId, `participants-${id}`, next);
    window.localStorage.setItem(`mova-participants-${id}`, JSON.stringify(next));
    removeTripSnapshot(id);
    const remote = await fetchTripSnapshot(id, true);
    if (remote) {
      const trips = readPageCache<Array<{ id: string; people: number }>>(userId, "trips");
      if (trips) writePageCache(userId, "trips", trips.map(trip => trip.id === id ? { ...trip, people: remote.people } : trip));
      try {
        const legacy = JSON.parse(localStorage.getItem("mova-trips") || "[]") as Array<{ id: string; people: number }>;
        localStorage.setItem("mova-trips", JSON.stringify(legacy.map(trip => trip.id === id ? { ...trip, people: remote.people } : trip)));
      } catch { /* Cache opzionale. */ }
    }
    window.dispatchEvent(new CustomEvent("mova-participants-updated", { detail: { tripId: id } }));
  }
  async function persist(next: Participant[]) {
    const previous = people;
    setPeople(next);
    if (await syncTripResource(id, "participants", next.filter(person => person.role !== "owner"))) await announce(next);
    else setPeople(previous);
  }
  function openNew() { if (!canInvite) return; setEditingId(null); setDraft({ ...emptyDraft, status: "pending" }); setShowEditor(true); }
  function openEdit(person: Participant) { setEditingId(person.id); setDraft({ name: person.name, email: person.email, role: person.role, status: person.status }); setShowEditor(true); }
  async function save() { if (!draft.email.trim() || (editingId && !draft.name.trim())) return; if (editingId) { persist(people.map((person) => person.id === editingId ? { ...person, ...draft } : person)); setShowEditor(false); return; } const response = await fetch(`/api/trips/${id}/invites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: draft.email, role: draft.role }) }); const result = await response.json(); if (!response.ok) return; const next = [...people.filter((person) => person.email.toLowerCase() !== result.participant.email.toLowerCase()), result.participant as Participant]; setPeople(next); announce(next); setInviteCode(result.code); setInviteLink(`${window.location.origin}${result.link}`); setShowEditor(false); }
  async function copyCode() { const value = inviteLink || inviteCode; if (!value) return; await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }

  return <main className={`trip-detail-shell participants-shell ${boutique.itinerary} ${styles.participants}`}>
    <header className="detail-topbar"><button className="detail-brand home-brand-button" onClick={() => router.push("/")} aria-label="Torna alla Home"><span>NAMI</span><small>TRAVEL</small></button></header>
    <TripCover tripId={id} />
    <div className="trip-swipe-body">
    <TripTabs tripId={id} />
    <div className={`expenses-title ${styles.titleRow}`}><div><p className="section-kicker">IL TUO GRUPPO</p><h1 className="trip-section-title">Partecipanti</h1><p>Organizza il viaggio insieme agli altri.</p></div>{canInvite && <button className="primary-button" onClick={openNew}><Plus size={18} /> Aggiungi</button>}</div>
    <div className="participants-grid">
      <section className="participants-panel" aria-label="Membri del gruppo"><div className={styles.groupSummary}><Users size={22} aria-hidden="true" /><div><h2>{people.length} {people.length === 1 ? "persona nel gruppo" : "persone nel gruppo"}</h2><p>Confermati {people.filter(person => person.status === "confirmed").length} · In attesa {people.filter(person => person.status === "pending").length}</p></div></div><div className="people-list">{people.map((person) => <article key={person.id}><div className="person-avatar" aria-hidden="true">{person.name.slice(0, 1).toUpperCase()}</div><div className={styles.personInfo}><strong>{person.name}</strong><span>{person.email}</span></div><span className={`status-chip ${person.status}`}>{person.status === "confirmed" ? <Check size={14} /> : <Clock3 size={14} />}{person.status === "confirmed" ? "Confermato" : "In attesa"}</span><div className={styles.personFooter}><span className={`role-chip ${person.role === "owner" ? styles.ownerRole : ""}`}>{person.role === "owner" ? "Proprietario" : person.role === "co-organizer" ? "Co-organizzatore" : "Partecipante"}</span>{canAssignRoles && person.role !== "owner" && <div className="person-actions"><button onClick={() => openEdit(person)} aria-label={`Modifica ${person.name}`} title="Modifica"><Pencil size={17} /></button><button onClick={() => persist(people.filter((item) => item.id !== person.id))} aria-label={`Rimuovi ${person.name}`} title="Rimuovi"><Trash2 size={17} /></button></div>}</div></article>)}</div></section>
      <aside className="invite-panel"><div className="invite-icon"><Users size={24} /></div><h2>Invita al viaggio</h2><p>{inviteCode ? "L’invito è stato inviato nell’app. Puoi anche copiare il link personale." : "Invita altre persone a organizzare il viaggio insieme a te."}</p>{canInvite && (inviteCode ? <><div className="invite-code"><strong>{inviteCode}</strong><button onClick={copyCode} aria-label="Copia link invito"><Copy size={18} /></button></div>{copied && <span className="copy-feedback" role="status"><Check size={14} /> Link copiato</span>}</> : <button className="secondary-button invite-email" onClick={openNew}><Plus size={18} /> Crea invito</button>)}</aside>
    </div>
    {showEditor && <div className="modal-backdrop" onMouseDown={() => setShowEditor(false)}><div className="modal participant-modal" role="dialog" aria-modal="true" aria-labelledby="participant-editor-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="section-kicker">PARTECIPANTE</p><h2 id="participant-editor-title">{editingId ? "Modifica persona" : "Nuovo invito"}</h2></div><button className="icon-button" onClick={() => setShowEditor(false)} aria-label="Chiudi"><X size={20} /></button></div><form className="trip-form" onSubmit={(event) => { event.preventDefault(); save(); }}>{editingId && <label>Nome<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nome del partecipante" required /></label>}<label>Email<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="nome@email.com" required /></label><label>Ruolo<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Participant["role"] })}><option value="participant">Partecipante</option>{canAssignRoles && <option value="co-organizer">Co-organizzatore</option>}</select></label>{!editingId && <div className="invite-status-note"><Clock3 size={18} /><span>Il nome verrà caricato dal profilo NAMI quando l’utente accetterà.</span></div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowEditor(false)}>Annulla</button><button type="submit" className="primary-button"><UserRound size={18} /> {editingId ? "Salva" : "Invia invito"}</button></div></form></div></div>}
  </div>
</main>;
}
