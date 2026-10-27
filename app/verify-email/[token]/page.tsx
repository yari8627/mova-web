"use client";
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { AuthShell } from "../../components/auth-shell";

export default function VerifyEmailPage() {
  const { token } = useParams<{ token: string }>(); const router = useRouter();
  const [status, setStatus] = useState("Verifica in corso…"); const [verified, setVerified] = useState(false); const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).then(async (response) => {
      const result = await response.json(); setVerified(response.ok); setStatus(response.ok ? "Email verificata correttamente" : result.error);
    }).catch(() => setStatus("Connessione non disponibile. Riprova tra poco.")).finally(() => setLoading(false));
  }, [token]);
  return <AuthShell><div className="auth-profile">
    {verified && <CheckCircle2 className="verify-icon" size={56} aria-hidden="true" />}
    <div role={loading || verified ? "status" : "alert"} aria-busy={loading}><h1>{status}</h1></div>
    <button className="primary-button auth-submit" onClick={() => router.push(verified ? "/" : "/auth")}>Continua</button>
  </div></AuthShell>;
}
