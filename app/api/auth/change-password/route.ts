import { NextResponse } from "next/server";
import { currentUser, hashPassword, verifyPassword } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });

  const { currentPassword, newPassword } = await request.json();
  if (String(newPassword || "").length < 8) return NextResponse.json({ error: "La nuova password deve contenere almeno 8 caratteri." }, { status: 400 });
  if (currentPassword === newPassword) return NextResponse.json({ error: "Scegli una password diversa da quella attuale." }, { status: 400 });

  const record = await prisma.user.findUnique({ where: { id: user.id } });
  if (!record || !verifyPassword(String(currentPassword || ""), record.passwordHash)) return NextResponse.json({ error: "La password attuale non è corretta." }, { status: 400 });

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(String(newPassword)) } }),
    prisma.authSession.deleteMany({ where: { userId: user.id } })
  ]);
  return NextResponse.json({ changed: true });
}
