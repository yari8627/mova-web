export type InviteContact = { name: string; email: string };
type HistoricalTrip = {
  id: string;
  ownerId: string | null;
  owner?: InviteContact | null;
  participants: Array<InviteContact & { status: string }>;
};

export function contactEmail(value: string) { return value.trim().toLowerCase(); }
function validEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

// These records must come from the authenticated user's accessible trips.
// Recheck membership as well as the database predicate; never search User.
export function knownInviteContacts(trips: HistoricalTrip[], user: { id: string; email: string }, tripId: string, excluded: string[]) {
  const blocked = new Set([user.email, ...excluded].map(contactEmail));
  const accessible = trips.filter(trip => trip.ownerId === user.id || trip.participants.some(person => person.status === "confirmed" && contactEmail(person.email) === contactEmail(user.email)));
  for (const trip of accessible.filter(trip => trip.id === tripId)) {
    if (trip.owner) blocked.add(contactEmail(trip.owner.email));
    trip.participants.forEach(person => blocked.add(contactEmail(person.email)));
  }
  const contacts = new Map<string, InviteContact>();
  for (const trip of accessible) {
    if (trip.id === tripId) continue;
    for (const person of [...(trip.owner ? [trip.owner] : []), ...trip.participants.filter(person => person.status === "confirmed" || person.status === "pending")]) {
      const email = contactEmail(person.email);
      if (!validEmail(email) || blocked.has(email)) continue;
      const name = person.name.trim();
      const previous = contacts.get(email);
      if (!previous || (!previous.name && name)) contacts.set(email, { name, email });
    }
  }
  return [...contacts.values()].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "it") || a.email.localeCompare(b.email));
}

export function matchInviteContacts(contacts: InviteContact[], query: string, excluded: string[] = []) {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length < 2) return [];
  const blocked = new Set(excluded.map(contactEmail));
  return contacts.filter(contact => !blocked.has(contactEmail(contact.email)) && (contact.name.toLocaleLowerCase().includes(needle) || contact.email.toLowerCase().includes(needle))).slice(0, 6);
}
