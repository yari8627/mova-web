import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { generateDueReminders } from "../../../lib/reminders";

export async function GET() { const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 }); await generateDueReminders(user); const notifications = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }); return NextResponse.json({ notifications, unread: notifications.filter((item) => !item.readAt).length }); }
export async function PATCH() { const user = await currentUser(); if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 }); await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } }); return NextResponse.json({ updated: true }); }
