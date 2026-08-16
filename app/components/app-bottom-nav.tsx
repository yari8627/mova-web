"use client";

import { CircleUserRound, Earth, Plane, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

const items = [
  { label: "I Miei Viaggi", icon: Plane, path: "/" },
  { label: "Progressi", icon: Earth, path: "/progress" },
  { label: "Chi Siamo", icon: Users, path: "/about" },
  { label: "Profilo", icon: CircleUserRound, path: "/settings/profile" },
];

const publicRoutes = ["/auth", "/forgot-password", "/reset-password", "/verify-email", "/invite"];

export function AppBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  if (publicRoutes.some((path) => pathname.startsWith(path))) return null;
  const activePath = pathname === "/progress" ? "/progress" : pathname === "/about" ? "/about" : pathname.startsWith("/settings") ? "/settings/profile" : "/";
  return <nav className="mobile-bottom-nav global-bottom-nav" aria-label="Navigazione principale">
    {items.map(({ label, icon: Icon, path }) => <button key={path} className={activePath === path ? "active" : undefined} onClick={() => router.push(path)} aria-current={activePath === path ? "page" : undefined}><Icon size={20} /><span>{label}</span></button>)}
  </nav>;
}
