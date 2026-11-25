"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tripCountries,placeLabel } from "../../lib/booking-place-search";
import { operatorLogo } from "../../lib/booking-view";
import { BookingToast } from "./booking-toast";
import { BookingForm } from "./booking-form";
import { BookingFields } from "./booking-fields";
import { BookingPlaceField,type BookingPlace } from "./booking-place-field";
import { suggestTrip } from "../../lib/gmail-geography";
import { X } from "lucide-react";
import { collectGmailPages, safeSearchTrace } from "../../lib/gmail-pagination";
import type { BookingDraft, Candidate } from "../../lib/gmail-core";
import { inLodgingZone, mailInstant, splitMailInstant, stayTimeText, type MailTime } from "../../lib/gmail-dates";
import { fetchTripSnapshot, removeTripSnapshot } from "../../lib/trip-client-cache";
import { TravelCategoryIcon, travelCategoryFromText } from "./travel-category-icon";
import styles from "./gmail-bookings.module.css";

type Trip = { id: string; name: string; city: string; country?:string; countryCode?:string; startDate?:string; endDate?:string };
type Row = { place?:BookingPlace; key: string; identityKey?: string; token: string; draft: BookingDraft; timing?: Candidate["timing"]; warnings: string[]; event: Candidate["event"]; email: { subject: string; from: string; date: string }; state: string; suggestedTripId: string | null; matches: { id: string; title: string; tripId: string; tripName?: string }[]; tripId?: string; bookingId?: string };
async function api(path: string, method = "GET", body?: unknown, signal?:AbortSignal) {
  const response = await fetch(`/api/gmail/${path}`, { method, signal, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  let data;try{data=await response.json();}catch{throw Object.assign(new Error("Risposta Gmail non disponibile."),{httpStatus:response.status});} if (!response.ok) throw Object.assign(new Error(data.error || "Gmail non disponibile."),{httpStatus:response.status}); return data;
}
const dateString = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const kindNames = { flight: "Volo", hotel: "Alloggio", train: "Treno / bus / traghetto", car: "Noleggio auto", activity: "Attività" };
const eventNames = { confirmation: "Conferma", change: "Modifica comunicata", cancellation: "Cancellazione confermata", uncertain: "Stato incerto" };
function timeSummary(t?: MailTime, instant = "") { const v = t || splitMailInstant(instant); return !v.date && v.raw ? `${v.raw} (da verificare)` : stayTimeText({...v,zone:undefined,offset:""}) || "Da completare"; }
function warningsFor(row: Row) { return [...new Set(row.warnings)].filter(w=>!(row.state==="Importabile" && w==="Controlla i dati estratti prima di confermare.") && !(w.startsWith("Inizio: verifica") && row.draft.startDate) && !(w.startsWith("Fine: verifica") && row.draft.endDate) && !(w === "Località da completare." && row.draft.location)); }
export function GmailBookings({ tripId, onImported, active = true }: { tripId: string; active?: boolean; onImported: (result?: { count: number; tripIds: string[] }) => Promise<void> }) {
  const [open, setOpen] = useState(false), [connected, setConnected] = useState(false), [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [diagnosticsArmed,setDiagnosticsArmed]=useState(false);
  const [diagnostics,setDiagnostics]=useState<ReturnType<typeof safeSearchTrace>[]>([]);
  const [diagnosticResult,setDiagnosticResult]=useState("");
  const diagnosticGeneration=useRef(0);
  function clearDiagnostics(){diagnosticGeneration.current++;setDiagnosticsArmed(false);setDiagnostics([]);setDiagnosticResult("");}
  const [success, setSuccess] = useState("");
  const [editing,setEditing]=useState<string | null>(null);
  const [counts,setCounts]=useState({excluded:0,duplicates:0});
  const [rows, setRows] = useState<Row[]>([]), [trips, setTrips] = useState<Trip[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 2); return dateString(d); });
  const [to, setTo] = useState(() => dateString(new Date()));
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [examined, setExamined] = useState(0);
  const [searched, setSearched] = useState(false);
  const dialog = useRef<HTMLDivElement>(null), opener = useRef<HTMLButtonElement>(null);
  const editorBox=useRef<HTMLDivElement>(null);
  const searchRequest=useRef<AbortController | null>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy); busyRef.current = busy;
  useEffect(() => { if (!active) { clearDiagnostics();searchRequest.current?.abort(); setSuccess(""); setNotice(""); setRows([]); setOpen(false); setSearched(false); setCursor(null); setExamined(0); setError(""); } }, [active]);
  useEffect(()=>()=>{diagnosticGeneration.current++;searchRequest.current?.abort();},[]);
  useEffect(()=>{if(editing){editorBox.current?.scrollIntoView?.({block:"start"});editorBox.current?.focus?.();}},[editing]);
  useEffect(()=>{if(error){errorBox.current?.scrollIntoView?.({block:"nearest"});errorBox.current?.focus?.();}},[error]);
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
      if (e.key === "Escape" && !busyRef.current) { cancel(); }
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
  async function run(fn: () => Promise<void>) { if (busyRef.current) return; busyRef.current=true; setBusy(true); setError(""); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Operazione non riuscita."); } finally { busyRef.current=false; setBusy(false); } }
  function cancel() { clearDiagnostics(); setEditing(null); setCounts({excluded:0,duplicates:0}); setRows([]); setCursor(null); setExamined(0); setSearched(false); setNotice(""); setError(""); setSuccess(""); setOpen(false); }
  async function begin() {
    setEditing(null);
    setCounts({excluded:0,duplicates:0});setOpen(true); setSuccess(""); setRows([]); setNotice(""); setSearched(false); setCursor(null); setExamined(0);
    await run(async () => { const status = await api("connection"); setConnected(status.connected); setEmail(status.email || ""); });
  }
  async function search() {
    await run(async()=>{
      const generation=++diagnosticGeneration.current;const diagnose=diagnosticsArmed;setDiagnosticsArmed(false);setDiagnostics([]);setDiagnosticResult("");
      searchRequest.current?.abort();const controller=new AbortController();searchRequest.current=controller;
      setRows([]);setEditing(null);setNotice("");setSearched(true);
      const result=await collectGmailPages<Row>(async(cursor,signal)=>{
        const data=await api("search","POST",{from,to,timeZone,...(diagnose?{diagnostics:true}:{}),...(cursor?{cursor}:{})},signal);
        return {...data,candidates:data.candidates.map((r:Row)=>({...r,tripId:r.suggestedTripId || undefined}))};
      },(rows,page)=>{setRows(rows);setTrips(page.trips as Trip[]);},{signal:controller.signal,onDiagnostic:diagnose?event=>{if(generation===diagnosticGeneration.current)setDiagnostics(current=>[...current,safeSearchTrace(event)]);}:undefined});
      if(diagnose && generation===diagnosticGeneration.current)setDiagnosticResult(result.partial?`partial:${result.reason}`:"complete");
      if(controller.signal.aborted)return;
      setNotice(`${result.rows.length} prenotazioni trovate`);
      if(result.partial)setError("Risultati parziali: non è stato possibile esaminare tutte le email dell’intervallo. Riprova la ricerca o restringi le date.");
    });
  }
  function edit(key: string, change: Partial<Row>) { setRows(current => current.map(r => r.key === key ? { ...r, ...change } : r)); }
  function field(row: Row, name: keyof BookingDraft, label: string, placeholder = "") {
    return <label className={styles.field}>{label}<input value={row.draft[name]} maxLength={500} placeholder={placeholder} onChange={e => edit(row.key, { draft: { ...row.draft, [name]: e.target.value } })} /></label>;
  }
  function timeFields(row: Row, which: "start" | "end", label: string) {
    const timing = row.timing || { start: splitMailInstant(row.draft.startDate), end: splitMailInstant(row.draft.endDate) }, value = timing[which];
    function update(part: keyof MailTime, content: string) {
      let changed = { ...value, [part]: content };
      if (value.zone && (part === "date" || part === "time")) changed = inLodgingZone({ ...changed, offset:"" },value.zone);
      if (part === "offset") changed.zone = undefined;
      const next = { ...timing, [which]: changed };
      edit(row.key, { timing: next, draft: { ...row.draft, [which === "start" ? "startDate" : "endDate"]: mailInstant(next[which]) } });
    }
    return <fieldset className={styles.timefields}><legend>{label}</legend><div className={styles.grid}>
      <label className={styles.field}>Data<input type="date" value={value.date} onInput={e=>update("date",e.currentTarget.value)} onChange={e=>update("date",e.target.value)} /></label>
      <label className={styles.field}>{value.qualifier === "after" ? "Ora: dopo le" : value.qualifier === "before" ? "Ora: entro le" : "Ora"}<input type="time" step="1" value={value.time} onInput={e=>update("time",e.currentTarget.value)} onChange={e=>update("time",e.target.value)} /></label>
    </div>{["flight","train"].includes(row.draft.type) && !value.offset && <BookingPlaceField countries={tripCountries(trips.find(t=>t.id===row.tripId))} value={which==="start"?row.draft.originAirport:row.draft.destinationAirport} onChange={v=>edit(row.key,{draft:{...row.draft,[which==="start"?"originAirport":"destinationAirport"]:v}})} onVerified={p=>verifiedPlace(row,p,which)}/>}{value.qualifier && <small>Questo è un limite orario del soggiorno, non un appuntamento.</small>}{(value.zone || value.raw) && <details><summary>Dettagli orario</summary><small>{value.zone} {value.offset}</small><small>{value.raw}</small></details>}</fieldset>;
  }
  function verifiedPlace(row:Row,p:BookingPlace,which?:"start"|"end") {
    const location=placeLabel(p.name,p.address);
    const timing=row.timing || {start:splitMailInstant(row.draft.startDate),end:splitMailInstant(row.draft.endDate)};
    const convert=(t:MailTime)=>p.timeZone?inLodgingZone({...t,offset:"",zone:undefined},p.timeZone):{...t,offset:"",zone:undefined};
    const transport=["flight","train"].includes(row.draft.type);
    const next={start:which==="end"?timing.start:convert(timing.start),end:which==="start" || (transport && !which)?timing.end:convert(timing.end)};
    const draft={...row.draft,...(which?{[which==="start"?"originAirport":"destinationAirport"]:location}:{location}),startDate:mailInstant(next.start),endDate:mailInstant(next.end)};
    const suggested=suggestTrip({...draft,startDate:draft.startDate || next.start.date,endDate:draft.endDate || next.end.date},trips.filter(t=>t.startDate && t.endDate).map(t=>({...t,country:t.country || "",startDate:t.startDate!,endDate:t.endDate!})));
    edit(row.key,{place:p,draft,timing:next,suggestedTripId:suggested,tripId:row.tripId && row.tripId!==row.suggestedTripId?row.tripId:suggested || undefined});
  }
  function resetSearch() { clearDiagnostics(); setCounts({excluded:0,duplicates:0}); setCursor(null); setRows([]); setNotice(""); setSearched(false); setExamined(0); }
  async function confirm() {
    await run(async () => {
      const selected = rows.filter(r => r.key===editing && r.state!=="Già presente" && r.event!=="cancellation");
      if (!selected.length) throw new Error("Apri una prenotazione da salvare.");
      const missingTrip=selected.find(r=>!r.tripId);
      if(missingTrip) throw new Error(`${missingTrip.draft.title}: scegli il viaggio nel campo Viaggio prima di confermare.`);
      if (selected.some(r=>!r.draft.startDate || (r.timing && Object.values(r.timing.end).some(Boolean) && !r.draft.endDate))) throw new Error("Completa data e ora, poi seleziona una località valida dai suggerimenti. Un orario ambiguo durante il cambio d’ora va corretto.");
      const data = await api("import", "POST", { confirm: true, choices: selected.map(r => ({ token: r.token, draft: r.draft, tripId: r.tripId, action: r.bookingId ? "update" : "create", bookingId: r.bookingId })) });
      for (const id of new Set(selected.map(r => r.tripId!))) { removeTripSnapshot(id); window.localStorage.removeItem(`mova-bookings-${id}`); }
      setRows(current => current.map(r => data.results.some((s: { key: string; status: string }) => s.key === r.key && s.status !== "non importata") ? { ...r, state: "Già presente" } : r));
      const imported = data.results.filter((r: { status: string }) => r.status === "importata").length;
      const updated = data.results.filter((r: { status: string }) => r.status === "aggiornata").length;
      const failed = data.results.filter((r: { status: string }) => r.status === "non importata");
      const skipped = rows.length - selected.length + data.results.filter((r: { status: string }) => r.status === "saltata: già presente").length;
      setNotice(`${[...new Set(selected.map(r=>trips.find(t=>t.id===r.tripId)?.name).filter(Boolean))].join(", ")} · Importate: ${imported} · Aggiornate: ${updated} · Saltate/escluse: ${skipped} · Non importate: ${failed.length}.${failed.length ? ` ${failed.map((r: { error?: string }) => r.error).filter(Boolean).join(" ")}` : ""}`);
      if (!failed.length && imported + updated > 0) {
        const tripIds = [...new Set(selected.filter(r=>data.results.some((v:{key:string;status:string})=>v.key===r.key && ["importata","aggiornata"].includes(v.status))).map(r=>r.tripId!))];
        await Promise.all(tripIds.map(id=>fetchTripSnapshot(id)));
        await onImported({count:imported+updated,tripIds});
        setSuccess(imported+updated===1?"1 prenotazione salvata":`${imported+updated} prenotazioni salvate`);
        setNotice(""); setOpen(false); setRows([]);
      } else if (imported + updated > 0) await onImported();
    });
  }
  return <>
    <button ref={opener} type="button" className={`primary-button booking-add-button ${styles.trigger}`} onClick={() => void begin()}><img src="/brands/gmail.svg" width={20} height={20} alt="" aria-hidden="true" />Importa da Gmail</button>
    {!open && success && <BookingToast message={success}/>}
    {open && createPortal(<div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="gmail-title" className={styles.panel}>
      <div className={styles.inner}>
        <header className={styles.header}><div><h2 id="gmail-title">Importa da Gmail</h2><p>Scegli il periodo in cui hai ricevuto le conferme di viaggio</p></div><button type="button" className="icon-button" aria-label="Chiudi importazione Gmail" disabled={busy} onClick={cancel}><X /></button></header>
        {connected ? <details className={styles.account}><summary>Account Gmail</summary><p>Gmail collegato: <strong>{email}</strong></p><button disabled={busy} className="secondary-button" onClick={() => void run(async () => { const r = await api("connection", "DELETE"); setConnected(false); setEmail(""); resetSearch(); setNotice(r.revoked ? "Gmail scollegato." : "Gmail scollegato da NAMI. Verifica la revoca nel tuo account Google."); })}>Scollega Gmail</button><p>Date di ricezione incluse · {timeZone}</p></details> : !busy && <button disabled={busy} className="primary-button" onClick={() => void run(async () => { const result = await api("connect", "POST", { tripId }); window.location.assign(result.url); })}>Collega Gmail</button>}
        {connected && <details className={styles.account}><summary>Diagnostica temporanea (facoltativa)</summary><p>Solo contatori e tempi, nessun contenuto email. Dati in memoria fino alla chiusura o al cambio date.</p><button disabled={busy} aria-pressed={diagnosticsArmed} onClick={()=>setDiagnosticsArmed(!diagnosticsArmed)}>{diagnosticsArmed?"Diagnostica autorizzata per la prossima ricerca":"Autorizzo la diagnostica per la prossima ricerca"}</button>{diagnostics.length>0 && <><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxWidth:"100%"}}>{JSON.stringify({result:diagnosticResult,requests:diagnostics},null,2)}</pre><button disabled={busy} onClick={clearDiagnostics}>Cancella diagnostica</button></>}</details>}
        {connected && <div className={`${styles.tools} ${styles.dateFilters}`}><label className={styles.field}>Email dal<input type="date" disabled={busy} value={from} onInput={e => { setFrom(e.currentTarget.value); resetSearch(); }} onChange={e => { setFrom(e.target.value); resetSearch(); }} /></label><label className={styles.field}>Al<input type="date" disabled={busy} value={to} onInput={e => { setTo(e.currentTarget.value); resetSearch(); }} onChange={e => { setTo(e.target.value); resetSearch(); }} /></label><button className="primary-button" disabled={busy} onClick={() => void search()}>Cerca prenotazioni</button></div>}

        {notice && <div role="status" className={styles.notice}>{notice}</div>}
        {busy && <p role="status">Caricamento…</p>}

        {searched && <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}><legend className={styles.srOnly}>Anteprima prenotazioni</legend>
        {rows.map(row => <article key={row.key} className={styles.card}>
          <div className={styles.compactHead}>
            <button type="button" className={styles.cardAction} aria-label={`Dettagli ${row.draft.title}`} aria-expanded={editing===row.key} onClick={()=>{if(row.state==="Già presente" && row.matches.length===1){const match=row.matches[0];window.location.assign(`/trips/${encodeURIComponent(match.tripId)}/bookings?booking=${encodeURIComponent(match.id)}`);return;}setEditing(row.key);if(row.state!=="Già presente" && row.event!=="cancellation")edit(row.key,{tripId:row.tripId || row.suggestedTripId || undefined});}}>
              <span className={styles.operator}>{operatorLogo(row.draft.provider)?<img src={`/brands/${operatorLogo(row.draft.provider)}.svg`} alt=""/>:<TravelCategoryIcon category={travelCategoryFromText(row.draft.type,row.draft.location)} size={24}/>}</span>
              <span className={styles.cardCopy}><strong>{row.draft.title || "Prenotazione da verificare"}</strong><span>{row.draft.provider}</span><span>{row.draft.type==="hotel"?"Check-in":["flight","train"].includes(row.draft.type)?"Partenza":"Inizio"}: {timeSummary(row.timing?.start,row.draft.startDate)}</span>{(row.draft.endDate || row.timing?.end.date || row.timing?.end.raw) && <span>{row.draft.type==="hotel"?"Check-out":["flight","train"].includes(row.draft.type)?"Arrivo":"Fine"}: {timeSummary(row.timing?.end,row.draft.endDate)}</span>}</span>
              {row.state==="Già presente"?<span className={styles.importedCheck} aria-label="Importata">✓</span>:row.state==="Da verificare"?<span className={styles.badge}>Da verificare</span>:null}
            </button>
          </div>
          {editing===row.key && row.state==="Già presente" && <div className={styles.savedDetail}><p>Prenotazione già importata.</p>{row.matches.map(match=><a key={match.id} href={`/trips/${encodeURIComponent(match.tripId)}/bookings?booking=${encodeURIComponent(match.id)}`}>Apri prenotazione esistente · {match.tripName || match.title}</a>)}{!row.matches.length && <p>Apri il viaggio associato dalla sezione Prenotazioni.</p>}<button type="button" onClick={()=>setEditing(null)}>Chiudi dettaglio</button></div>}
          {editing===row.key && row.state!=="Già presente" && <div ref={editorBox} tabIndex={-1}><BookingForm onSave={()=>void confirm()}><p>Provenienza Gmail</p>
          {row.event !== "confirmation" && row.event !== "uncertain" && <p className={styles.warning}>{row.event === "cancellation" ? "Cancellazione confermata: questa email non è importabile. Verifica la prenotazione esistente." : "Modifica comunicata: scegli la prenotazione da aggiornare."}</p>}
          {warningsFor(row).length > 0 && <ul className={styles.warning}>{warningsFor(row).map(w=><li key={w}>{w}</li>)}</ul>}
          <label className={styles.field}>Viaggio{row.suggestedTripId && row.tripId === row.suggestedTripId && <small>Suggerito: {trips.find(t => t.id === row.suggestedTripId)?.name}; puoi modificarlo.</small>}<select value={row.tripId || ""} onChange={e => edit(row.key, { tripId: e.target.value, bookingId: "" })}><option value="">Scegli un viaggio</option>{trips.map(t => <option key={t.id} value={t.id}>{t.name} · {t.city}</option>)}</select></label>
          {row.matches.length > 0 && <label className={styles.field}>Possibile aggiornamento<select value={row.bookingId || ""} onChange={e => edit(row.key, { bookingId: e.target.value, tripId: row.matches.find(m => m.id === e.target.value)?.tripId || row.tripId })}><option value="">Scegli la prenotazione da aggiornare</option>{row.matches.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select><small>Confermando, sostituirai i dati della prenotazione selezionata.</small></label>}
          <BookingFields countries={tripCountries(trips.find(t=>t.id===row.tripId))} value={row.draft} onChange={change=>{const draft={...row.draft,...change} as BookingDraft;if(change.location!==undefined){const timing=row.timing || {start:splitMailInstant(draft.startDate),end:splitMailInstant(draft.endDate)};edit(row.key,{place:undefined,draft:{...draft,startDate:"",endDate:""},timing:{start:{...timing.start,offset:"",zone:undefined},end:{...timing.end,offset:"",zone:undefined}}});}else edit(row.key,{draft});}} onVerified={p=>verifiedPlace(row,p)}/>
          <div>{timeFields(row,"start","Inizio")}{timeFields(row,"end","Fine (facoltativa)")}</div>
          {["flight","train"].includes(row.draft.type) && <>{field(row,"originAirport","Partenza")}{field(row,"destinationAirport","Arrivo")}</>}
          {error && <div role="alert" className={styles.warning}>{error}</div>}
          <button type="submit" className="primary-button" disabled={busy || row.state==="Già presente"}>Salva prenotazione</button>
          <button type="button" className="secondary-button" onClick={()=>{setEditing(null);}}>Annulla modifica</button>
          </BookingForm></div>}

        </article>)}</fieldset>}
        {error && <div ref={errorBox} tabIndex={-1} role="alert" className={styles.warning}>{error}</div>}
        {searched && <div className={styles.footer}><button className="secondary-button" disabled={busy} onClick={() => { cancel(); }}>Annulla</button></div>}
      </div>
    </div>, document.body)}
  </>;
}
