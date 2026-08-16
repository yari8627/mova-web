"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null); const [ios, setIos] = useState(false); const [iosHelp, setIosHelp] = useState(false); const [hidden, setHidden] = useState(true);
  useEffect(() => { navigator.serviceWorker?.register("/sw.js").catch(() => undefined); if (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone || window.localStorage.getItem("mova-install-dismissed") === "true") return; const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent); setIos(isIos); if (isIos) setHidden(false); const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); setHidden(false); }; window.addEventListener("beforeinstallprompt", onPrompt); return () => window.removeEventListener("beforeinstallprompt", onPrompt); }, []);
  function dismiss() { window.localStorage.setItem("mova-install-dismissed", "true"); setHidden(true); }
  async function install() { if (ios) return setIosHelp(true); if (!prompt) return; await prompt.prompt(); const result = await prompt.userChoice; if (result.outcome === "accepted") setHidden(true); setPrompt(null); }
  if (hidden) return null;
  return <aside className="pwa-install" aria-label="Installa MOVA"><button className="pwa-install-close" onClick={dismiss} aria-label="Non mostrare più"><X size={15} /></button><span className="pwa-install-icon"><Download size={19} /></span><div><strong>Installa MOVA</strong><p>{iosHelp ? <><Share size={14} /> Tocca Condividi e poi “Aggiungi alla schermata Home”.</> : "Aprila dalla Home come una vera app."}</p></div><button className="pwa-install-action" onClick={install}>{iosHelp ? "Ho capito" : "Installa"}</button></aside>;
}
