"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, Luggage, Plus, Trash2 } from "lucide-react";
import { TripCover } from "../../../components/trip-cover";
import { TripTabs } from "../../../components/trip-tabs";
import { titleCaseItalian } from "../../../../lib/text-format";

type PackingItem = { id: string; label: string; packed: boolean };

export default function PackingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [items, setItems] = useState<PackingItem[]>([]);
  const [draft, setDraft] = useState("");
  const packedCount = items.filter((item) => item.packed).length;

  useEffect(() => {
    fetch(`/api/trips/${id}/packing`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then(setItems)
      .catch(() => undefined);
  }, [id]);

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = draft.trim();
    if (!label) return;
    const response = await fetch(`/api/trips/${id}/packing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
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
    <section className="packing-checklist"><header><div className="packing-heading-icon"><Luggage size={22} /></div><div><p className="section-kicker">LA TUA LISTA</p><h2>Cosa portare in viaggio</h2><p>Aggiungi ciò che vuoi mettere in valigia e spuntalo quando è pronto.</p></div><strong>{packedCount} / {items.length}</strong></header>
      <form onSubmit={addItem}><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={100} placeholder="Es. adattatore universale" aria-label="Oggetto da aggiungere alla checklist" autoFocus /><button className="primary-button" type="submit" disabled={!draft.trim()}><Plus size={17} /> Aggiungi</button></form>
      {items.length > 0 ? <div className="packing-list">{items.map((item) => { const label = titleCaseItalian(item.label); return <article key={item.id} className={item.packed ? "packed" : ""}><button className="packing-toggle" onClick={() => toggleItem(item)} aria-label={item.packed ? `Segna ${label} come non pronto` : `Segna ${label} come pronto`} aria-pressed={item.packed}>{item.packed && <Check size={15} />}</button><span>{label}</span><button className="packing-remove" onClick={() => removeItem(item.id)} aria-label={`Rimuovi ${label}`}><Trash2 size={17} /></button></article>; })}</div> : <div className="packing-empty"><Luggage size={25} /><div><strong>La checklist è vuota</strong><p>Inizia aggiungendo il primo oggetto da portare.</p></div></div>}
    </section>
  </main>;
}
