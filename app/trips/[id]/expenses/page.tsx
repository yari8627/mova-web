"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CircleDollarSign, Pencil, Plus, ReceiptText, ShoppingBag, Trash2, Users, WalletCards, X } from "lucide-react";
import { TripCover } from "../../../components/trip-cover";
import { TripTabs } from "../../../components/trip-tabs";
import { TravelCategory, TravelCategoryIcon, travelCategoryFromText } from "../../../components/travel-category-icon";
import { syncTripSnapshot } from "../../../../lib/trip-sync";
import { useTripPermissions } from "../../../../lib/use-trip-permissions";
import { fetchTripSnapshot } from "../../../../lib/trip-client-cache";

type Expense = { id: string; description: string; amount: number; category: string; paidBy: string; date: string; sharedWith?: string[]; kind?: "expense" | "settlement"; recipient?: string; createdById?: string | null };
const starterExpenses: Expense[] = [
  { id: "hotel", description: "Hotel Tokyo Shinjuku", amount: 420, category: "Alloggio", paidBy: "Marco", date: "2027-08-03" },
  { id: "dinner", description: "Cena a Shibuya", amount: 135.6, category: "Ristoranti", paidBy: "Giulia", date: "2027-08-03" },
  { id: "train", description: "Treno Tokyo → Kyoto", amount: 276, category: "Trasporti", paidBy: "Luca", date: "2027-08-04" },
];

const todayLocal = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const emptyDraft = { description: "", amount: "", category: "Ristoranti", paidBy: "", date: todayLocal(), sharedWith: [] as string[], kind: "expense" as "expense" | "settlement", recipient: "" };
const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function normalizeSharedWith(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function normalizeExpense(item: Expense & { sharedWith?: unknown }): Expense {
  return {
    ...item,
    date: typeof item.date === "string" ? item.date.slice(0, 10) : todayLocal(),
    sharedWith: normalizeSharedWith(item.sharedWith),
  };
}

function expenseTravelCategory(expense: Expense): TravelCategory | null {
  if (expense.kind === "settlement") return null;
  const description = expense.description.toLocaleLowerCase("it");
  if (expense.category === "Ristoranti") return "food";
  if (expense.category === "Alloggio") return "hotel";
  if (expense.category === "Attività") return "activity";
  const detected = travelCategoryFromText(expense.category, description);
  if (expense.category === "Trasporti" && detected === "place") return "bus";
  return detected;
}

function ExpenseCategoryIcon({ expense }: { expense: Expense }) {
  if (expense.kind === "settlement") return <CircleDollarSign size={19} />;
  if (/shopping|souvenir|acquisto/.test(expense.description.toLocaleLowerCase("it"))) return <ShoppingBag size={19} />;
  const category = expenseTravelCategory(expense);
  return category ? <TravelCategoryIcon category={category} size={19} /> : <ReceiptText size={19} />;
}

const normalizedPersonName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function resolveParticipantName(value: string | undefined, participants: string[]) {
  if (!value) return "";
  const normalized = normalizedPersonName(value);
  const exact = participants.find((name) => normalizedPersonName(name) === normalized);
  if (exact) return exact;
  const firstToken = normalized.split(" ")[0];
  if (firstToken.length >= 4) {
    const matches = participants.filter((name) => {
      const candidate = normalizedPersonName(name).split(" ")[0];
      return candidate.startsWith(firstToken) || firstToken.startsWith(candidate);
    });
    if (matches.length === 1) return matches[0];
  }
  return value;
}

type GroupTransfer = { from: string; to: string; amount: number };

function calculateGroupBalances(expenses: Expense[], participants: string[]) {
  const cents = new Map(participants.map((name) => [name, 0]));
  for (const expense of expenses) {
    const amount = Math.round(Number(expense.amount) * 100);
    const payer = resolveParticipantName(expense.paidBy, participants);
    if (expense.kind === "settlement") {
      const recipient = resolveParticipantName(expense.recipient, participants);
      if (cents.has(payer)) cents.set(payer, (cents.get(payer) || 0) + amount);
      if (cents.has(recipient)) cents.set(recipient, (cents.get(recipient) || 0) - amount);
      continue;
    }
    if (cents.has(payer)) cents.set(payer, (cents.get(payer) || 0) + amount);
    const selected = [...new Set(normalizeSharedWith(expense.sharedWith).map((name) => resolveParticipantName(name, participants)).filter((name) => cents.has(name)))];
    const sharedWith = selected.length ? selected : participants;
    if (!sharedWith.length) continue;
    const baseShare = Math.floor(amount / sharedWith.length);
    let remainder = amount - baseShare * sharedWith.length;
    sharedWith.forEach((name) => {
      const share = baseShare + (remainder-- > 0 ? 1 : 0);
      cents.set(name, (cents.get(name) || 0) - share);
    });
  }

  const debtors = [...cents].filter(([, value]) => value < 0).map(([name, value]) => ({ name, cents: -value })).sort((a, b) => b.cents - a.cents);
  const creditors = [...cents].filter(([, value]) => value > 0).map(([name, value]) => ({ name, cents: value })).sort((a, b) => b.cents - a.cents);
  const transfers: GroupTransfer[] = [];
  let debtorIndex = 0; let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const amountToTransfer = Math.min(debtors[debtorIndex].cents, creditors[creditorIndex].cents);
    if (amountToTransfer > 0) transfers.push({ from: debtors[debtorIndex].name, to: creditors[creditorIndex].name, amount: amountToTransfer / 100 });
    debtors[debtorIndex].cents -= amountToTransfer;
    creditors[creditorIndex].cents -= amountToTransfer;
    if (!debtors[debtorIndex].cents) debtorIndex++;
    if (!creditors[creditorIndex].cents) creditorIndex++;
  }
  return { balances: [...cents].map(([name, value]) => ({ name, balance: value / 100 })), transfers };
}

export default function ExpensesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { canManage, role, userId, userName } = useTripPermissions(id);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [budget, setBudget] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(`mova-expenses-${id}`);
    const savedBudget = window.localStorage.getItem(`mova-budget-${id}`);
    const savedParticipants = window.localStorage.getItem(`mova-participants-${id}`);
    if (savedParticipants) { try { const parsed = JSON.parse(savedParticipants) as unknown; const names = (Array.isArray(parsed) ? parsed : []).map((person: { name?: string }) => person?.name).filter((name): name is string => Boolean(name)); setParticipants([...new Set(names)]); } catch { window.localStorage.removeItem(`mova-participants-${id}`); } }
    try { setExpenses(saved ? (JSON.parse(saved) as Expense[]).map(normalizeExpense) : []); } catch { setExpenses([]); }
    setBudget(savedBudget ? Number(savedBudget) : null);
    async function load() { const remote = await fetchTripSnapshot(id); if (remote) { const remoteExpenses = Array.isArray(remote.expenses) ? remote.expenses.map(normalizeExpense) : []; setExpenses(remoteExpenses); setBudget(remote.budget); const remoteParticipants = Array.isArray(remote.participants) ? remote.participants : []; const groupNames = [remote.owner?.name, ...remoteParticipants.map((person: { name?: string }) => person.name)].filter((name): name is string => Boolean(name)); const names = [...new Set<string>(groupNames.length ? groupNames : [userName])]; setParticipants(names); window.localStorage.setItem(`mova-participants-${id}`, JSON.stringify(remoteParticipants)); window.localStorage.setItem(`mova-expenses-${id}`, JSON.stringify(remoteExpenses)); } }
    void load();
  }, [id]);

  useEffect(() => { async function refreshParticipants() { try { const response = await fetch(`/api/trips/${id}`, { cache: "no-store" }); if (!response.ok) return; const remote = await response.json(); const groupNames = [remote.owner?.name, ...remote.participants.map((person: { name: string }) => person.name)].filter(Boolean); setParticipants([...new Set<string>(groupNames.length ? groupNames : [userName])]); window.localStorage.setItem(`mova-participants-${id}`, JSON.stringify(remote.participants)); } catch { /* Mantiene l'ultimo elenco valido. */ } } const onParticipantUpdate = (event: Event) => { const tripId = (event as CustomEvent<{ tripId?: string }>).detail?.tripId; if (!tripId || tripId === id) void refreshParticipants(); }; const onVisible = () => { if (document.visibilityState === "visible") void refreshParticipants(); }; window.addEventListener("mova-participants-updated", onParticipantUpdate); window.addEventListener("focus", refreshParticipants); document.addEventListener("visibilitychange", onVisible); return () => { window.removeEventListener("mova-participants-updated", onParticipantUpdate); window.removeEventListener("focus", refreshParticipants); document.removeEventListener("visibilitychange", onVisible); }; }, [id, userName]);

  const total = useMemo(() => expenses.filter((item) => item.kind !== "settlement").reduce((sum, item) => sum + item.amount, 0), [expenses]);
  const perPerson = participants.length ? total / participants.length : 0;
  const { transfers } = useMemo(() => calculateGroupBalances(expenses, participants), [expenses, participants]);

  function remember(next: Expense[]) {
    setExpenses(next);
    window.localStorage.setItem(`mova-expenses-${id}`, JSON.stringify(next));
  }

  function normalizeExpense(item: Expense & { sharedWith?: string | string[] }) {
    return { ...item, date: item.date.slice(0, 10), sharedWith: typeof item.sharedWith === "string" ? JSON.parse(item.sharedWith) : item.sharedWith } as Expense;
  }

  async function deleteExpense(expenseId: string) {
    setSaveError("");
    const response = await fetch(`/api/trips/${id}/expenses/${expenseId}`, { method: "DELETE" });
    if (!response.ok) { const result = await response.json().catch(() => ({})); setSaveError(result.error || "Non è stato possibile eliminare la spesa."); return; }
    remember(expenses.filter((item) => item.id !== expenseId));
  }

  function openNewExpense() {
    if (!role) return;
    setSaveError("");
    setEditingId(null);
    setDraft({ ...emptyDraft, date: todayLocal(), paidBy: userName || participants[0] || "", recipient: participants.find((name) => name !== userName) ?? participants[0] ?? "", sharedWith: [...participants], kind: "expense" });
    setShowAdd(true);
  }

  function openEditExpense(expense: Expense) {
    if (!canManage && expense.createdById !== userId) return;
    setSaveError("");
    setEditingId(expense.id);
    setDraft({ description: expense.description, amount: String(expense.amount).replace(".", ","), category: expense.category, paidBy: expense.paidBy, date: expense.date, sharedWith: expense.sharedWith?.length ? [...expense.sharedWith] : [...participants], kind: expense.kind ?? "expense", recipient: expense.recipient ?? participants.find((name) => name !== expense.paidBy) ?? "Marco" });
    setShowAdd(true);
  }

  async function saveExpense() {
    const amount = Number(draft.amount.replace(",", "."));
    if (!draft.description.trim() || !amount) return;
    if (draft.kind === "expense" && !draft.sharedWith.length) return;
    if (draft.kind === "settlement" && draft.paidBy === draft.recipient) return;
    const savedExpense = { description: draft.description.trim(), amount, category: draft.category, paidBy: draft.paidBy, date: editingId ? draft.date : todayLocal(), sharedWith: draft.sharedWith, kind: draft.kind, recipient: draft.kind === "settlement" ? draft.recipient : undefined };
    setSaving(true);
    setSaveError("");
    const endpoint = editingId ? `/api/trips/${id}/expenses/${editingId}` : `/api/trips/${id}/expenses`;
    let response: Response;
    try { response = await fetch(endpoint, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(savedExpense) }); }
    catch { setSaving(false); setSaveError("Connessione non disponibile. La spesa non è ancora stata salvata."); return; }
    const result = await response.json().catch(() => ({})); setSaving(false);
    if (!response.ok) { setSaveError(result.error || "Non è stato possibile salvare la spesa."); return; }
    const persistedExpense = normalizeExpense(result as Expense);
    remember(editingId ? expenses.map((item) => item.id === editingId ? persistedExpense : item) : [persistedExpense, ...expenses]);
    setDraft({ ...emptyDraft, paidBy: userName || participants[0] || "", recipient: participants.find((name) => name !== userName) ?? participants[0] ?? "", sharedWith: [...participants] });
    setEditingId(null);
    setShowAdd(false);
  }

  return <main className="trip-detail-shell expenses-shell">
    <header className="detail-topbar"><button className="detail-brand home-brand-button" onClick={() => router.push("/")} aria-label="Torna alla Home">mova</button>{role && <button className="primary-button" onClick={openNewExpense}><Plus size={18} /> Aggiungi</button>}</header>
    <TripCover tripId={id} />
    <div className="expenses-title"><p className="section-kicker">VIAGGIO</p><h1>Budget e spese</h1><p>Tieni sotto controllo i costi e dividili con il gruppo.</p></div>
    <TripTabs tripId={id} />

    <section className="budget-summary">
      <article><span>Budget totale <small>(opzionale)</small></span><label><span>€</span><input type="number" min="0" value={budget ?? ""} placeholder="—" onChange={(event) => { const value = event.target.value === "" ? null : Number(event.target.value); setBudget(value); if (value === null) window.localStorage.removeItem(`mova-budget-${id}`); else window.localStorage.setItem(`mova-budget-${id}`, String(value)); void syncTripSnapshot(id, { budget: value }); }} aria-label="Budget totale opzionale" /></label></article>
      <article><span>Totale speso</span><strong>{money.format(total)}</strong></article>
      <article><span>Budget residuo</span>{budget === null ? <strong className="budget-empty">Non impostato</strong> : <strong className={budget - total < 0 ? "negative" : "positive"}>{money.format(budget - total)}</strong>}</article>
      <article><span>Quota a persona</span><strong>{money.format(perPerson)}</strong></article>
    </section>

    <div className="expenses-grid">
      <section className="expenses-list-panel"><div className="panel-heading"><div><p className="section-kicker">MOVIMENTI</p><h2>Spese</h2></div><button className="primary-button" onClick={openNewExpense}><Plus size={18} /> Nuova spesa</button></div>
        {saveError && <div className="auth-error security-feedback">{saveError}</div>}
        <div className="expense-list">{expenses.map((expense) => { const currentSplitCount = expense.sharedWith?.filter((participant) => participants.includes(participant)).length || participants.length; const visualCategory = expenseTravelCategory(expense); return <article className="expense-row" key={expense.id}><div className={`expense-icon ${expense.kind === "settlement" ? "settlement" : visualCategory ? `booking-icon-${visualCategory}` : ""}`}><ExpenseCategoryIcon expense={expense} /></div><div><strong>{expense.description}</strong><span>{expense.kind === "settlement" ? `${expense.paidBy} → ${expense.recipient}` : `${expense.category} · Pagata da ${expense.paidBy} · Divisa tra ${currentSplitCount}`}</span></div><div className="expense-amount"><strong>{money.format(expense.amount)}</strong><span>{new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(new Date(`${expense.date}T12:00:00`))}</span></div><div className="expense-row-actions"><button onClick={() => openEditExpense(expense)} aria-label={`Modifica ${expense.description}`}><Pencil size={17} /></button><button className="row-delete" onClick={() => void deleteExpense(expense.id)} aria-label={`Elimina ${expense.description}`}><Trash2 size={17} /></button></div></article>; })}</div>
      </section>

      <aside className="balances-panel"><p className="section-kicker">SALDI DEL GRUPPO</p><h2>Saldi da regolare</h2>{transfers.length ? <><h3 className="balance-subtitle">Chi deve pagare</h3><div className="balance-list transfer-list">{transfers.map((item, index) => <div key={`pay-${item.from}-${item.to}-${index}`}><div className="balance-avatar">{item.from.slice(0, 1)}</div><span><b>{item.from}</b><small>Deve pagare {money.format(item.amount)} a {item.to}</small></span><strong className="negative">{money.format(item.amount)}</strong></div>)}</div><h3 className="balance-subtitle receiving">Chi deve ricevere</h3><div className="balance-list transfer-list">{transfers.map((item, index) => <div key={`receive-${item.from}-${item.to}-${index}`}><div className="balance-avatar receiving">{item.to.slice(0, 1)}</div><span><b>{item.to}</b><small>Deve ricevere {money.format(item.amount)} da {item.from}</small></span><strong className="positive">{money.format(item.amount)}</strong></div>)}</div></> : <div className="balances-settled"><CircleDollarSign size={22} /><strong>Tutti i saldi sono in pareggio</strong><span>Non sono necessari altri pagamenti.</span></div>}<div className="split-note"><Users size={19} /><p>Ogni spesa viene calcolata solo tra i partecipanti selezionati. Le regolazioni già registrate riducono automaticamente i saldi.</p></div></aside>
    </div>

    {showAdd && <div className="modal-backdrop" onMouseDown={() => setShowAdd(false)}><div className="modal expense-modal" role="dialog" aria-modal="true" aria-labelledby="expense-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="section-kicker">{draft.kind === "expense" ? "SPESA CONDIVISA" : "REGOLAZIONE SALDO"}</p><h2 id="expense-title">{editingId ? "Modifica movimento" : draft.kind === "expense" ? "Aggiungi spesa" : "Regola saldo"}</h2></div><button className="icon-button" onClick={() => setShowAdd(false)} aria-label="Chiudi"><X size={20} /></button></div><form className="trip-form" onSubmit={(event) => { event.preventDefault(); saveExpense(); }}>
      <div className="movement-type"><button type="button" className={draft.kind === "expense" ? "selected" : ""} onClick={() => setDraft({ ...draft, kind: "expense" })}>Dividi spesa</button><button type="button" className={draft.kind === "settlement" ? "selected" : ""} onClick={() => setDraft({ ...draft, kind: "settlement", description: draft.description || "Regolazione saldo" })}>Regola saldo</button></div>
      {draft.kind === "expense" && <label>Pagata da<select value={draft.paidBy} onChange={(event) => setDraft({ ...draft, paidBy: event.target.value })}>{participants.map((name) => <option key={name}>{name}</option>)}</select></label>}
      <label>Descrizione<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Es. Cena a Shinjuku" required /></label>
      <label>Importo (€)<input inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder="0,00" required /></label>
      {draft.kind === "expense" ? <><label>Categoria<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}><option>Ristoranti</option><option>Alloggio</option><option>Trasporti</option><option>Attività</option><option>Altro</option></select></label>
      <fieldset className="split-people"><legend>Dividi con ({draft.sharedWith.length})</legend><div>{participants.map((name) => { const selected = draft.sharedWith.includes(name); return <button type="button" className={selected ? "selected" : ""} key={name} onClick={() => setDraft({ ...draft, sharedWith: selected ? draft.sharedWith.filter((item) => item !== name) : [...draft.sharedWith, name] })}><span>{name.slice(0, 1)}</span>{name}{selected && <span className="split-check">✓</span>}</button>; })}</div>{!draft.sharedWith.length && <p>Seleziona almeno una persona.</p>}</fieldset>
      <div className="split-preview"><CircleDollarSign size={20} /><span>Quota per persona</span><strong>{draft.amount && draft.sharedWith.length ? money.format(Number(draft.amount.replace(",", ".")) / draft.sharedWith.length) : money.format(0)}</strong></div></> : <><div className="form-grid"><label>Chi paga<select value={draft.paidBy} onChange={(event) => setDraft({ ...draft, paidBy: event.target.value, recipient: event.target.value === draft.recipient ? participants.find((name) => name !== event.target.value) ?? "" : draft.recipient })}>{participants.map((name) => <option key={name}>{name}</option>)}</select></label><label>Chi riceve<select value={draft.recipient} onChange={(event) => setDraft({ ...draft, recipient: event.target.value })}>{participants.filter((name) => name !== draft.paidBy).map((name) => <option key={name}>{name}</option>)}</select></label></div><div className="settlement-note"><CircleDollarSign size={20} /><span>L’importo riduce il debito di {draft.paidBy} verso {draft.recipient} senza aumentare le spese del viaggio.</span></div></>}
      {saveError && <div className="auth-error security-feedback">{saveError}</div>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowAdd(false)} disabled={saving}>Annulla</button><button type="submit" className="primary-button" disabled={saving}><WalletCards size={18} /> {saving ? "Salvataggio…" : editingId ? "Salva modifiche" : "Salva spesa"}</button></div>
    </form></div></div>}
  </main>;
}
