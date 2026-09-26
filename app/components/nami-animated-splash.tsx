"use client";

import { CSSProperties, ReactNode, useEffect, useState } from "react";
import styles from "./nami-animated-splash.module.css";

// Shared by the CSS timeline and the readiness gate. Geometry lives in the CSS module.
export const SPLASH_TIMING = { intro: 4500, entrance: 2200, wordmarkDelay: 1950, wordmarkFade: 500, straighten: 1100, departureDelay: 2750, departure: 1550, transition: 350, reduced: 300 };
let introShown = false;

export function NamiAnimatedSplash({ ready, children, onComplete }: { ready: boolean; children?: ReactNode; onComplete?: () => void }) {
  const [introDone, setIntroDone] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [skipFlight, setSkipFlight] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSkipFlight(media.matches || introShown);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!imageReady) return;
    const timer = window.setTimeout(() => setIntroDone(true), skipFlight ? SPLASH_TIMING.reduced : SPLASH_TIMING.intro);
    return () => window.clearTimeout(timer);
  }, [imageReady, skipFlight]);
  // A failed/blocked asset must never leave the application behind an endless splash.
  useEffect(() => {
    const timer = window.setTimeout(() => setImageReady(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);
  const exiting = ready && introDone;
  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => { introShown = true; setDismissed(true); onComplete?.(); }, SPLASH_TIMING.transition);
    return () => window.clearTimeout(timer);
  }, [exiting, onComplete]);
  const variables = Object.fromEntries(Object.entries(SPLASH_TIMING).map(([key, value]) => [`--${key}`, `${value}ms`])) as CSSProperties;
  return <>
    <div className={styles.content} inert={!dismissed} style={{ opacity: exiting || dismissed ? 1 : 0, transition: `opacity ${SPLASH_TIMING.transition}ms ease` }}>{children}</div>
    {!dismissed && <div className={`${styles.splash} ${imageReady ? styles.play : ""} ${skipFlight ? styles.static : ""} ${exiting ? styles.exit : ""}`} style={variables} role="status" aria-label="Caricamento NAMI Travel" aria-busy={!ready}>
      <div className={styles.composition} aria-hidden="true">
        <div className={styles.departure}><div className={styles.flight}><div className={styles.rise}><div className={styles.upright}>
          <img src="/images/nami-balloon.png" width="1261" height="1247" alt="" fetchPriority="high" loading="eager" onLoad={() => setImageReady(true)} onError={() => setImageReady(true)} />
        </div></div></div></div>
        <div className={styles.wordmark}><strong>NAMI</strong><span>Travel</span></div>
      </div>
    </div>}
  </>;
}
