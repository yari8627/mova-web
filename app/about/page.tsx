"use client";

import { HeartHandshake, Plane, Users } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AboutPage() {
  const router = useRouter();
  return <main className="about-shell">
    <button className="detail-brand home-brand-button" onClick={() => router.push("/")}>mova</button>
    <section className="about-hero"><p className="section-kicker">CHI SIAMO</p><h1>Viaggiare insieme, con semplicità.</h1><p>MOVA nasce per raccogliere itinerari, prenotazioni, documenti e spese in un unico spazio condiviso.</p></section>
    <section className="about-values"><article><Plane size={24} /><h2>Organizza</h2><p>Tutto ciò che serve al viaggio sempre a portata di mano.</p></article><article><Users size={24} /><h2>Collabora</h2><p>Ogni partecipante contribuisce allo stesso viaggio.</p></article><article><HeartHandshake size={24} /><h2>Vivi</h2><p>Meno tempo a cercare informazioni, più tempo per partire.</p></article></section>
  </main>;
}
