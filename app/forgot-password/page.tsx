"use client";
import { FormEvent, useState } from "react";
import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { AuthShell } from "../components/auth-shell";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    setLoading(true); setError(""); setMessage(""); setPreview("");
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email") }) });
      const result = await response.json();
      if (!response.ok) return setError(result.error || "Non è stato possibile inviare le istruzioni.");
      setMessage(result.message); setPreview(result.previewUrl || "");
    } catch { setError("Connessione non disponibile. Riprova tra poco."); }
    finally { setLoading(false); }
  }
  return <AuthShell backHref="/auth">
    <h1>Recupera password</h1><p>Inserisci l’email associata al tuo account.</p>
    <form onSubmit={submit} aria-busy={loading}>
      <label>Email<span><Mail size={18} aria-hidden="true" /><input name="email" type="email" required autoComplete="email" /></span></label>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="primary-button auth-submit" disabled={loading}>{loading ? <span role="status">Invio in corso…</span> : "Invia istruzioni"}</button>
    </form>
    {message && <div className="security-result" role="status">{message}{preview && <button onClick={() => router.push(preview)}>Apri link di sviluppo</button>}</div>}
  </AuthShell>;
}
