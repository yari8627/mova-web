"use client";

import { FormEvent, useState } from "react";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SecuritySettingsPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setMessage(""); setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("newPassword") !== data.get("confirmPassword")) { setError("Le nuove password non coincidono."); setLoading(false); return; }
    const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword") }) });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setError(result.error || "Non è stato possibile cambiare la password.");
    form.reset();
    setMessage("Password aggiornata. Accedi nuovamente con la nuova password.");
    window.setTimeout(() => router.push("/auth"), 1500);
  }

  async function closeOtherSessions() {
    setLoading(true); setMessage(""); setError("");
    const response = await fetch("/api/auth/sessions", { method: "DELETE" });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setError(result.error || "Operazione non riuscita.");
    setMessage(result.closed ? `${result.closed} sessioni disconnesse.` : "Non risultano altre sessioni attive.");
  }

  return <main className="preference-shell"><header><button className="detail-brand home-brand-button" onClick={() => router.push("/")}>mova</button></header><section className="preference-card security-card"><div className="preference-heading"><span><ShieldCheck size={25} /></span><div><p className="section-kicker">SICUREZZA</p><h1>Accesso e password</h1><p>Proteggi il tuo account e gestisci le sessioni aperte.</p></div></div>{message && <div className="security-success">{message}</div>}{error && <div className="auth-error security-feedback">{error}</div>}<form className="security-form" onSubmit={changePassword}><div className="security-section-title"><KeyRound size={21} /><div><strong>Cambia password</strong><span>La modifica disconnetterà tutti i dispositivi, incluso questo.</span></div></div><label>Password attuale<input name="currentPassword" type="password" autoComplete="current-password" required /></label><div className="security-password-grid"><label>Nuova password<input name="newPassword" type="password" minLength={8} autoComplete="new-password" required /></label><label>Conferma nuova password<input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required /></label></div><button className="primary-button security-action" disabled={loading}>Aggiorna password</button></form><div className="security-sessions"><div className="security-section-title"><LogOut size={21} /><div><strong>Altri dispositivi</strong><span>Chiudi tutte le sessioni eccetto quella che stai usando.</span></div></div><button className="secondary-button" onClick={closeOtherSessions} disabled={loading}>Disconnetti gli altri dispositivi</button></div></section></main>;
}
