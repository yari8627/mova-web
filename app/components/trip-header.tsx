"use client";

import { useContext } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { TripPanePath } from "./trip-pane-path";
import styles from "./trip-header.module.css";

export function TripHeader({ tripId }: { tripId: string }) {
  const router = useRouter();
  const routePath = usePathname();
  const panePath = useContext(TripPanePath);
  const showSettings = (panePath ?? routePath) !== `/trips/${tripId}/settings`;

  return <header className={`detail-topbar ${styles.header}`}>
    <button className={styles.wordmarkButton} onClick={() => router.push("/")} aria-label="Torna alla Home">
      <span>NAMI</span><small>TRAVEL</small>
    </button>
    {showSettings && <button className={styles.settings} onClick={() => router.push(`/trips/${tripId}/settings`)} aria-label="Gestisci viaggio" title="Gestisci viaggio">
      <Settings size={21} aria-hidden="true" />
    </button>}
  </header>;
}
