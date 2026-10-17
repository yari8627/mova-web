"use client";

import { FormEvent, useEffect, useState } from "react";
import { Camera, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import countries from "i18n-iso-countries";
import italian from "i18n-iso-countries/langs/it.json";

import brandStyles from "../../components/trip-header.module.css";
import styles from "./profile.module.css";

countries.registerLocale(italian);
const passportCountries = Object.entries(countries.getNames("it", { select: "official" })).map(([alpha2, name]) => ({ code: countries.alpha2ToAlpha3(alpha2) || alpha2, name })).sort((a, b) => a.name.localeCompare(b.name, "it"));
type Profile = { name: string; email: string; pendingEmail?: string | null; avatarUrl?: string | null; passportCountry: string };
export default function ProfileSettingsPage() {
  const router = useRouter(); const [profile, setProfile] = useState<Profile | null>(null); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [previewUrl, setPreviewUrl] = useState(""); const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => { fetch("/api/auth/me").then((response) => response.json()).then((result) => setProfile(result.user)); }, []);
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); setMessage(""); const response = await fetch("/api/auth/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) }); const result = await response.json(); if (!response.ok) return setError(result.error); setMessage(result.emailChanged ? "Profilo salvato. Verifica il nuovo indirizzo email per renderlo attivo." : "Profilo aggiornato."); setPreviewUrl(result.previewUrl || ""); router.refresh(); }
  async function upload(file?: File) { if (!file) return; setError(""); const body = new FormData(); body.append("avatar", file); const response = await fetch("/api/auth/profile", { method: "POST", body }); const result = await response.json(); if (!response.ok) return setError(result.error); setProfile((value) => value ? { ...value, avatarUrl: result.avatarUrl } : value); setMessage("Foto profilo aggiornata."); }
  async function logout() { setLoggingOut(true); await fetch("/api/auth/logout", { method: "POST" }); router.replace("/auth"); router.refresh(); }
  if (!profile) return <main className={styles.loading} role="status">Caricamento profilo…</main>;
  const initials = profile.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return <main className={styles.page}>
    <div className={styles.content}>
      <header className={styles.header}><button className={brandStyles.wordmarkButton} onClick={() => router.push("/")} aria-label="NAMI Travel, torna alla Home"><span>NAMI</span><small>TRAVEL</small></button></header>
      <section className={styles.heading}><p className={styles.eyebrow}>IL TUO PROFILO</p><h1>I tuoi dati</h1><p>La tua identità, per ogni viaggio.</p></section>
      <div className={styles.avatarEditor}>
        {profile.avatarUrl ? <img src={profile.avatarUrl} alt="Foto profilo" width={104} height={104} /> : <div className={styles.initials}>{initials}</div>}
        <label className={styles.photoAction}><Camera size={17} aria-hidden="true" /> Cambia foto<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => upload(event.target.files?.[0])} /></label>
        <small>JPG, PNG o WebP · massimo 3 MB</small>
      </div>
      <form className={styles.form} onSubmit={save}>
        {message && <div className={styles.success} role="status">{message}</div>}
        {error && <div className={styles.error} role="alert">{error}</div>}
        {profile.pendingEmail && <div className={styles.pending}>In attesa di verifica: <strong>{profile.pendingEmail}</strong></div>}
        <label>Nome e cognome<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required /></label>
        <label>Email<input type="email" value={profile.pendingEmail || profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value, pendingEmail: null })} required /></label>
        <label>Paese del passaporto<select value={profile.passportCountry || "ITA"} onChange={(event) => setProfile({ ...profile, passportCountry: event.target.value })}>{passportCountries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select><small>Serve a calcolare automaticamente visti e documenti richiesti.</small></label>
        <button className={styles.save}>Salva profilo</button>
      </form>
      {previewUrl && <button className={styles.preview} onClick={() => router.push(previewUrl)}>Apri link di verifica</button>}
      <button type="button" className={styles.logout} onClick={logout} disabled={loggingOut}><LogOut size={18} aria-hidden="true" /> {loggingOut ? "Uscita in corso…" : "Esci dall'account"}</button>
    </div>
  </main>;
}
