
import { normalizeSharedWith } from "./expense-balances";

type Person = { name: string; email: string };
type ExpenseIdentity = { paidBy: string; recipient?: string | null; sharedWith?: string | null };

// Invitation email links the historical label to the same current participant.
// Keep ambiguous names untouched: two people may legitimately share a name.
export function reconcileExpenseIdentities<T extends ExpenseIdentity>(expenses: T[], people: Person[], invites: Person[]): T[] {
  const emailKey = (value: string) => value.trim().toLowerCase();
  const nameKey = (value: string) => value.trim().toLocaleLowerCase("it");
  const names = new Map<string, Set<string>>();
  const current = new Map(people.map(person => [emailKey(person.email), person.name]));
  for (const person of [...people, ...invites]) {
    const email = emailKey(person.email);
    if (!current.has(email)) continue;
    const key = nameKey(person.name);
    const owners = names.get(key) ?? new Set<string>();
    owners.add(email);
    names.set(key, owners);
  }
  const resolve = (value: string) => {
    const owners = names.get(nameKey(value));
    return owners?.size === 1 ? current.get([...owners][0]) ?? value : value;
  };
  return expenses.map(expense => ({
    ...expense,
    paidBy: resolve(expense.paidBy),
    recipient: expense.recipient ? resolve(expense.recipient) : expense.recipient,
    sharedWith: expense.sharedWith ? JSON.stringify([...new Set(normalizeSharedWith(expense.sharedWith).map(resolve))]) : expense.sharedWith,
  }));
}
