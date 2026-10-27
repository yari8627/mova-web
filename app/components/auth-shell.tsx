"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { NamiWordmark } from "./nami-wordmark";
import styles from "./auth-shell.module.css";

/** Presentation only: authentication requests and redirects stay in each page. */
export function AuthShell({ children, backHref }: { children: ReactNode; backHref?: string }) {
  const router = useRouter();
  return <main className={`auth-shell ${styles.shell}`}>
    <header className={styles.masthead}>
      {backHref && <button type="button" className={styles.back} onClick={() => router.push(backHref)} aria-label={backHref === "/" ? "Torna alla Home" : "Torna all’accesso"}><ArrowLeft size={20} aria-hidden="true" /></button>}
      <NamiWordmark />
    </header>
    <section className="auth-card">{children}</section>
  </main>;
}
