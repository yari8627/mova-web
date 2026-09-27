import { redirect } from "next/navigation";
import { currentUser } from "../../../lib/auth";
import { tripAccess } from "../../../lib/trip-access";
import { TripSessionProvider } from "../../components/trip-session";

import { TripSwipeNavigation } from "../../components/trip-swipe-navigation";

export default async function TripLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await currentUser(); if (!user) redirect("/auth");
  const { id } = await params; const access = await tripAccess(id, user, true);
  if (!access.allowed && !access.missing) redirect("/?access=denied");
  return <TripSessionProvider userId={user.id}><TripSwipeNavigation tripId={id}>{children}</TripSwipeNavigation></TripSessionProvider>;
}
