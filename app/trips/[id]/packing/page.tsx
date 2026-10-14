"use client";

import styles from "./packing.module.css";
import boutique from "../itinerary.module.css";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BookOpen, Camera, Check, Droplets, FileText, Footprints, Glasses, Headphones, Luggage, Pill, Plug, Plus, Shirt, Smartphone, Sparkles, Sun, Trash2, Umbrella, Utensils, WalletCards } from "lucide-react";
import { TripCover } from "../../../components/trip-cover";
import { TripTabs } from "../../../components/trip-tabs";
import { readPageCache, writePageCache, fetchPageCache } from "../../../../lib/page-cache";
import { useTripUserId } from "../../../components/trip-session";
import { titleCaseItalian } from "../../../../lib/text-format";

type PackingItem = { id: string; label: string; packed: boolean; scope: "personal" | "shared" | "template"; createdBy?: string };

function sortPackingItems(items: PackingItem[]) {
  return [...items].sort((a, b) => Number(a.packed) - Number(b.packed));
}

function PackingIcon({ label }: { label: string }) {
  const value = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it");
  if (/caric|adattator|presa|cavo|power.?bank|batter/.test(value)) return <Plug size={18} />;
  if (/telefon|cellular|smartphone|tablet/.test(value)) return <Smartphone size={18} />;
  if (/cuffi|auricolar|airpod/.test(value)) return <Headphones size={18} />;
  if (/fotocamer|macchina fotograf|camera|gopro/.test(value)) return <Camera size={18} />;
  if (/passaport|document|carta ident|patente|bigliett|visto/.test(value)) return <FileText size={18} />;
  if (/portafogli|contant|soldi|carta di credito/.test(value)) return <WalletCards size={18} />;
  if (/magli|camici|pantalon|vestit|giacc|felpa|intim|costume/.test(value)) return <Shirt size={18} />;
  if (/scarp|sandali|ciabatt|stival/.test(value)) return <Footprints size={18} />;
  if (/medicin|farmac|compress|pillol|cerott/.test(value)) return <Pill size={18} />;
  if (/spazzolin|dentifric|shampoo|sapone|deodor|crema|igiene/.test(value)) return <Droplets size={18} />;
  if (/occhial/.test(value)) return <Glasses size={18} />;
  if (/ombrell|impermeabil/.test(value)) return <Umbrella size={18} />;
  if (/crema solare|protezione solare|cappell/.test(value)) return <Sun size={18} />;
  if (/libro|guida|quaderno/.test(value)) return <BookOpen size={18} />;
  if (/cibo|snack|panino|borraccia|acqua|posate/.test(value)) return <Utensils size={18} />;
  return <Luggage size={18} />;
}

export default function PackingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const userId = useTripUserId();
  const revision = useRef(0);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PackingItem[]>([]);
  const itemsRef = useRef<PackingItem[]>([]);
  const pendingRef = useRef(new Set<string>());
  const [pendingIds, setPendingIds] = useState(new Set<string>());
  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState<"personal" | "shared" | "template">("personal");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const packedCount = items.filter((item) => item.packed).length;

  const cacheKey = scope === "template" ? "packing-template" : `packing-${id}-${scope}`;
  const resourceRef = useRef("");
  resourceRef.current = `${userId}:${cacheKey}`;
  const busy = saving || pendingIds.size > 0;

  function updateItems(next: PackingItem[]) {
    const sorted = sortPackingItems(next);
    itemsRef.current = sorted;
    setItems(sorted);
    writePageCache(userId, cacheKey, sorted);
  }

  useEffect(() => {
    let cancelled = false;
    const version = ++revision.current;
    const cached = readPageCache<PackingItem[]>(userId, cacheKey);
    itemsRef.current = cached || [];
    setItems(itemsRef.current);
    setLoading(!cached);
    setError("");
    fetchPageCache<PackingItem[]>(userId, cacheKey, scope === "template" ? "/api/packing-template" : `/api/trips/${id}/packing?scope=${scope}`)
      .then((result) => {
        if (!result) throw new Error();
        if (!cancelled && version === revision.current) {
          const sorted = sortPackingItems(result);
          itemsRef.current = sorted;
          setItems(sorted);
          writePageCache(userId, cacheKey, sorted);
        }
      })
      .catch(() => { if (!cancelled) setError("Non è stato possibile aggiornare la lista. Riprova."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, scope, userId, cacheKey]);

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = draft.trim();
    if (!label || saving || loading || pendingRef.current.size > 0) return;
    revision.current++;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(scope === "template" ? "/api/packing-template" : `/api/trips/${id}/packing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, scope }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || "Non è stato possibile salvare l’oggetto. Riprova.");
        return;
      }
      updateItems([...items, result as PackingItem]);
      setDraft("");
    } catch {
      setError("Connessione non disponibile. Riprova tra poco.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleItem(item: PackingItem) {
    if (saving || loading || pendingRef.current.has(item.id)) return;
    const current = itemsRef.current.find((entry) => entry.id === item.id);
    if (!current) return;
    revision.current++;
    const resource = resourceRef.current;
    const packed = !current.packed;
    pendingRef.current.add(item.id);
    setPendingIds(new Set(pendingRef.current));
    setError("");
    updateItems(itemsRef.current.map((entry) => entry.id === item.id ? { ...entry, packed } : entry));
    try {
      const response = await fetch(`/api/trips/${id}/packing`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, packed }) });
      if (!response.ok) throw new Error();
    } catch {
      if (resourceRef.current === resource) {
        updateItems(itemsRef.current.map((entry) => entry.id === item.id ? { ...entry, packed: current.packed } : entry));
        setError("Modifica non salvata. Riprova.");
      }
    } finally {
      pendingRef.current.delete(item.id);
      setPendingIds(new Set(pendingRef.current));
    }
  }

  async function removeItem(itemId: string) {
    if (saving || loading || pendingRef.current.size > 0) return;
    revision.current++;
    setSaving(true);
    const previous = items;
    updateItems(items.filter((item) => item.id !== itemId));
    try {
      const response = await fetch(scope === "template" ? `/api/packing-template?itemId=${encodeURIComponent(itemId)}` : `/api/trips/${id}/packing?itemId=${encodeURIComponent(itemId)}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
    } catch { updateItems(previous); setError("Eliminazione non salvata. Riprova."); }
    finally { setSaving(false); }
  }

  async function applyStandardList() {
    if (saving || loading || pendingRef.current.size > 0) return;
    revision.current++;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/trips/${id}/packing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply-template" }) });
      if (!response.ok) throw new Error();
      const refreshed = await fetch(`/api/trips/${id}/packing?scope=personal`, { cache: "no-store" });
      if (!refreshed.ok) throw new Error();
      updateItems(await refreshed.json());
    } catch { setError("Non è stato possibile applicare la Lista Standard."); }
    finally { setSaving(false); }
  }

  return <main className={`trip-detail-shell packing-shell ${boutique.itinerary} ${styles.packing}`}>
    <header className="detail-topbar"><button className="detail-brand home-brand-button" onClick={() => router.push("/")} aria-label="Torna alla Home"><span>NAMI</span><small>TRAVEL</small></button></header>
    <TripCover tripId={id} />
    <div className="trip-swipe-body">
    <TripTabs tripId={id} />
    <div className="expenses-title"><p className="section-kicker">CHECKLIST</p><h1 className="trip-section-title">Cosa Portare</h1><p>Tutto quello che ti serve, pronto per partire.</p></div>
    <nav className="packing-scope-tabs" aria-label="Tipo di checklist">
      {([ ["personal", "Personale"], ["shared", "Condivisa"], ["template", "Lista Standard"] ] as const).map(([value, label]) => <button key={value} type="button" disabled={busy} className={scope === value ? "active" : undefined} aria-pressed={scope === value} onClick={() => setScope(value)}><strong>{label}</strong></button>)}
    </nav>
    <section className="packing-checklist"><header><div className="packing-heading-icon">{scope === "template" ? <Sparkles size={22} /> : <Luggage size={22} />}</div><div><p className="section-kicker">{scope === "personal" ? "LA TUA LISTA" : scope === "shared" ? "LISTA DEL GRUPPO" : "MODELLO PERSONALE"}</p><h2>{scope === "personal" ? "Le mie cose" : scope === "shared" ? "Cose condivise" : "Lista Standard"}</h2><p>{scope === "personal" ? "Solo tu puoi vedere e gestire questa checklist." : scope === "shared" ? "Tutti i partecipanti del viaggio possono vederla e aggiornarla." : "Questi oggetti saranno disponibili in ogni tuo viaggio."}</p></div>{scope === "template" ? <strong>{items.length} oggetti</strong> : <strong>{packedCount} di {items.length} pronti{!loading && items.length > 0 ? ` · ${Math.round(packedCount / items.length * 100)}%` : ""}</strong>}</header>
      {scope !== "template" && !loading && items.length > 0 && <div className={styles.progress} role="progressbar" aria-label="Oggetti pronti" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={packedCount}><span style={{width: `${packedCount / items.length * 100}%`}} /></div>}
      {scope === "personal" && <button className="secondary-button packing-apply-template" type="button" onClick={applyStandardList} disabled={busy || loading}><Sparkles size={17} /> Aggiungi Lista Standard</button>}
      <form onSubmit={addItem}><input value={draft} onChange={(event) => { setDraft(event.target.value); setError(""); }} maxLength={100} placeholder="Es. adattatore universale" aria-label="Oggetto da aggiungere alla checklist" autoFocus /><button className="primary-button" type="submit" disabled={!draft.trim() || busy || loading}><Plus size={17} /> {saving ? "Salvataggio…" : "Aggiungi"}</button></form>
      {error && <div className="auth-error packing-error" role="alert">{error}</div>}
      {loading ? <p role="status">Caricamento della lista…</p> : items.length > 0 ? <div className="packing-list">{items.map((item) => { const label = titleCaseItalian(item.label); return <article key={item.id} className={item.packed ? "packed" : ""}>{scope === "template" ? <span className="packing-template-marker"><Sparkles size={15} /></span> : <button disabled={saving || loading || pendingIds.has(item.id)} className="packing-toggle" onClick={() => toggleItem(item)} aria-label={item.packed ? `Segna ${label} come non pronto` : `Segna ${label} come pronto`} aria-pressed={item.packed}><span className={styles.checkVisual} aria-hidden="true">{item.packed && <Check size={15} />}</span></button>}<span className="packing-item-icon"><PackingIcon label={label} /></span><span className="packing-item-copy"><span className="packing-item-label">{label}</span>{scope === "shared" && item.createdBy && <small>Aggiunto da {item.createdBy}</small>}</span><button disabled={busy || loading} className="packing-remove" onClick={() => removeItem(item.id)} aria-label={`Rimuovi ${label}`}><Trash2 size={17} /></button></article>; })}</div> : <div className="packing-empty"><Luggage size={25} /><div><strong>{scope === "personal" ? "La tua checklist è vuota" : scope === "shared" ? "La checklist condivisa è vuota" : "La Lista Standard è vuota"}</strong><p>{scope === "personal" ? "Inizia aggiungendo il primo oggetto da portare." : scope === "shared" ? "Aggiungi qualcosa che può servire al gruppo." : "Aggiungi le cose che porti abitualmente in viaggio."}</p></div></div>}
    </section>
  </div>
</main>;
}
