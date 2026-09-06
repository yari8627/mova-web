type Group = {
  ownerId?: string | null;
  owner?: { email: string } | null;
  participants: { email: string; status: string }[];
};

// Match trip creation: count the owner and invited people, including pending invitations.
export function countTripPeople(trip: Group) {
  const ownerEmail = trip.owner?.email.trim().toLowerCase();
  const emails = new Set(trip.participants
    .filter(person => person.status === "pending" || person.status === "confirmed")
    .map(person => person.email.trim().toLowerCase())
    .filter(email => email && email !== ownerEmail));
  return emails.size + (trip.ownerId || trip.owner ? 1 : 0);
}
