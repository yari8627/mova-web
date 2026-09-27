"use client";
import { ReactNode, Suspense, useEffect, useLayoutEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { tripTabs, swipeCommit } from "../../lib/trip-navigation";
import { TripPanePath } from "./trip-pane-path";
import styles from "./trip-swipe-navigation.module.css";
const pages = [
  dynamic(() => import("../trips/[id]/overview/page")),
  dynamic(() => import("../trips/[id]/packing/page")),
  dynamic(() => import("../trips/[id]/page")),
  dynamic(() => import("../trips/[id]/bookings/page")),
  dynamic(() => import("../trips/[id]/documents/page")),
  dynamic(() => import("../trips/[id]/expenses/page")),
  dynamic(() => import("../trips/[id]/participants/page")),
  dynamic(() => import("../trips/[id]/apps/page")),
];
export function TripSwipeNavigation({ tripId, children }: { tripId: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const routes = tripTabs.map(tab => `/trips/${tripId}${tab.path ? `/${tab.path}` : ""}`);
  const index = routes.indexOf(pathname);
  useLayoutEffect(() => {
    if (track.current) { track.current.style.transition = "none"; track.current.style.transform = "none"; }
  }, [pathname]);
  useEffect(() => {
    const element = root.current, slider = track.current;
    if (!element || !slider || index < 0) return;
    let gesture: { x: number; y: number; lastX: number; lastTime: number; velocity: number; axis: "x" | "y" | null } | null = null;
    let settling = false, offset = 0, frame = 0;
    let timer: ReturnType<typeof setTimeout>;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paint = () => { frame = 0; slider.style.transform = `translate3d(${offset}px,0,0)`; };
    const settle = (destination: number | null) => {
      gesture = null; settling = true;
      cancelAnimationFrame(frame); frame = 0;
      const duration = reduced ? 0 : 280;
      slider.style.transition = `transform ${duration}ms cubic-bezier(.22,.75,.25,1)`;
      offset = destination === null ? 0 : (destination > index ? -element.clientWidth : element.clientWidth);
      paint();
      timer = setTimeout(() => {
        if (destination !== null) window.history.pushState(null, "", routes[destination]);
        else { slider.style.transform = "none"; slider.style.transition = "none"; }
        settling = false;
      }, duration);
    };
    const blocked = (target: EventTarget | null) => {
      if (!(target instanceof Element) || document.querySelector('[role="dialog"], .modal-backdrop')) return true;
      if (target.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="slider"], [draggable="true"], .leaflet-container, .detail-tabs, [data-no-swipe]')) return true;
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
      slider.style.transition = "none";
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
    element.addEventListener("touchstart", begin, { passive: true });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end, { passive: true });
    element.addEventListener("touchcancel", cancel, { passive: true });
    window.addEventListener("resize", cancel);
    return () => {
      clearTimeout(timer); cancelAnimationFrame(frame);
      element.removeEventListener("touchstart", begin); element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end); element.removeEventListener("touchcancel", cancel);
      window.removeEventListener("resize", cancel);
      slider.style.transform = "none"; slider.style.transition = "none";
    };
  }, [tripId, pathname, index]);
  if (index < 0) return <>{children}</>;
  return <div ref={root} className={styles.viewport}><div ref={track} className={styles.track}>
    {pages.map((Page, i) => Math.abs(i - index) <= 1 && <div key={i} className={i === index ? styles.active : styles.neighbor} style={{ left: `${(i - index) * 100}%` }} inert={i !== index} aria-hidden={i !== index}>
      <TripPanePath.Provider value={routes[i]}><Suspense fallback={<div className={styles.placeholder}>{tripTabs[i].label}</div>}><Page /></Suspense></TripPanePath.Provider>
    </div>)}
  </div></div>;
}
