"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Check, MapPin, Users } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

type Invite = { code: string; email: string; role: string; status: string; expired: boolean; user: { email: string } | null; trip: { id: string; name: string; country: string; city: string; startDate: string; endDate: string } };
const date = (value: string) => new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

export default function InvitePage() { const { code } = useParams<{ code: string }>(); const router = useRouter(); const [invite, setInvite] = useState<Invite | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => { fetch(`/api/invites/${code}`).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); setInvite(result); }).catch((reason) => setError(reason.message)).finally(() => setLoading(false)); }, [code]);
  async function accept() { if (!invite?.user) { router.push(`/auth?next=${encodeURIComponent(`/invite/${invite?.code || code}`)}`); return; } setLoading(true); setError(""); const response = await fetch(`/api/invites/${invite.code}/accept`, { method: "POST" }); const result = await response.json(); setLoading(false); if (!response.ok) { setError(result.error); return; } router.push(`/trips/${result.tripId}/overview`); router.refresh(); }
  if (loading && !invite) return <main className="invite-shell"><p>Caricamento invito…</p></main>;
  if (!invite) return <main className="invite-shell"><section className="invite-accept-card"><div className="auth-brand">mova</div><h1>Invito non disponibile</h1><p>{error}</p><button className="primary-button" onClick={() => router.push("/")}>Torna alla home</button></section></main>;
  const unavailable = invite.expired || invite.status !== "pending";
  return <main className="invite-shell"><section className="invite-accept-card"><div className="auth-brand">mova</div><p className="section-kicker">INVITO AL VIAGGIO</p><h1>{invite.trip.name}</h1><p>{invite.trip.country}</p><div className="invite-trip-meta"><span><MapPin size={18} /> {invite.trip.city}</span><span><CalendarDays size={18} /> {date(invite.trip.startDate)} – {date(invite.trip.endDate)}</span><span><Users size={18} /> Ruolo: {invite.role === "co-organizer" ? "Co-organizzatore" : "Partecipante"}</span></div>{error && <div className="auth-error">{error}</div>}{invite.status === "accepted" ? <div className="invite-accepted"><Check size={20} /> Invito già accettato</div> : <button className="primary-button invite-accept-button" disabled={loading || unavailable} onClick={accept}>{invite.expired ? "Invito scaduto" : invite.user ? "Accetta e partecipa" : "Accedi per accettare"}</button>}<small>L’invito è riservato a {invite.email}</small></section></main>;
}
