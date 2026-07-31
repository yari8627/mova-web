import { redirect } from "next/navigation";
import { currentUser } from "../../lib/auth";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) { if (!await currentUser()) redirect("/auth"); return children; }
