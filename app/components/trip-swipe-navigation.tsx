"use client";

import { ReactNode, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { swipeDestination } from "../../lib/trip-navigation";

export function TripSwipeNavigation({ tripId, children }: { tripId: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let start: { x: number; y: number; time: number; axis: "x" | "y" | null } | null = null;
    let navigating = false;
    let unlock: ReturnType<typeof setTimeout>;
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
      start = null;
      if (navigating || event.touches.length !== 1 || blocked(event.target)) return;
      const touch = event.touches[0];
      // Leave the screen edges to the browser/OS back gesture.
      if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
      start = { x: touch.clientX, y: touch.clientY, time: performance.now(), axis: null };
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1) { start = null; return; }
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (!start.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 12) start.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? "x" : "y";
      if (start.axis === "y") { start = null; return; }
      if (start.axis === "x" && event.cancelable) event.preventDefault();
    };
    const end = (event: TouchEvent) => {
      const gesture = start;
      start = null;
      if (!gesture || event.touches.length || !event.changedTouches.length) return;
      const touch = event.changedTouches[0];
      const next = swipeDestination(tripId, pathname, touch.clientX - gesture.x, touch.clientY - gesture.y, performance.now() - gesture.time);
      if (!next) return;
      navigating = true;
      router.push(next, { scroll: false });
      unlock = setTimeout(() => { navigating = false; }, 1500);
    };
    const cancel = () => { start = null; };
    element.addEventListener("touchstart", begin, { passive: true });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end, { passive: true });
    element.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      clearTimeout(unlock);
      element.removeEventListener("touchstart", begin);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", cancel);
    };
  }, [tripId, pathname, router]);
  return <div ref={root}>{children}</div>;
}
