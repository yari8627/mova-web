"use client";
import { useEffect, useState } from "react";

export type TripRole = "owner" | "co-organizer" | "participant";
export function useTripPermissions(id: string) { const [access, setAccess] = useState<{ role: TripRole; userId: string; userName: string } | null>(null); useEffect(() => { fetch(`/api/trips/${id}/access`).then((response) => response.ok ? response.json() : null).then((result) => { if (result) setAccess(result); }).catch(() => undefined); }, [id]); const role = access?.role ?? null; return { role, userId: access?.userId ?? null, userName: access?.userName ?? "", canManage: role === "owner" || role === "co-organizer", canInvite: role === "owner" || role === "co-organizer", canAssignRoles: role === "owner" }; }
