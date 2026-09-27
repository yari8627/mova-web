"use client";
import { ReactNode, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { tripTabs, swipeCommit } from "../../lib/trip-navigation";
import { TripPanePath } from "./trip-pane-path";
import styles from "./trip-swipe-navigation.module.css";
const loaders = [
  () => import("../trips/[id]/overview/page"),
  () => import("../trips/[id]/packing/page"),
  () => import("../trips/[id]/page"),
  () => import("../trips/[id]/bookings/page"),
  () => import("../trips/[id]/documents/page"),
  () => import("../trips/[id]/expenses/page"),
  () => import("../trips/[id]/participants/page"),
  () => import("../trips/[id]/apps/page"),
];
const pages = loaders.map(loader => dynamic(loader));
export function TripSwipeNavigation({ tripId, children }: { tripId: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [clickedPage, setClickedPage] = useState<number | null>(null);
  const routes = tripTabs.map(tab => `/trips/${tripId}${tab.path ? `/${tab.path}` : ""}`);
  const index = routes.indexOf(pathname);
  useLayoutEffect(() => {
    setClickedPage(null);
    if (track.current) { track.current.removeAttribute("data-swiping"); track.current.style.setProperty("--swipe-x", "0px"); track.current.style.setProperty("--swipe-duration", "0ms"); }
  }, [pathname]);
  useEffect(() => {
    const element = root.current, slider = track.current;
    if (!element || !slider || index < 0) return;
    let gesture: { x: number; y: number; lastX: number; lastTime: number; velocity: number; axis: "x" | "y" | null } | null = null;
    let settling = false, offset = 0, frame = 0;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paint = () => { frame = 0; slider.setAttribute("data-swiping", "true"); slider.style.setProperty("--swipe-x", `${offset}px`); };
    const settle = (destination: number | null) => {
      gesture = null; settling = true;
      cancelAnimationFrame(frame); frame = 0;
      const duration = reduced ? 0 : 280;
      slider.style.setProperty("--swipe-duration", `${duration}ms`);
      offset = destination === null ? 0 : (destination > index ? -element.clientWidth : element.clientWidth);
      paint();
      timer = setTimeout(() => {
        if (destination !== null) window.history.pushState(null, "", routes[destination]);
        else { slider.removeAttribute("data-swiping"); slider.style.setProperty("--swipe-x", "0px"); slider.style.setProperty("--swipe-duration", "0ms"); }
        settling = false;
      }, duration);
    };
    const blocked = (target: EventTarget | null) => {
      if (!(target instanceof Element) || document.querySelector('[role="dialog"], .modal-backdrop')) return true;
      if (target.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="slider"], [draggable="true"], .leaflet-container, .detail-tabs, .shared-trip-cover, .detail-topbar, [data-no-swipe]')) return true;
      for (let node: Element | null = target; node && node !== element; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.touchAction === "none" || (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1)) return true;
      }
      return Boolean(window.getSelection()?.toString());
    };
    const begin = (event: TouchEvent) => {
      if (settling) return;
      if (event.touches.length !== 1) { if (gesture) settle(null); return; }
      if (blocked(event.target)) return;
      const touch = event.touches[0];
      if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
      slider.style.setProperty("--swipe-duration", "0ms");
      gesture = { x: touch.clientX, y: touch.clientY, lastX: touch.clientX, lastTime: performance.now(), velocity: 0, axis: null };
    };
    const move = (event: TouchEvent) => {
      if (!gesture) return;
      if (event.touches.length !== 1) { settle(null); return; }
      const touch = event.touches[0], dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
      if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? "x" : "y";
      if (gesture.axis === "y") { gesture = null; return; }
      if (gesture.axis !== "x") return;
      if (!event.cancelable) { settle(null); return; }
      event.preventDefault();
      const now = performance.now();
      gesture.velocity = (touch.clientX - gesture.lastX) / Math.max(1, now - gesture.lastTime);
      gesture.lastX = touch.clientX; gesture.lastTime = now;
      const edge = (dx > 0 && index === 0) || (dx < 0 && index === pages.length - 1);
      offset = edge ? dx * .18 : Math.max(-element.clientWidth, Math.min(element.clientWidth, dx));
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const end = (event: TouchEvent) => {
      if (!gesture) return;
      if (gesture.axis !== "x" || event.touches.length || !event.changedTouches.length) { settle(null); return; }
      const dx = event.changedTouches[0].clientX - gesture.x;
      const velocity = performance.now() - gesture.lastTime < 100 ? gesture.velocity : 0;
      settle(swipeCommit(index, pages.length, dx, element.clientWidth, velocity));
    };
    const cancel = () => { if (gesture) settle(null); };
    const choose = (event: Event) => {
      const destination = routes.indexOf((event as CustomEvent<string>).detail);
      if (settling || destination < 0 || destination === index) return;
      settling = true;
      gesture = null;
      void loaders[destination]().then(() => { if (alive) setClickedPage(destination); }).catch(() => { settling = false; });
    };
    element.addEventListener("nami-select-trip-tab", choose);
    if (clickedPage !== null && clickedPage !== index) {
      settling = true;
      slider.setAttribute("data-swiping", "true");
      slider.style.setProperty("--swipe-duration", "0ms");
      slider.style.setProperty("--swipe-x", "0px");
      // Paint the selected pane alongside the current one before starting.
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => settle(clickedPage)); });
    }
    element.addEventListener("touchstart", begin, { passive: true });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end, { passive: true });
    element.addEventListener("touchcancel", cancel, { passive: true });
    window.addEventListener("resize", cancel);
    return () => {
      alive = false;
      element.removeEventListener("nami-select-trip-tab", choose);
      clearTimeout(timer); cancelAnimationFrame(frame);
      element.removeEventListener("touchstart", begin); element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end); element.removeEventListener("touchcancel", cancel);
      window.removeEventListener("resize", cancel);
      slider.removeAttribute("data-swiping"); slider.style.setProperty("--swipe-x", "0px"); slider.style.setProperty("--swipe-duration", "0ms");
    };
  }, [tripId, pathname, index, clickedPage]);
  if (index < 0) return <>{children}</>;
  return <div ref={root} className={styles.viewport}><div ref={track} className={styles.track}>
    {pages.map((Page, i) => (clickedPage === null ? Math.abs(i - index) <= 1 : i === index || i === clickedPage) && <div key={i} className={i === index ? styles.active : styles.neighbor} style={{ left: `${(clickedPage === null ? i - index : Math.sign(i - index)) * 100}%` }} inert={i !== index} aria-hidden={i !== index}>
      <TripPanePath.Provider value={routes[i]}><Suspense fallback={<div className={styles.placeholder}>{tripTabs[i].label}</div>}><Page /></Suspense></TripPanePath.Provider>
    </div>)}
  </div></div>;
}
