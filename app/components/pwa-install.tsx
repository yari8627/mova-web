"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Share, SquarePlus, Check, X } from "lucide-react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null); const [ios, setIos] = useState(false); const [iosHelp, setIosHelp] = useState(false); const [hidden, setHidden] = useState(true);
  const guide = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!iosHelp) { guide.current?.close(); return; }
    guide.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [iosHelp]);
  useEffect(() => {
    navigator.serviceWorker?.register("/sw.js").catch(() => undefined);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
    const lockPortrait = () => { if (standalone) void orientation?.lock?.("portrait-primary").catch(() => undefined); };
    lockPortrait();
    document.addEventListener("visibilitychange", lockPortrait);
    const installLink = new URLSearchParams(window.location.search).get("install");
    if (installLink === "guide") setIosHelp(true);
    const sharedInstallLink = installLink === "1" || installLink === "guide";
    if (standalone || (!sharedInstallLink && window.localStorage.getItem("mova-install-dismissed") === "true")) return () => document.removeEventListener("visibilitychange", lockPortrait);
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent); setIos(isIos); if (isIos) setHidden(false);
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); setHidden(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); document.removeEventListener("visibilitychange", lockPortrait); };
  }, []);
  function dismiss() { window.localStorage.setItem("mova-install-dismissed", "true"); setHidden(true); }
  async function install() { if (ios) return setIosHelp(true); if (!prompt) return; await prompt.prompt(); const result = await prompt.userChoice; if (result.outcome === "accepted") setHidden(true); setPrompt(null); }
  if (hidden && !iosHelp) return null;
  return <>
    {!hidden && <aside className="pwa-install" aria-label="Installa MOVA"><button className="pwa-install-close" onClick={dismiss} aria-label="Non mostrare più"><X size={15} /></button><span className="pwa-install-icon"><Download size={19} /></span><div><strong>Installa MOVA</strong><p>Aprila dalla Home come una vera app.</p></div><button className="pwa-install-action" onClick={install}>Installa</button></aside>}
    <dialog ref={guide} className="ios-install-guide" aria-labelledby="ios-install-title" onCancel={() => setIosHelp(false)} onClick={(event) => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setIosHelp(false); } }}>
      <button className="ios-guide-close" aria-label="Chiudi la guida" onClick={() => setIosHelp(false)}><X size={22} /></button>
      <header><span className="ios-guide-brand">mova</span><h2 id="ios-install-title">MOVA sulla tua Home</h2><p>Apri MOVA in Safari sul tuo iPhone.<br />Poi segui questi tre passaggi.</p></header>
      <ol className="ios-guide-steps">
        <li><span className="ios-guide-number">1</span><div><h3>Tocca Condividi</h3><p>Cerca il quadrato con la freccia verso l’alto. Se non lo vedi, apri il menu di Safari.</p><div className="ios-guide-example" aria-hidden="true"><span>mova-web-flax.vercel.app</span><Share size={25} /></div></div></li>
        <li><span className="ios-guide-number">2</span><div><h3>Aggiungi alla schermata Home</h3><p>Scorri le opzioni del menu e seleziona questa voce.</p><div className="ios-guide-example ios-guide-menu" aria-hidden="true"><span>Aggiungi alla schermata Home</span><SquarePlus size={24} /></div></div></li>
        <li><span className="ios-guide-number">3</span><div><h3>Conferma con Aggiungi</h3><p>Se compare “Apri come app web”, lascialo attivo.</p><div className="ios-guide-example ios-guide-confirm" aria-hidden="true"><span className="ios-guide-app-icon">m</span><strong>MOVA</strong><span className="ios-guide-add">Aggiungi</span></div></div></li>
      </ol>
      <p className="ios-guide-ready"><Check size={19} /> L’icona MOVA apparirà sulla schermata Home.</p>
      <button className="primary-button ios-guide-done" onClick={() => setIosHelp(false)}>Ho capito</button>
    </dialog>
  </>;
}
