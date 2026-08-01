"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BookOpen, Camera, Check, Droplets, FileText, Footprints, Glasses, Headphones, Luggage, Pill, Plug, Plus, Shirt, Smartphone, Sun, Trash2, Umbrella, Utensils, WalletCards } from "lucide-react";
import { TripCover } from "../../../components/trip-cover";
import { TripTabs } from "../../../components/trip-tabs";
import { titleCaseItalian } from "../../../../lib/text-format";

type PackingItem = { id: string; label: string; packed: boolean; scope: "personal" | "shared"; createdBy?: string };

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
  const [items, setItems] = useState<PackingItem[]>([]);
  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState<"personal" | "shared">("personal");
  const packedCount = items.filter((item) => item.packed).length;

  useEffect(() => {
    setItems([]);
    fetch(`/api/trips/${id}/packing?scope=${scope}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then(setItems)
      .catch(() => undefined);
  }, [id, scope]);

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = draft.trim();
    if (!label) return;
    const response = await fetch(`/api/trips/${id}/packing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, scope }) });
    if (!response.ok) return;
    const item = await response.json() as PackingItem;
    setItems((current) => [...current, item]);
    setDraft("");
  }

  async function toggleItem(item: PackingItem) {
    const packed = !item.packed;
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, packed } : entry));
    const response = await fetch(`/api/trips/${id}/packing`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, packed }) });
    if (!response.ok) setItems((current) => current.map((entry) => entry.id === item.id ? item : entry));
  }

  async function removeItem(itemId: string) {
    const previous = items;
    setItems((current) => current.filter((item) => item.id !== itemId));
    const response = await fetch(`/api/trips/${id}/packing?itemId=${encodeURIComponent(itemId)}`, { method: "DELETE" });
    if (!response.ok) setItems(previous);
  }

  return <main className="trip-detail-shell packing-shell">
    <header className="detail-topbar"><button className="detail-brand home-brand-button" onClick={() => router.push("/")} aria-label="Torna alla Home">mova</button></header>
    <TripCover tripId={id} />
    <div className="expenses-title"><p className="section-kicker">CHECKLIST PERSONALE</p><h1>Cosa Portare</h1><p>Prepara la valigia e tieni sotto controllo tutto ciò che serve per il viaggio.</p></div>
    <TripTabs tripId={id} />
    <nav className="packing-scope-tabs" aria-label="Tipo di checklist"><button className={scope === "personal" ? "active" : undefined} onClick={() => setScope("personal")}><strong>Personale</strong><span>Visibile solo a te</span></button><button className={scope === "shared" ? "active" : undefined} onClick={() => setScope("shared")}><strong>Condivisa</strong><span>Visibile ai partecipanti</span></button></nav>
    <section className="packing-checklist"><header><div className="packing-heading-icon"><Luggage size={22} /></div><div><p className="section-kicker">{scope === "personal" ? "LA TUA LISTA" : "LISTA DEL GRUPPO"}</p><h2>{scope === "personal" ? "Le mie cose" : "Cose condivise"}</h2><p>{scope === "personal" ? "Solo tu puoi vedere e gestire questa checklist." : "Tutti i partecipanti del viaggio possono vederla e aggiornarla."}</p></div><strong>{packedCount} / {items.length}</strong></header>
      <form onSubmit={addItem}><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={100} placeholder="Es. adattatore universale" aria-label="Oggetto da aggiungere alla checklist" autoFocus /><button className="primary-button" type="submit" disabled={!draft.trim()}><Plus size={17} /> Aggiungi</button></form>
      {items.length > 0 ? <div className="packing-list">{items.map((item) => { const label = titleCaseItalian(item.label); return <article key={item.id} className={item.packed ? "packed" : ""}><button className="packing-toggle" onClick={() => toggleItem(item)} aria-label={item.packed ? `Segna ${label} come non pronto` : `Segna ${label} come pronto`} aria-pressed={item.packed}>{item.packed && <Check size={15} />}</button><span className="packing-item-icon"><PackingIcon label={label} /></span><span className="packing-item-copy"><span className="packing-item-label">{label}</span>{scope === "shared" && item.createdBy && <small>Aggiunto da {item.createdBy}</small>}</span><button className="packing-remove" onClick={() => removeItem(item.id)} aria-label={`Rimuovi ${label}`}><Trash2 size={17} /></button></article>; })}</div> : <div className="packing-empty"><Luggage size={25} /><div><strong>{scope === "personal" ? "La tua checklist è vuota" : "La checklist condivisa è vuota"}</strong><p>{scope === "personal" ? "Inizia aggiungendo il primo oggetto da portare." : "Aggiungi qualcosa che può servire al gruppo."}</p></div></div>}
    </section>
  </main>;
}
