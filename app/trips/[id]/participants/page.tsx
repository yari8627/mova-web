"use client";

import { TripHeader } from "../../../components/trip-header";

import styles from "./participants.module.css";
import boutique from "../itinerary.module.css";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Clock3, Copy, LoaderCircle, Pencil, Plus, Trash2, UserRound, Users, X } from "lucide-react";
import { TripCover } from "../../../components/trip-cover";
import { fetchTripSnapshot, readTripSnapshot, removeTripSnapshot } from "../../../../lib/trip-client-cache";
import { readPageCache, writePageCache } from "../../../../lib/page-cache";
import { useTripUserId } from "../../../components/trip-session";
import { TripTabs } from "../../../components/trip-tabs";
import { syncTripResource } from "../../../../lib/trip-sync";
import { useTripPermissions } from "../../../../lib/use-trip-permissions";
import { createInviteSubmission, type InviteFeedback } from "../../../../lib/invite-submission";
import { PROGRESS_SCOPE_COOKIE } from "../../../../lib/progress-cache-contract";

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
  const [feedback, setFeedback] = useState<InviteFeedback>({ phase: "idle", message: "" });
  const live = useRef({ id, userId, canInvite, people });
  live.current = { id, userId, canInvite, people };
  const context = () => {
    const scope = typeof document === "undefined" ? "" : document.cookie.split(";").map(value => value.trim()).find(value => value.startsWith(`${PROGRESS_SCOPE_COOKIE}=`)) || "";
    return `${live.current.userId}:${live.current.id}:${scope}`;
  };
  const submission = useRef<ReturnType<typeof createInviteSubmission> | null>(null);
  const controllerScope = useRef(`${id}:${userId}`);
  if (controllerScope.current !== `${id}:${userId}`) { submission.current?.cancel(); submission.current = null; controllerScope.current = `${id}:${userId}`; }
  if (!submission.current) submission.current = createInviteSubmission({
    context, userId: () => live.current.userId, tripId: () => live.current.id,
    onState: setFeedback,
    onSuccess: result => {
      const acceptedContext = context();
      const next = [...live.current.people.filter(person => person.email.trim().toLowerCase() !== result.participant.email.trim().toLowerCase()), result.participant as Participant];
      live.current.people = next; setPeople(next);
      void announce(next, () => context() === acceptedContext).catch(() => undefined);
      setInviteCode(result.code); setInviteLink(`${window.location.origin}${result.link}`); setShowEditor(false); setDraft(emptyDraft);
    },
  });
  useEffect(() => {
    const active = submission.current;
    setFeedback({ phase: "idle", message: "" }); setInviteCode(""); setInviteLink(""); setShowEditor(false);
    return () => active?.cancel();
  }, [id, userId]);
  const inviteBusy = feedback.phase === "submitting" || Boolean(feedback.checking);

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
  async function announce(next: Participant[], current = () => true) {
    if (!current()) return;
    writePageCache(userId, `participants-${id}`, next);
    window.localStorage.setItem(`mova-participants-${id}`, JSON.stringify(next));
    removeTripSnapshot(id);
    const remote = await fetchTripSnapshot(id, true);
    if (!current()) return;
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
  function openNew() { if (!canInvite || !submission.current?.reset()) return; setEditingId(null); setDraft({ ...emptyDraft, status: "pending" }); setShowEditor(true); }
  function openEdit(person: Participant) { if (submission.current?.isBusy()) return; setEditingId(person.id); setDraft({ name: person.name, email: person.email, role: person.role, status: person.status }); setShowEditor(true); }
  function closeEditor() { if (!submission.current?.isBusy()) setShowEditor(false); }
  async function save() {
    if (!draft.email.trim() || (editingId && !draft.name.trim())) return;
    if (editingId) { persist(people.map(person => person.id === editingId ? { ...person, ...draft } : person)); setShowEditor(false); return; }
    if (!live.current.canInvite) return;
    await submission.current?.submit({ email: draft.email, role: draft.role }, feedback.resendOf);
  }
  async function copyCode() { const value = inviteLink || inviteCode; if (!value) return; await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }

  return <main className={`trip-detail-shell participants-shell ${boutique.itinerary} ${styles.participants}`}>
    <TripHeader tripId={id} />
    <TripCover tripId={id} />
    <div className="trip-swipe-body">
    <TripTabs tripId={id} />
    <div className={`expenses-title ${styles.titleRow}`}><div><p className="section-kicker">IL TUO GRUPPO</p><h1 className="trip-section-title">Partecipanti</h1><p>Organizza il viaggio insieme agli altri.</p></div>{canInvite && <button className="primary-button" onClick={openNew}><Plus size={18} /> Aggiungi</button>}</div>
    {!showEditor && feedback.message && <p className={styles.inviteFeedback} role="status" aria-live="polite">{feedback.message}</p>}
    <div className="participants-grid">
      <section className="participants-panel" aria-label="Membri del gruppo"><div className={styles.groupSummary}><Users size={22} aria-hidden="true" /><div><h2>{people.length} {people.length === 1 ? "persona nel gruppo" : "persone nel gruppo"}</h2><p>Confermati {people.filter(person => person.status === "confirmed").length} · In attesa {people.filter(person => person.status === "pending").length}</p></div></div><div className="people-list">{people.map((person) => <article key={person.id}><div className="person-avatar" aria-hidden="true">{person.name.slice(0, 1).toUpperCase()}</div><div className={styles.personInfo}><strong>{person.name}</strong><span>{person.email}</span></div><span className={`status-chip ${person.status}`}>{person.status === "confirmed" ? <Check size={14} /> : <Clock3 size={14} />}{person.status === "confirmed" ? "Confermato" : "In attesa"}</span><div className={styles.personFooter}><span className={`role-chip ${person.role === "owner" ? styles.ownerRole : ""}`}>{person.role === "owner" ? "Proprietario" : person.role === "co-organizer" ? "Co-organizzatore" : "Partecipante"}</span>{canAssignRoles && person.role !== "owner" && <div className="person-actions"><button onClick={() => openEdit(person)} aria-label={`Modifica ${person.name}`} title="Modifica"><Pencil size={17} /></button><button onClick={() => persist(people.filter((item) => item.id !== person.id))} aria-label={`Rimuovi ${person.name}`} title="Rimuovi"><Trash2 size={17} /></button></div>}</div></article>)}</div></section>
      <aside className="invite-panel"><div className="invite-icon"><Users size={24} /></div><h2>Invita al viaggio</h2><p>{inviteCode ? "L’invito è stato inviato nell’app. Puoi anche copiare il link personale." : "Invita altre persone a organizzare il viaggio insieme a te."}</p>{canInvite && (inviteCode ? <><div className="invite-code"><strong>{inviteCode}</strong><button onClick={copyCode} aria-label="Copia link invito"><Copy size={18} /></button></div>{copied && <span className="copy-feedback" role="status"><Check size={14} /> Link copiato</span>}</> : <button className="secondary-button invite-email" onClick={openNew}><Plus size={18} /> Crea invito</button>)}</aside>
    </div>
    {showEditor && <div className="modal-backdrop" onMouseDown={closeEditor}><div className="modal participant-modal" role="dialog" aria-modal="true" aria-labelledby="participant-editor-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="section-kicker">PARTECIPANTE</p><h2 id="participant-editor-title">{editingId ? "Modifica persona" : "Nuovo invito"}</h2></div><button className="icon-button" onClick={closeEditor} aria-label="Chiudi"><X size={20} /></button></div><form className="trip-form" aria-busy={!editingId && inviteBusy} onSubmit={(event) => { event.preventDefault(); save(); }}>{editingId && <label>Nome<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nome del partecipante" required /></label>}<label>Email<input type="email" disabled={!editingId && inviteBusy} value={draft.email} onChange={(event) => { setDraft({ ...draft, email: event.target.value }); if (feedback.resendOf) setFeedback({ phase: "idle", message: "" }); }} placeholder="nome@email.com" required /></label><label>Ruolo<select disabled={!editingId && inviteBusy} value={draft.role} onChange={(event) => { setDraft({ ...draft, role: event.target.value as Participant["role"] }); if (feedback.resendOf) setFeedback({ phase: "idle", message: "" }); }}><option value="participant">Partecipante</option>{canAssignRoles && <option value="co-organizer">Co-organizzatore</option>}</select></label>{!editingId && <div className="invite-status-note"><Clock3 size={18} /><span>Il nome verrà caricato dal profilo NAMI quando l’utente accetterà.</span></div>}{!editingId && <p className={styles.inviteFeedback} role="status" aria-live="polite" aria-atomic="true">{feedback.message}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={closeEditor}>Annulla</button><button type="submit" className={`primary-button ${!editingId ? styles.inviteSubmit : ""}`} disabled={!editingId && inviteBusy} aria-busy={!editingId && inviteBusy}>{!editingId && inviteBusy ? <LoaderCircle size={18} className={styles.inviteSpinner} aria-hidden="true" /> : <UserRound size={18} aria-hidden="true" />} {editingId ? "Salva" : inviteBusy ? "Invio in corso…" : feedback.resendOf ? "Reinvia invito" : feedback.phase === "uncertain" ? "Verifica e riprova" : "Invia invito"}</button></div></form></div></div>}
  </div>
</main>;
}
