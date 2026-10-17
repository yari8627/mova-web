"use client";

import { HeartHandshake, Plane, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import brandStyles from "../components/trip-header.module.css";
import styles from "./about.module.css";

export default function AboutPage() {
  const router = useRouter();
  return <main className={styles.page}>
    <div className={styles.content}>
      <header className={styles.header}>
        <button className={brandStyles.wordmarkButton} onClick={() => router.push("/")} aria-label="NAMI Travel, torna alla Home"><span>NAMI</span><small>TRAVEL</small></button>
      </header>
      <section className={styles.intro} aria-labelledby="about-title">
        <p className={styles.eyebrow}>LA FILOSOFIA NAMI</p>
        <h1 id="about-title">Viaggiare insieme, con semplicità.</h1>
        <p className={styles.description}>Il viaggio comincia molto prima della partenza. NAMI nasce per rendere ogni esperienza più semplice da organizzare e più bella da condividere.</p>
      </section>
      <div className={styles.photograph}>
        <Image src="/images/about/amalfi-coast.webp" alt="Le case di Atrani affacciate sul mare e sulle montagne della Costiera Amalfitana." width={1280} height={720} sizes="(max-width: 620px) calc(100vw - 26px), (max-width: 944px) calc(100vw - 64px), 880px" />
      </div>
      <section className={styles.pillars} aria-labelledby="about-pillars">
        <h2 id="about-pillars" className={styles.eyebrow}>IL NOSTRO MODO DI VIAGGIARE</h2>
        <div className={styles.cards}>
          <article className={styles.card}><span className={styles.icon}><Plane size={22} aria-hidden="true" /></span><div><h3>Organizza</h3><p>Itinerari, prenotazioni, documenti e spese. Tutto il viaggio, in un solo posto.</p></div></article>
          <article className={styles.card}><span className={styles.icon}><Users size={22} aria-hidden="true" /></span><div><h3>Collabora</h3><p>Un unico spazio per condividere programmi e decisioni con chi parte insieme a te.</p></div></article>
          <article className={styles.card}><span className={styles.icon}><HeartHandshake size={22} aria-hidden="true" /></span><div><h3>Vivi</h3><p>Meno tempo a cercare informazioni, più tempo da dedicare alle esperienze.</p></div></article>
        </div>
      </section>
      <section className={styles.closing} aria-labelledby="about-spirit"><h2 id="about-spirit" className={styles.eyebrow}>IL NOSTRO SPIRITO</h2><p>Il viaggio è più bello quando lo condividi.</p></section>
    </div>
  </main>;
}
