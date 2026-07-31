import { NextResponse } from "next/server";
import { currentUser, destroyOtherSessions } from "../../../../lib/auth";

export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const closed = await destroyOtherSessions(user.id);
  return NextResponse.json({ closed });
}
