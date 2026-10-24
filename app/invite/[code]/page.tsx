"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, MapPin, Users } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { invalidatePageCache } from "../../../lib/page-cache";
import { removeTripSnapshot, setTripCacheAccount } from "../../../lib/trip-client-cache";

type Invite = { code: string; email: string; role: string; status: string; expired: boolean; canAccess?: boolean; user: { id: string; email: string } | null; trip: { id: string; name: string; country: string; city: string; startDate: string; endDate: string } };
const date = (value: string) => new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

export default function InvitePage() { const { code } = useParams<{ code: string }>(); const router = useRouter(); const [invite, setInvite] = useState<Invite | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const accepting = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    fetch(`/api/invites/${code}`, { cache: "no-store" }).then(async response => {
      const result = await response.json();
      if (cancelled) return;
      if (!response.ok) throw new Error(result.error);
      setInvite(result);
      if (result.canAccess && result.user?.id) {
        prepareTrip(result.user.id, result.trip.id);
        router.replace(`/trips/${result.trip.id}/overview`);
      }
    }).catch(reason => { if (!cancelled) setError(reason.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [code, router]);
  function prepareTrip(userId: string, tripId: string) {
    invalidatePageCache(userId, "trips");
    invalidatePageCache(userId, `access-${tripId}`);
    invalidatePageCache(userId, `participants-${tripId}`);
    setTripCacheAccount(userId); removeTripSnapshot(tripId);
  }
  async function accept() {
    if (!invite?.user) { router.push(`/auth?next=${encodeURIComponent(`/invite/${invite?.code || code}`)}`); return; }
    if (accepting.current) return;
    accepting.current = true;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/invites/${invite.code}/accept`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) { setError(result.error); return; }
      prepareTrip(result.userId, result.tripId);
      router.push(`/trips/${result.tripId}/overview`); router.refresh();
    } catch { setError("Non è stato possibile verificare l’accettazione. Riprova."); }
    finally { accepting.current = false; setLoading(false); }
  }
  if (loading && !invite) return <main className="invite-shell"><p>Caricamento invito…</p></main>;
  if (!invite) return <main className="invite-shell"><section className="invite-accept-card"><div className="auth-brand">NAMI</div><h1>Invito non disponibile</h1><p>{error}</p><button className="primary-button" onClick={() => router.push("/")}>Torna alla home</button></section></main>;
  const unavailable = invite.expired || invite.status !== "pending";
  return <main className="invite-shell"><section className="invite-accept-card"><div className="auth-brand">NAMI</div><p className="section-kicker">INVITO AL VIAGGIO</p><h1>{invite.trip.name}</h1><p>{invite.trip.country}</p><div className="invite-trip-meta"><span><MapPin size={18} /> {invite.trip.city}</span><span><CalendarDays size={18} /> {date(invite.trip.startDate)} – {date(invite.trip.endDate)}</span><span><Users size={18} /> Ruolo: {invite.role === "co-organizer" ? "Co-organizzatore" : "Partecipante"}</span></div>{error && <div className="auth-error">{error}</div>}{invite.status === "accepted" ? <div className="invite-accepted"><Check size={20} /> {invite.canAccess ? "Invito già accettato" : "Invito già utilizzato. Se il viaggio non è visibile, richiedi un nuovo invito al proprietario."}</div> : <button className="primary-button invite-accept-button" disabled={loading || unavailable} onClick={accept}>{invite.expired ? "Invito scaduto" : invite.user ? "Accetta e partecipa" : "Accedi per accettare"}</button>}<small>L’invito è riservato a {invite.email}</small></section></main>;
}
