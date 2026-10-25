"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, LoaderCircle, MailOpen, MapPin, Users } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { NamiWordmark } from "../../components/nami-wordmark";
import { createInviteAcceptance, type AcceptFeedback, type AcceptedInvite } from "../../../lib/invite-acceptance";
import { invalidatePageCache } from "../../../lib/page-cache";
import { removeTripSnapshot, setTripCacheAccount } from "../../../lib/trip-client-cache";
import styles from "./invite.module.css";

type Invite = { code: string; email: string; role: string; status: string; expired: boolean; canAccess?: boolean; user: { id: string; email: string } | null; trip: { id: string; name: string; country: string; city: string; startDate: string; endDate: string } };
const date = (value: string) => new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<AcceptFeedback>({ phase: "idle", message: "" });
  const [accepted, setAccepted] = useState<AcceptedInvite | null>(null);
  const acceptance = useRef<ReturnType<typeof createInviteAcceptance> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    acceptance.current?.cancel(); acceptance.current = null;
    setInvite(null); setAccepted(null); setLoading(true); setError("");
    setFeedback({ phase: "idle", message: "" });
    fetch(`/api/invites/${encodeURIComponent(code)}`, { cache: "no-store", signal: abort.signal }).then(async response => {
      const result = await response.json();
      if (cancelled) return;
      if (!response.ok) throw new Error(result.error || "Invito non disponibile");
      setInvite(result);
    }).catch(() => { if (!cancelled) setError("Non è stato possibile caricare l’invito. Verifica il collegamento e la connessione, poi riapri la pagina."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; abort.abort(); acceptance.current?.cancel(); };
  }, [code]);

  function prepareTrip(userId: string, tripId: string) {
    invalidatePageCache(userId, "trips");
    invalidatePageCache(userId, `access-${tripId}`);
    invalidatePageCache(userId, `participants-${tripId}`);
    setTripCacheAccount(userId); removeTripSnapshot(tripId);
  }
  function openTrip() {
    const userId = accepted?.userId || invite?.user?.id;
    const tripId = accepted?.tripId || (invite?.canAccess ? invite.trip.id : null);
    if (!userId || !tripId) return;
    prepareTrip(userId, tripId);
    router.push(`/trips/${tripId}/overview`); router.refresh();
  }
  async function accept() {
    if (!invite?.user) { router.push(`/auth?next=${encodeURIComponent(`/invite/${invite?.code || code}`)}`); return; }
    if (invite.user.email.trim().toLowerCase() !== invite.email.trim().toLowerCase() || invite.expired || invite.status !== "pending") return;
    if (!acceptance.current) acceptance.current = createInviteAcceptance({
      code: invite.code, userId: invite.user.id, tripId: invite.trip.id,
      onState: state => { setFeedback(state); setError(state.phase === "error" ? state.message : ""); },
      onSuccess: result => { prepareTrip(result.userId, result.tripId); setAccepted(result); },
    });
    await acceptance.current.accept();
  }

  const busy = feedback.phase === "accepting" || feedback.phase === "checking";
  const authorized = invite?.user && invite.user.email.trim().toLowerCase() === invite.email.trim().toLowerCase();
  const canOpen = Boolean(accepted || invite?.canAccess);
  const unavailable = Boolean(invite && (invite.expired || invite.status !== "pending"));
  const accountError = invite?.user && !authorized ? "Questo invito è destinato a un altro account. Accedi con l’indirizzo indicato nell’invito." : "";

  return <main className={styles.shell}>
    <header className={styles.header}><NamiWordmark /></header>
    <section className={styles.card} aria-labelledby="invite-title" aria-busy={loading || busy}>
      <div className={styles.emblem} aria-hidden="true"><MailOpen size={27} strokeWidth={1.5} /></div>
      <p className={styles.kicker}>INVITO AL VIAGGIO</p>
      <h1 id="invite-title" className={styles.title}>{!invite && !loading ? "Invito non disponibile" : "Un nuovo viaggio ti aspetta"}</h1>
      {loading ? <p className={styles.status} role="status"><LoaderCircle className={styles.spinner} size={20} aria-hidden="true" /> Caricamento invito…</p> : invite ? <>
        <p className={styles.intro}>Sei stato invitato a partecipare</p>
        <h2 className={styles.tripName}>{invite.trip.name}</h2>
        <dl className={styles.details}>
          <div><MapPin size={19} aria-hidden="true" /><dt>Destinazione</dt><dd>{[invite.trip.city, invite.trip.country].filter(Boolean).join(", ")}</dd></div>
          <div><CalendarDays size={19} aria-hidden="true" /><dt>Date</dt><dd>{date(invite.trip.startDate)} – {date(invite.trip.endDate)}</dd></div>
          <div><Users size={19} aria-hidden="true" /><dt>Ruolo assegnato</dt><dd>{invite.role === "co-organizer" ? "Co-organizzatore" : "Partecipante"}</dd></div>
        </dl>
        <div className={styles.feedback} role="status" aria-live="polite" aria-atomic="true">
          {canOpen ? <p className={styles.success}><Check size={20} aria-hidden="true" /> {accepted ? "Invito accettato!" : "Invito già accettato"}</p>
            : feedback.phase !== "error" && feedback.message ? <p className={busy ? styles.srOnly : undefined}>{feedback.message}</p>
            : unavailable ? <p>{invite.status === "accepted" ? "Invito già utilizzato. Se il viaggio non è visibile, richiedi un nuovo invito al proprietario." : invite.expired ? "Questo invito è scaduto." : "Questo invito è stato sostituito o revocato. Apri il collegamento più recente."}</p> : null}
        </div>
        {(error || accountError) && <p className={styles.error} role="alert">{error || accountError}</p>}
        {canOpen ? <button className={styles.cta} onClick={openTrip}>Apri il viaggio</button>
          : <button className={`invite-accept-button ${styles.cta}`} disabled={busy || unavailable || Boolean(accountError)} aria-busy={busy} onClick={accept}>
            {busy && <LoaderCircle size={19} className={styles.spinner} aria-hidden="true" />}
            {feedback.phase === "accepting" ? "Accettazione in corso…" : feedback.phase === "checking" ? "Verifica in corso…" : feedback.phase === "uncertain" ? "Verifica stato" : invite.expired ? "Invito scaduto" : invite.status !== "pending" ? "Invito non disponibile" : invite.user ? "Accetta l’invito" : "Accedi per accettare"}
          </button>}
        <small className={styles.reserved}>L’invito è riservato a {invite.email}</small>
      </> : <><p className={styles.error} role="alert">{error}</p><button className={styles.cta} onClick={() => router.push("/")}>Torna alla Home</button></>}
    </section>
  </main>;
}
