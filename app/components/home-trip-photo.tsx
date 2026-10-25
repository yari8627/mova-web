"use client";

import { useEffect, useRef, useState } from "react";
import { Compass } from "lucide-react";
import { cachedHomePhoto, homePhotoKey, homePhotoSrcSet, resolveHomePhoto } from "../../lib/home-trip-images";
import styles from "./home-trip-photo.module.css";

type Props = { country: string; city: string; kind: "hero" | "upcoming" | "completed" };

// A destination change remounts its own lifecycle, including pending decode callbacks.
export function HomeTripPhoto(props: Props) { return <DestinationPhoto key={homePhotoKey(props.country, props.city)} {...props} />; }

function DestinationPhoto({ country, city, kind }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const mounted = useRef(false);
  const retriedOnline = useRef(false);
  const triedLocalFallback = useRef(false);
  const [visible, setVisible] = useState(kind === "hero");
  const [source, setSource] = useState(() => cachedHomePhoto(country, city));
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [originalOnly, setOriginalOnly] = useState(false);
  const [retry, setRetry] = useState(0);
  const srcSet = originalOnly ? undefined : homePhotoSrcSet(source);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (visible) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const carousel = kind === "completed" ? root.current?.closest("#completed-trips-carousel") : null;
    if (carousel && root.current) {
      // A viewport rootMargin cannot expand the clipping of an overflow ancestor.
      // Gate vertical visibility separately, then preload beside the scrollport.
      let nearViewport = false, nearCard = false, activated = false;
      const activate = () => {
        if (activated || !nearViewport || !nearCard) return;
        activated = true;
        setVisible(true);
        viewportObserver.disconnect(); cardObserver.disconnect();
      };
      const viewportObserver = new IntersectionObserver(entries => {
        nearViewport = entries.some(entry => entry.isIntersecting); activate();
      }, { rootMargin: "80px" });
      const cardObserver = new IntersectionObserver(entries => {
        nearCard = entries.some(entry => entry.isIntersecting); activate();
      }, { root: carousel, rootMargin: "0px 160px" });
      viewportObserver.observe(carousel); cardObserver.observe(root.current);
      return () => { viewportObserver.disconnect(); cardObserver.disconnect(); };
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "80px" });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [visible, kind]);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void resolveHomePhoto(country, city, retry > 0).then(url => {
      if (!active) return;
      setSource(url);
      if (!url) setState("error");
    });
    return () => { active = false; };
  }, [country, city, visible, retry]);
  useEffect(() => {
    if (!visible || !source) return;
    // Cached images can finish before React attaches onLoad; decode them here too.
    const cachedImage = image.current;
    if (cachedImage?.complete && cachedImage.naturalWidth) void loaded(cachedImage);
    // An already-failed cached request can also finish before onError is attached.
    else if (kind === "completed" && cachedImage?.complete) failed(cachedImage);
    // A stalled image gets a deliberate fallback; a late valid load can recover.
    const timeout = window.setTimeout(() => setState(current => current === "ready" ? current : "error"), 20000);
    return () => window.clearTimeout(timeout);
  }, [visible, source, originalOnly, retry, kind]);
  useEffect(() => {
    const online = () => {
      if (state !== "error" || retriedOnline.current) return;
      retriedOnline.current = true;
      setState("loading"); setOriginalOnly(true); setRetry(value => value + 1);
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [state]);

  function failed(target: HTMLImageElement) {
    if (!mounted.current || image.current !== target) return;
    if (!originalOnly && srcSet && target.currentSrc !== source) {
      // One bounded fallback to the exact original photo, never another destination.
      setState("loading"); setOriginalOnly(true);
    } else if (!triedLocalFallback.current) {
      triedLocalFallback.current = true;
      setState("loading");
      // One alternative photograph of the same place, before the neutral fallback.
      void resolveHomePhoto(country, city, true, true).then(url => {
        if (!mounted.current || image.current !== target) return;
        if (url && url !== source) { setOriginalOnly(false); setSource(url); }
        else setState("error");
      });
    } else setState("error");
  }
  async function loaded(target: HTMLImageElement) {
    try {
      if (!target.naturalWidth) throw new Error("Empty image");
      if (typeof target.decode === "function") await target.decode();
      if (mounted.current && image.current === target) setState("ready");
    } catch { failed(target); }
  }

  return <div ref={root} className={`${styles.photo} ${styles[kind]}`} data-photo-state={state} aria-hidden="true">
    {visible && source && <img key={`${source}|${originalOnly}|${retry}`} ref={image} className={styles.image} src={source} srcSet={srcSet}
      sizes={kind === "hero" ? "(max-width: 700px) calc(100vw - 32px), (max-width: 1100px) calc(100vw - 280px), 850px" : kind === "completed" ? "(max-width: 700px) 55vw, 210px" : "86px"}
      alt="" loading="eager" fetchPriority={kind === "hero" ? "high" : "auto"} decoding="async"
      style={{ opacity: state === "ready" ? 1 : 0 }} onLoad={event => { void loaded(event.currentTarget); }} onError={event => failed(event.currentTarget)} />}
    {kind === "completed" && state !== "ready" ? <div className={styles.feedback}>
      <Compass size={24} />
      <span>{state === "loading" ? "Caricamento foto…" : "Foto non disponibile"}</span>
    </div> : state === "error" && <Compass className={styles.unavailable} size={28} />}
    <div className={styles.tint} />
  </div>;
}
