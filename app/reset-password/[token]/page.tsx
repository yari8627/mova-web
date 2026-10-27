"use client";
import { FormEvent, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { AuthShell } from "../../components/auth-shell";

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>(); const router = useRouter();
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: data.get("password") }) });
      const result = await response.json(); if (!response.ok) return setError(result.error);
      router.push("/auth");
    } catch { setError("Connessione non disponibile. Riprova tra poco."); }
    finally { setLoading(false); }
  }
  return <AuthShell>
    <h1>Nuova password</h1><p>Scegli una nuova password per il tuo account.</p>
    <form onSubmit={submit} aria-busy={loading}>
      <label>Password<span><LockKeyhole size={18} aria-hidden="true" /><input name="password" type="password" minLength={8} required autoComplete="new-password" /></span></label>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="primary-button auth-submit" disabled={loading}>{loading ? <span role="status">Aggiornamento in corso…</span> : "Aggiorna password"}</button>
    </form>
  </AuthShell>;
}
