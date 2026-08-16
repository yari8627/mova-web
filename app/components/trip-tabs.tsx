"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const tabs = [
  { label: "Panoramica", path: "overview" },
  { label: "Cosa Portare", path: "packing" },
  { label: "Itinerario", path: "" },
  { label: "Prenotazioni", path: "bookings" },
  { label: "Documenti", path: "documents" },
  { label: "Spese", path: "expenses" },
  { label: "Partecipanti", path: "participants" },
  { label: "App Utili", path: "apps" },
];

export function TripTabs({ tripId }: { tripId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLButtonElement>("button.active");
    if (!nav || !active) return;
    nav.scrollLeft = Math.max(0, active.offsetLeft - (nav.clientWidth - active.clientWidth) / 2);
  }, [pathname]);

  return <nav ref={navRef} className="detail-tabs" aria-label="Sezioni del viaggio" onDragStart={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()}>
    {tabs.map((tab) => {
      const href = `/trips/${tripId}${tab.path ? `/${tab.path}` : ""}`;
      const active = pathname === href;
      return <button key={tab.label} draggable={false} className={active ? "active" : undefined} onClick={() => router.push(href)} aria-current={active ? "page" : undefined}>{tab.label}</button>;
    })}
  </nav>;
}
