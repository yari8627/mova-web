import { NextResponse } from "next/server";
import { readAvatar } from "../../../../../lib/avatar-storage";
import { currentUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ userId: string }> }) {
  if (!await currentUser()) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const { userId } = await params;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarStorageKey: true, avatarMimeType: true } });
  if (!user?.avatarStorageKey) return NextResponse.json({ error: "Foto non trovata" }, { status: 404 });
  const bytes = await readAvatar(user.avatarStorageKey);
  return new Response(bytes, { headers: { "Content-Type": user.avatarMimeType || "image/jpeg", "Cache-Control": "private, max-age=3600" } });
}
