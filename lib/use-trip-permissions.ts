"use client";
import { useEffect, useState } from "react";
import { useTripUserId } from "../app/components/trip-session";
import { fetchPageCache, readPageCache } from "./page-cache";

export type TripRole = "owner" | "co-organizer" | "participant";
type Access = { role: TripRole; userId: string; userName: string };
export function useTripPermissions(id: string) {
  const userId = useTripUserId();
  const [access, setAccess] = useState<Access | null>(null);
  useEffect(() => {
    let cancelled = false;
    setAccess(readPageCache<Access>(userId, `access-${id}`));
    void fetchPageCache<Access>(userId, `access-${id}`, `/api/trips/${id}/access`).then(result => {
      if (!cancelled) setAccess(result);
    });
    return () => { cancelled = true; };
  }, [id, userId]);
  const role = access?.role ?? null;
  return { canEditItinerary: role !== null, role, userId: access?.userId ?? null, userName: access?.userName ?? "", canManage: role === "owner" || role === "co-organizer", canInvite: role === "owner" || role === "co-organizer", canAssignRoles: role === "owner" };
}
