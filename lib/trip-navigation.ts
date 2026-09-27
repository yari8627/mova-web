export const tripTabs = [
  { label: "Panoramica", path: "overview" },
  { label: "Cosa Portare", path: "packing" },
  { label: "Itinerario", path: "" },
  { label: "Prenotazioni", path: "bookings" },
  { label: "Documenti", path: "documents" },
  { label: "Spese", path: "expenses" },
  { label: "Partecipanti", path: "participants" },
  { label: "App Utili", path: "apps" },
];

export function swipeDestination(tripId: string, pathname: string, dx: number, dy: number, elapsed: number) {
  if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5 || elapsed > 900) return null;
  const routes = tripTabs.map(tab => `/trips/${tripId}${tab.path ? `/${tab.path}` : ""}`);
  const index = routes.indexOf(pathname);
  if (index < 0) return null;
  return routes[index + (dx < 0 ? 1 : -1)] ?? null;
}
