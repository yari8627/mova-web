"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Clock3, Copy, Pencil, Plus, Trash2, UserRound, Users, X } from "lucide-react";
import { TripCover } from "../../../components/trip-cover";
import { TripTabs } from "../../../components/trip-tabs";
import { syncTripResource } from "../../../../lib/trip-sync";
import { useTripPermissions } from "../../../../lib/use-trip-permissions";

type Participant = { id: string; name: string; email: string; role: "owner" | "co-organizer" | "participant"; status: "confirmed" | "pending" };
const emptyDraft = { name: "", email: "", role: "participant" as Participant["role"], status: "pending" as Participant["status"] };

export default function ParticipantsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { canInvite, canAssignRoles } = useTripPermissions(id);
  const [people, setPeople] = useState<Participant[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  useEffect(() => { async function load() { const saved = window.localStorage.getItem(`mova-participants-${id}`); const localItems = saved ? JSON.parse(saved) as Participant[] : []; try { const response = await fetch(`/api/trips/${id}`); if (response.ok) { const trip = await response.json(); const owner = trip.owner ? { id: `owner-${trip.owner.id}`, name: trip.owner.name, email: trip.owner.email, role: "owner" as const, status: "confirmed" as const } : null; const remoteItems = [owner, ...(trip.participants as Participant[])].filter(Boolean) as Participant[]; setPeople(remoteItems); window.localStorage.setItem(`mova-participants-${id}`, JSON.stringify(remoteItems)); return; } } catch { /* Usa la cache locale. */ } setPeople(localItems); } void load(); }, [id]);
  function announce(next: Participant[]) { window.localStorage.setItem(`mova-participants-${id}`, JSON.stringify(next)); window.dispatchEvent(new CustomEvent("mova-participants-updated", { detail: { tripId: id } })); }
  function persist(next: Participant[]) { setPeople(next); announce(next); syncTripResource(id, "participants", next.filter((person) => person.role !== "owner")); }
  function openNew() { if (!canInvite) return; setEditingId(null); setDraft({ ...emptyDraft, status: "pending" }); setShowEditor(true); }
  function openEdit(person: Participant) { setEditingId(person.id); setDraft({ name: person.name, email: person.email, role: person.role, status: person.status }); setShowEditor(true); }
  async function save() { if (!draft.email.trim() || (editingId && !draft.name.trim())) return; if (editingId) { persist(people.map((person) => person.id === editingId ? { ...person, ...draft } : person)); setShowEditor(false); return; } const response = await fetch(`/api/trips/${id}/invites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: draft.email, role: draft.role }) }); const result = await response.json(); if (!response.ok) return; const next = [...people.filter((person) => person.email.toLowerCase() !== result.participant.email.toLowerCase()), result.participant as Participant]; setPeople(next); announce(next); setInviteCode(result.code); setInviteLink(`${window.location.origin}${result.link}`); setShowEditor(false); }
  async function copyCode() { const value = inviteLink || inviteCode; if (!value) return; await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }

  return <main className="trip-detail-shell participants-shell">
    <header className="detail-topbar"><button className="detail-brand home-brand-button" onClick={() => router.push("/")} aria-label="Torna alla Home">mova</button>{canInvite && <button className="primary-button" onClick={openNew}><Plus size={18} /> Invita</button>}</header>
    <TripCover tripId={id} />
    <div className="expenses-title"><p className="section-kicker">COLLABORAZIONE</p><h1>Partecipanti</h1><p>Invita il gruppo e assegna i permessi di organizzazione.</p></div>
    <TripTabs tripId={id} />
    <div className="participants-grid">
      <section className="participants-panel"><div className="panel-heading"><div><p className="section-kicker">GRUPPO</p><h2>{people.length} persone</h2></div>{canInvite && <button className="primary-button" onClick={openNew}><Plus size={18} /> Aggiungi</button>}</div><div className="people-list">{people.map((person) => <article key={person.id}><div className="person-avatar">{person.name.slice(0, 1).toUpperCase()}</div><div><strong>{person.name}</strong><span>{person.email}</span></div><span className={`status-chip ${person.status}`}>{person.status === "confirmed" ? <Check size={14} /> : <Clock3 size={14} />}{person.status === "confirmed" ? "Confermato" : "In attesa"}</span><span className="role-chip">{person.role === "owner" ? "Proprietario" : person.role === "co-organizer" ? "Co-organizzatore" : "Partecipante"}</span>{canAssignRoles && person.role !== "owner" && <div className="person-actions"><button onClick={() => openEdit(person)} aria-label={`Modifica ${person.name}`}><Pencil size={17} /></button><button onClick={() => persist(people.filter((item) => item.id !== person.id))} aria-label={`Rimuovi ${person.name}`}><Trash2 size={17} /></button></div>}</article>)}</div></section>
      <aside className="invite-panel"><div className="invite-icon"><Users size={27} /></div><h2>Invita al viaggio</h2><p>{inviteCode ? "L’invito è stato inviato nell’app. Puoi anche copiare il link personale." : "Inserisci l’email e scegli il ruolo. Il nome arriverà dal profilo quando l’invito sarà accettato."}</p>{inviteCode ? <><div className="invite-code"><strong>{inviteCode}</strong><button onClick={copyCode} aria-label="Copia link invito"><Copy size={18} /></button></div>{copied && <span className="copy-feedback"><Check size={14} /> Link copiato</span>}</> : <button className="secondary-button invite-email" onClick={openNew}><Plus size={18} /> Crea invito</button>}</aside>
    </div>
    {showEditor && <div className="modal-backdrop" onMouseDown={() => setShowEditor(false)}><div className="modal participant-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="section-kicker">PARTECIPANTE</p><h2>{editingId ? "Modifica persona" : "Nuovo invito"}</h2></div><button className="icon-button" onClick={() => setShowEditor(false)} aria-label="Chiudi"><X size={20} /></button></div><form className="trip-form" onSubmit={(event) => { event.preventDefault(); save(); }}>{editingId && <label>Nome<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nome del partecipante" required /></label>}<label>Email<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="nome@email.com" required /></label><label>Ruolo<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Participant["role"] })}><option value="participant">Partecipante</option><option value="co-organizer">Co-organizzatore</option></select></label>{!editingId && <div className="invite-status-note"><Clock3 size={18} /><span>Il nome verrà caricato dal profilo MOVA quando l’utente accetterà.</span></div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowEditor(false)}>Annulla</button><button type="submit" className="primary-button"><UserRound size={18} /> {editingId ? "Salva" : "Invia invito"}</button></div></form></div></div>}
  </main>;
}
