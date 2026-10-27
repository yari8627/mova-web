"use client";
import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { resetProgressMemory } from "../../lib/progress-memory";
import { AuthShell } from "../components/auth-shell";

export default function AuthPage() {
  const router = useRouter(); const [register, setRegister] = useState(false); const [showPassword, setShowPassword] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [user, setUser] = useState<{ name: string; email: string; emailVerified?: boolean; avatarUrl?: string | null } | null>(null); const [verificationLink, setVerificationLink] = useState("");
  useEffect(() => { const authError = new URLSearchParams(window.location.search).get("error"); if (authError) setError(authError === "google_not_configured" ? "L’accesso Google deve ancora essere configurato." : "Non è stato possibile accedere con Google. Riprova."); fetch("/api/auth/me").then((response) => response.json()).then((result) => setUser(result.user)).catch(() => undefined); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); resetProgressMemory(); setLoading(true); setError(""); const data = new FormData(event.currentTarget); try { const response = await fetch(register ? "/api/auth/register" : "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), email: data.get("email"), password: data.get("password") }) }); const result = await response.json(); if (!response.ok) return setError(result.error || "Non è stato possibile continuare."); resetProgressMemory(); router.push(new URLSearchParams(window.location.search).get("next") || "/"); router.refresh(); } catch { setError("Connessione non disponibile. Riprova tra poco."); } finally { setLoading(false); } }
  async function logout() { resetProgressMemory(); setLoading(true); await fetch("/api/auth/logout", { method: "POST" }); resetProgressMemory(); setUser(null); setLoading(false); router.refresh(); }
  async function requestVerification() { const result = await fetch("/api/auth/request-verification", { method: "POST" }).then((response) => response.json()); if (result.previewUrl) setVerificationLink(result.previewUrl); }
  if (user) return <AuthShell backHref="/"><div className="auth-profile">{user.avatarUrl ? <img className="auth-profile-avatar profile-image" src={user.avatarUrl} alt="Foto profilo" /> : <div className="auth-profile-avatar">{user.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div>}<h1>{user.name}</h1><p>{user.email}</p>{!user.emailVerified && <button className="secondary-button auth-submit" onClick={requestVerification}>Verifica indirizzo email</button>}{verificationLink && <button className="security-preview-link" onClick={() => router.push(verificationLink)}>Apri link di verifica</button>}<button className="secondary-button auth-submit" onClick={() => router.push("/settings/profile")}>Modifica profilo</button><button className="secondary-button auth-submit" onClick={() => router.push("/settings/security")}>Accesso e sicurezza</button><button className="secondary-button auth-submit" onClick={() => router.push("/settings/notifications")}>Preferenze notifiche</button><button className="secondary-button auth-submit account-link" onClick={() => router.push("/settings/account")}>Gestione account</button><button className="secondary-button auth-submit" onClick={logout} disabled={loading} aria-busy={loading}>{loading ? "Attendi…" : "Esci dall’account"}</button></div></AuthShell>;
  const next = typeof window === "undefined" ? "/" : new URLSearchParams(window.location.search).get("next") || "/";
  return <AuthShell backHref="/">
    <h1>{register ? "Crea il tuo account" : "Bentornato!"}</h1>
    <p>{register ? "Inizia a organizzare e condividere i tuoi viaggi." : "Accedi per continuare il tuo prossimo viaggio."}</p>
    <a className="google-auth-button" href={`/api/auth/google?next=${encodeURIComponent(next)}`}><img className="google-mark" src="/brand/google-g.png" width={20} height={20} alt="" aria-hidden="true" />Continua con Google</a>
    <div className="auth-divider"><span>oppure</span></div>
    <form onSubmit={submit} aria-busy={loading}>
      {register && <label>Nome e cognome<span><UserRound size={18} aria-hidden="true" /><input name="name" required autoComplete="name" /></span></label>}
      <label>Email<span><Mail size={18} aria-hidden="true" /><input name="email" type="email" required autoComplete="email" /></span></label>
      <label>Password<span><LockKeyhole size={18} aria-hidden="true" /><input name="password" aria-label="Password" type={showPassword ? "text" : "password"} minLength={8} required autoComplete={register ? "new-password" : "current-password"} /><button type="button" aria-label={showPassword ? "Nascondi password" : "Mostra password"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></span></label>
      {!register && <button className="forgot-password-link" type="button" onClick={() => router.push("/forgot-password")}>Password dimenticata?</button>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="primary-button auth-submit" disabled={loading}>{loading ? <span role="status">Attendi…</span> : register ? "Crea account" : "Accedi"}</button>
    </form>
    <div className="auth-switch">{register ? "Hai già un account?" : "Non hai ancora un account?"}<button onClick={() => { setRegister((value) => !value); setError(""); }}>{register ? "Accedi" : "Registrati"}</button></div>
  </AuthShell>;
}
