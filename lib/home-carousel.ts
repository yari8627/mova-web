export type CarouselBounds = { previous: boolean; next: boolean };

/** Native scrolling, with absolute snap destinations and no animation timers. */
export function createHomeCarousel(element: HTMLElement, onBounds: (bounds: CarouselBounds) => void) {
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  const measure = () => {
    const max = Math.max(0, element.scrollWidth - element.clientWidth);
    const padding = parseFloat(getComputedStyle(element).scrollPaddingInlineStart) || 0;
    const left = element.getBoundingClientRect().left + element.clientLeft + padding;
    const positions = [0];
    for (const card of element.querySelectorAll<HTMLElement>(".trip-card")) {
      const position = clamp(element.scrollLeft + card.getBoundingClientRect().left - left, max);
      // Fractional layout and Safari overscroll must not create duplicate stops.
      if (position - positions[positions.length - 1] > 1) positions.push(position);
    }
    return positions;
  };
  let positions = measure(), width = element.clientWidth;
  const nearest = () => positions.reduce((best, position, index) =>
    Math.abs(position - element.scrollLeft) < Math.abs(positions[best] - element.scrollLeft) ? index : best, 0);
  let requested: number | null = null, anchor = nearest(), lastBounds = "";
  const publish = (index: number) => {
    anchor = index;
    const bounds = { previous: index > 0, next: index < positions.length - 1 };
    const key = `${bounds.previous}|${bounds.next}`;
    if (key !== lastBounds) { lastBounds = key; onBounds(bounds); }
  };
  const scroll = () => {
    // Native re-snapping during resize must not reinterpret the old geometry.
    if (width !== element.clientWidth) return;
    if (requested !== null && Math.abs(element.scrollLeft - positions[requested]) <= 1) requested = null;
    publish(requested ?? nearest());
  };
  const manual = () => { requested = null; publish(nearest()); };
  const navigate = (index: number, behavior: ScrollBehavior) => {
    requested = clamp(index, positions.length - 1);
    publish(requested);
    element.scrollTo({ left: positions[requested], behavior });
  };
  const resize = () => {
    const next = measure();
    if (width === element.clientWidth && next.length === positions.length && next.every((p, i) => Math.abs(p - positions[i]) <= 1)) return;
    positions = next; width = element.clientWidth;
    navigate(anchor, "instant");
  };
  element.addEventListener("scroll", scroll, { passive: true });
  const inputs = ["pointerdown", "touchstart", "wheel", "focusin"];
  inputs.forEach(event => element.addEventListener(event, manual, { passive: true }));
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  if (observer) {
    observer.observe(element);
    element.querySelectorAll(".trip-card").forEach(card => observer.observe(card));
  } else window.addEventListener("resize", resize);
  publish(anchor);
  return {
    step(direction: -1 | 1) {
      positions = measure(); width = element.clientWidth;
      const start = requested === null ? nearest() : Math.min(requested, positions.length - 1);
      navigate(start + direction, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth");
    },
    edge(edge: "start" | "end") {
      positions = measure(); width = element.clientWidth;
      navigate(edge === "start" ? 0 : positions.length - 1, "instant");
    },
    destroy() {
      element.removeEventListener("scroll", scroll);
      inputs.forEach(event => element.removeEventListener(event, manual));
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", resize);
    },
  };
}
