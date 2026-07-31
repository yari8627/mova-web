import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { tripAccess } from "../../../../../lib/trip-access";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 }); const { id } = await params; const access = await tripAccess(id, user); if (!access.allowed) return NextResponse.json({ error: "Accesso negato" }, { status: 403 }); return NextResponse.json({ role: access.role, userId: user.id, userName: user.name, canManage: access.role === "owner" || access.role === "co-organizer", canInvite: access.role === "owner" || access.role === "co-organizer", canAssignRoles: access.role === "owner" }); }
