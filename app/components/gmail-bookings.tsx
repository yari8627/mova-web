"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mail, X } from "lucide-react";
import type { BookingDraft, Candidate } from "../../lib/gmail-core";
import { mailInstant, splitMailInstant, type MailTime } from "../../lib/gmail-dates";
import { removeTripSnapshot } from "../../lib/trip-client-cache";
import { TravelCategoryIcon, travelCategoryFromText } from "./travel-category-icon";
import styles from "./gmail-bookings.module.css";

type Trip = { id: string; name: string; city: string };
type Row = { key: string; token: string; draft: BookingDraft; timing?: Candidate["timing"]; warnings: string[]; event: Candidate["event"]; email: { subject: string; from: string; date: string }; state: string; suggestedTripId: string | null; matches: { id: string; title: string; tripId: string }[]; selected?: boolean; tripId?: string; bookingId?: string };
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/gmail/${path}`, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Gmail non disponibile."); return data;
}
const dateString = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const kindNames = { flight: "Volo", hotel: "Alloggio", train: "Treno / bus / traghetto", car: "Noleggio auto", activity: "Attività" };
const eventNames = { confirmation: "Conferma", change: "Modifica comunicata", cancellation: "Cancellazione confermata", uncertain: "Stato incerto" };
function timeSummary(t?: MailTime, instant = "") { const v = t || splitMailInstant(instant); return !v.date && v.raw ? `${v.raw} (da verificare)` : [v.date ? v.date.split("-").reverse().join("/") : "", v.time, v.offset].filter(Boolean).join(" ") || "Da completare"; }
function warningsFor(row: Row) { return [...new Set(row.warnings)].filter(w=>!(w.startsWith("Inizio: verifica") && row.draft.startDate) && !(w.startsWith("Fine: verifica") && row.draft.endDate) && !(w === "Località da completare." && row.draft.location)); }
export function GmailBookings({ tripId, onImported }: { tripId: string; onImported: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [connected, setConnected] = useState(false), [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [rows, setRows] = useState<Row[]>([]), [trips, setTrips] = useState<Trip[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 12); return dateString(d); });
  const [to, setTo] = useState(() => dateString(new Date()));
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [examined, setExamined] = useState(0);
  const [searched, setSearched] = useState(false);
  const dialog = useRef<HTMLDivElement>(null), opener = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy); busyRef.current = busy;
  useEffect(() => {
    const u = new URL(window.location.href), status = u.searchParams.get("gmail");
    if (status === "connected" || status === "denied") {
      void begin(); u.searchParams.delete("gmail"); window.history.replaceState(null, "", `${u.pathname}${u.search}${u.hash}`);
      if (status === "denied") setNotice("Collegamento annullato. Nessuna email letta.");
    }
  // One explicit OAuth return, never an automatic mailbox search.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!open) return;
    const old = document.body.style.overflow; document.body.style.overflow = "hidden";
    const previous = document.activeElement as HTMLElement | null; dialog.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) { setRows([]); setOpen(false); }
      if (e.key === "Tab") {
        const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],summary') || []).filter(n=>n.getClientRects().length);
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = old; document.removeEventListener("keydown", key); previous?.focus(); };
  }, [open]);
  async function run(fn: () => Promise<void>) { if (busy) return; setBusy(true); setError(""); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Operazione non riuscita."); } finally { setBusy(false); } }
  async function begin() {
    setOpen(true); setRows([]); setNotice(""); setSearched(false); setCursor(null); setExamined(0);
    await run(async () => { const status = await api("connection"); setConnected(status.connected); setEmail(status.email || ""); });
  }
  async function search(next = false) {
    await run(async () => {
      const data = await api("search", "POST", { from, to, timeZone, ...(next && cursor ? { cursor } : {}) });
      setRows(previous => next ? [...previous, ...data.candidates.filter((r: Row) => !previous.some(p => p.key === r.key))] : data.candidates);
      setTrips(data.trips); setCursor(data.nextCursor); setSearched(true);
      const total = (next ? examined : 0) + data.examined; setExamined(total);
      setNotice(`${data.examined} email esaminate nell’intervallo in questa pagina · ${total} complessive.${data.outsideRange ? ` ${data.outsideRange} fuori intervallo o senza data di ricezione escluse.` : ""}${data.oversized ? ` ${data.oversized} email troppo grandi non esaminate.` : ""} Nessuna prenotazione è stata salvata.`);
    });
  }
  function edit(key: string, change: Partial<Row>) { setRows(current => current.map(r => r.key === key ? { ...r, ...change } : r)); }
  function field(row: Row, name: keyof BookingDraft, label: string, placeholder = "") {
    return <label className={styles.field}>{label}<input value={row.draft[name]} maxLength={500} placeholder={placeholder} onChange={e => edit(row.key, { draft: { ...row.draft, [name]: e.target.value } })} /></label>;
  }
  function timeFields(row: Row, which: "start" | "end", label: string) {
    const timing = row.timing || { start: splitMailInstant(row.draft.startDate), end: splitMailInstant(row.draft.endDate) }, value = timing[which];
    function update(part: keyof MailTime, content: string) {
      const next = { ...timing, [which]: { ...value, [part]: content } };
      edit(row.key, { timing: next, draft: { ...row.draft, [which === "start" ? "startDate" : "endDate"]: mailInstant(next[which]) } });
    }
    return <fieldset className={styles.timefields}><legend>{label}</legend><div className={styles.grid}>
      <label className={styles.field}>Data<input type="date" value={value.date} onInput={e=>update("date",e.currentTarget.value)} onChange={e=>update("date",e.target.value)} /></label>
      <label className={styles.field}>Ora<input type="time" step="1" value={value.time} onInput={e=>update("time",e.currentTarget.value)} onChange={e=>update("time",e.target.value)} /></label>
      <label className={styles.field}>Fuso dell’orario<input value={value.offset} placeholder="Es. +01:00 oppure Z" maxLength={6} onChange={e=>update("offset",e.target.value)} /></label>
    </div>{value.raw && <small>Testo originale: {value.raw}</small>}</fieldset>;
  }
  function resetSearch() { setCursor(null); setRows([]); setNotice(""); setSearched(false); setExamined(0); }
  async function confirm() {
    await run(async () => {
      const selected = rows.filter(r => r.selected);
      if (!selected.length) throw new Error("Seleziona almeno una prenotazione.");
      if (selected.some(r => !r.tripId)) throw new Error("Scegli il viaggio per ogni prenotazione selezionata.");
      if (selected.some(r=>!r.draft.startDate || (r.timing && Object.values(r.timing.end).some(Boolean) && !r.draft.endDate))) throw new Error("Completa data, ora e fuso nei dettagli delle prenotazioni selezionate, inclusa la fine quando presente nell’email.");
      const data = await api("import", "POST", { confirm: true, choices: selected.map(r => ({ token: r.token, draft: r.draft, tripId: r.tripId, action: r.bookingId ? "update" : "create", bookingId: r.bookingId })) });
      for (const id of new Set(selected.map(r => r.tripId!))) { removeTripSnapshot(id); window.localStorage.removeItem(`mova-bookings-${id}`); }
      setRows(current => current.map(r => data.results.some((s: { key: string; status: string }) => s.key === r.key && s.status !== "non importata") ? { ...r, selected: false, state: "Già presente" } : r));
      const imported = data.results.filter((r: { status: string }) => r.status === "importata").length;
      const updated = data.results.filter((r: { status: string }) => r.status === "aggiornata").length;
      const failed = data.results.filter((r: { status: string }) => r.status === "non importata");
      const skipped = rows.length - selected.length + data.results.filter((r: { status: string }) => r.status === "saltata: già presente").length;
      setNotice(`Importate: ${imported} · Aggiornate: ${updated} · Saltate/escluse: ${skipped} · Non importate: ${failed.length}.${failed.length ? ` ${failed.map((r: { error?: string }) => r.error).filter(Boolean).join(" ")}` : ""}`);
      await onImported();
    });
  }
  const selection = rows.filter(r => r.selected).length;
  return <>
    <button ref={opener} type="button" className={`secondary-button ${styles.trigger}`} onClick={() => void begin()}><Mail size={18} aria-hidden="true" />Importa da Gmail</button>
    {open && createPortal(<div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="gmail-title" className={styles.panel}>
      <div className={styles.inner}>
        <header className={styles.header}><div><p className="section-kicker">PRENOTAZIONI</p><h2 id="gmail-title">Importa da Gmail</h2><p>Cerca le conferme, verifica i dati e scegli cosa importare. NAMI salva soltanto dopo la tua conferma.</p></div><button type="button" className="icon-button" aria-label="Chiudi importazione Gmail" disabled={busy} onClick={() => { setRows([]); setOpen(false); }}><X /></button></header>
        <p>Le email vengono elaborate sul server NAMI, senza servizi AI esterni. Gli allegati PDF non sono letti in questa versione.</p>
        {connected ? <div className={styles.tools}><span>Gmail collegato: <strong>{email}</strong></span><button disabled={busy} className="secondary-button" onClick={() => void run(async () => { const r = await api("connection", "DELETE"); setConnected(false); setEmail(""); setRows([]); setCursor(null); setNotice(r.revoked ? "Gmail scollegato e token rimossi." : "Token rimossi da NAMI. Verifica anche la revoca nelle impostazioni del tuo account Google."); })}>Scollega Gmail</button></div> : <button disabled={busy} className="primary-button" onClick={() => void run(async () => { const result = await api("connect", "POST", { tripId }); window.location.assign(result.url); })}>Collega Gmail</button>}
        {connected && <><div className={styles.tools}><label className={styles.field}>Email dal<input type="date" disabled={busy} value={from} onInput={e => { setFrom(e.currentTarget.value); resetSearch(); }} onChange={e => { setFrom(e.target.value); resetSearch(); }} /></label><label className={styles.field}>Al<input type="date" disabled={busy} value={to} onInput={e => { setTo(e.currentTarget.value); resetSearch(); }} onChange={e => { setTo(e.target.value); resetSearch(); }} /></label><button className="primary-button" disabled={busy} onClick={() => void search()}>Cerca prenotazioni</button></div><p>Date di ricezione delle email, entrambe incluse · Fuso: {timeZone}. Non sono le date del viaggio.</p></>}
        {connected && <p>Verifica i dati mancanti in «Verifica e modifica». Date e orari non vengono completati automaticamente. Puoi confermare fino a 50 prenotazioni per volta.</p>}
        {error && <div role="alert" className={styles.warning}>{error}</div>}
        {notice && <div role="status" className={styles.notice}>{notice}</div>}
        {busy && <p role="status">Operazione in corso…</p>}
        {rows.length > 0 && <label><input type="checkbox" checked={rows.some(r => r.selected) && rows.filter(r => r.state !== "Già presente" && r.event !== "cancellation").every(r => r.selected)} onChange={e => setRows(current => current.map(r => ({ ...r, selected: r.state !== "Già presente" && r.event !== "cancellation" && e.target.checked })))} disabled={busy || rows.every(r => r.state === "Già presente" || r.event === "cancellation")} /> Seleziona tutte le prenotazioni importabili</label>}
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}><legend className={styles.srOnly}>Anteprima prenotazioni</legend>
        {rows.map(row => <article key={row.key} className={styles.card}>
          <div className={styles.cardhead}><input type="checkbox" aria-label={`Seleziona ${row.draft.title}`} checked={Boolean(row.selected)} disabled={row.state === "Già presente" || row.event === "cancellation"} onChange={e => edit(row.key, { selected: e.target.checked, tripId: row.tripId || row.suggestedTripId || undefined })} /><TravelCategoryIcon category={travelCategoryFromText(row.draft.type, row.draft.location)} size={22} /><div><h3>{row.draft.title || "Prenotazione da verificare"}</h3><span className={styles.badge}>{row.state}</span></div></div>
          <dl className={styles.summary}>
            <div><dt>Tipologia</dt><dd>{kindNames[row.draft.type]}</dd></div>
            <div><dt>Operatore</dt><dd>{row.draft.provider || "Da completare"}</dd></div>
            <div><dt>Inizio</dt><dd>{timeSummary(row.timing?.start,row.draft.startDate)}</dd></div>
            <div><dt>Fine</dt><dd>{timeSummary(row.timing?.end,row.draft.endDate)}</dd></div>
            <div><dt>Località</dt><dd>{row.draft.location || "Da completare"}</dd></div>
            <div><dt>Codice prenotazione</dt><dd>{row.draft.reference}</dd></div>
            <div><dt>Stato</dt><dd>{row.event === "confirmation" ? row.draft.status === "confirmed" ? "Confermata" : "Da confermare" : eventNames[row.event]}</dd></div>
          </dl>
          {row.event !== "confirmation" && row.event !== "uncertain" && <p className={styles.warning}>{row.event === "cancellation" ? "Cancellazione confermata: questa email non è importabile. Verifica la prenotazione esistente." : "Modifica comunicata: scegli la prenotazione da aggiornare."}</p>}
          {warningsFor(row).length > 0 && <ul className={styles.warning}>{warningsFor(row).map(w=><li key={w}>{w}</li>)}</ul>}
          <label className={styles.field}>Viaggio{row.suggestedTripId && !row.tripId && <small>Suggerito: {trips.find(t => t.id === row.suggestedTripId)?.name}; conferma la scelta.</small>}<select value={row.tripId || ""} onChange={e => edit(row.key, { tripId: e.target.value, bookingId: "" })}><option value="">Scegli un viaggio</option>{trips.map(t => <option key={t.id} value={t.id}>{t.name} · {t.city}</option>)}</select></label>
          {row.matches.length > 0 && <label className={styles.field}>Possibile aggiornamento<select value={row.bookingId || ""} onChange={e => edit(row.key, { bookingId: e.target.value, tripId: row.matches.find(m => m.id === e.target.value)?.tripId || row.tripId })}><option value="">Scegli la prenotazione da aggiornare</option>{row.matches.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select><small>Confermando, sostituirai i dati della prenotazione selezionata.</small></label>}
          <details className={styles.details}><summary>Verifica e modifica</summary>
          <div className={styles.grid}>
            {field(row, "title", "Nome prenotazione")}
            <label className={styles.field}>Tipologia<select value={row.draft.type} onChange={e => edit(row.key, { draft: { ...row.draft, type: e.target.value as BookingDraft["type"] } })}><option value="flight">Volo</option><option value="hotel">Hotel / alloggio</option><option value="train">Treno / bus / traghetto</option><option value="car">Auto a noleggio</option><option value="activity">Attività / escursione</option></select></label>
            <div className={styles.wide}>{timeFields(row,"start", "Inizio")}{timeFields(row,"end", "Fine (facoltativa)")}</div>
            {field(row, "provider", "Operatore")}{field(row, "reference", "Codice prenotazione / biglietto")}{field(row, "location", "Località / indirizzo")}
            {row.draft.type === "flight" && <>{field(row, "originAirport", "Aeroporto partenza")}{field(row, "destinationAirport", "Aeroporto arrivo")}</>}
            <label className={styles.field}>Stato<select value={row.draft.status} onChange={e => edit(row.key, { draft: { ...row.draft, status: e.target.value as BookingDraft["status"] } })}><option value="confirmed">Confermata</option><option value="pending">Da confermare</option></select></label>
            <label className={`${styles.field} ${styles.wide}`}>Note / dettagli estratti<textarea rows={3} maxLength={4000} value={row.draft.notes} onChange={e => edit(row.key, { draft: { ...row.draft, notes: e.target.value } })} /></label>
          </div><div className={styles.source}>Email originale: {row.email.subject} · {row.email.from} · Ricevuta: {new Date(row.email.date).toLocaleString()}</div></details>
        </article>)}</fieldset>
        {searched && !rows.length && <p>Nessuna prenotazione riconosciuta in questa pagina. Puoi ampliare il periodo o esaminare la pagina successiva.</p>}
        <div className={styles.footer}>{cursor && <button className="secondary-button" disabled={busy} onClick={() => void search(true)}>Esamina altre email</button>}<button className="primary-button" disabled={busy || !selection || selection > 50} onClick={() => void confirm()}>Conferma importazione ({selection})</button><button className="secondary-button" disabled={busy} onClick={() => { setRows([]); setOpen(false); }}>Annulla</button></div>
      </div>
    </div>, document.body)}
  </>;
}
