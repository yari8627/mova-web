
export type BalanceExpense = { amount: number; paidBy: string; sharedWith?: unknown; kind?: "expense" | "settlement"; recipient?: string };
export function normalizeSharedWith(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
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


export function calculateGroupBalances(expenses: BalanceExpense[], participants: string[]) {
  const pairs = new Map<string, { from: string; to: string; cents: number }>();
  const addDebt = (from: string, to: string, amount: number) => {
    if (!from || !to || from === to) return;
    const [first, second] = [from, to].sort();
    const key = JSON.stringify([first, second]);
    const pair = pairs.get(key) ?? { from: first, to: second, cents: 0 };
    pair.cents += from === first ? amount : -amount;
    pairs.set(key, pair);
  };
  for (const expense of expenses) {
    const amount = Math.round(Number(expense.amount) * 100);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const payer = resolveParticipantName(expense.paidBy, participants);
    if (expense.kind === "settlement") {
      addDebt(payer, resolveParticipantName(expense.recipient, participants), -amount);
      continue;
    }
    if (!payer) continue;
    const selected = [...new Set(normalizeSharedWith(expense.sharedWith).map(name => resolveParticipantName(name, participants)).filter(Boolean))];
    const sharedWith = selected.length ? selected : [...new Set(participants)];
    if (!sharedWith.length) continue;
    const baseShare = Math.floor(amount / sharedWith.length);
    const remainder = amount % sharedWith.length;
    sharedWith.forEach((name, index) => addDebt(name, payer, baseShare + (index < remainder ? 1 : 0)));
  }
  // Only offset reciprocal debts between the same two people.
  const cents = new Map(participants.map(name => [name, 0]));
  const transfers: { from: string; to: string; amount: number }[] = [];
  for (const pair of pairs.values()) {
    if (!pair.cents) continue;
    const from = pair.cents > 0 ? pair.from : pair.to;
    const to = pair.cents > 0 ? pair.to : pair.from;
    const amount = Math.abs(pair.cents);
    transfers.push({ from, to, amount: amount / 100 });
    cents.set(from, (cents.get(from) ?? 0) - amount);
    cents.set(to, (cents.get(to) ?? 0) + amount);
  }
  return { balances: [...cents].map(([name, value]) => ({ name, balance: value / 100 })), transfers };
}
