"use client";
import { useState } from "react";

// Local fixture UI only. Assertions read actual DOM geometry after native scroll.
export default function Diagnostics() {
  const [result, setResult] = useState("");
  const root = () => document.querySelector<HTMLElement>("#completed-trips-carousel")!;
  function snapshot() {
    const c = root(), r = c.getBoundingClientRect();
    return { viewport: innerWidth, clientWidth: c.clientWidth, max: c.scrollWidth - c.clientWidth, scrollLeft: c.scrollLeft,
      cards: Array.from(c.querySelectorAll<HTMLElement>(".trip-card")).map(e => ({ left: e.getBoundingClientRect().left - r.left, width: e.getBoundingClientRect().width })),
      previous: document.querySelector<HTMLButtonElement>('[aria-label$="completati verso sinistra"]')?.disabled,
      next: document.querySelector<HTMLButtonElement>('[aria-label$="completati verso destra"]')?.disabled,
      future: document.querySelectorAll(".trip-card:not(.completed)").length,
      photos: Array.from(document.querySelectorAll<HTMLImageElement>(".trip-card img")).filter(e => e.complete).length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  }
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  async function settled() {
    let before = -1, same = 0;
    for (let i = 0; i < 240; i++) {
      await frame(); const x = root().scrollLeft;
      same = Math.abs(x - before) < .1 ? same + 1 : 0; before = x;
      if (same >= 8) return;
    }
    throw Error("Native scroll did not settle");
  }
  async function run() {
    setResult("Running");
    const c = root(), errors: unknown[] = [], checks: unknown[] = [];
    const previous = document.querySelector<HTMLButtonElement>('[aria-label$="completati verso sinistra"]');
    const next = document.querySelector<HTMLButtonElement>('[aria-label$="completati verso destra"]');
    const home = () => c.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    try {
      home(); await settled();
      const initial = snapshot();
      const stops = initial.cards.map(e => Math.max(0, Math.min(initial.max, e.left - 3))).filter((v, i, a) => !i || v - a[i - 1] > 1);
      const check = (index: number, label: string) => {
        const s = snapshot(), expected = stops[index];
        const target = index === stops.length - 1 ? s.cards.at(-1) : s.cards[index];
        const fullyVisible = !!target && target.left >= 2 && target.left + target.width <= s.clientWidth - 2;
        checks.push({ label, expected, fullyVisible, ...s });
        if (Math.abs(s.scrollLeft - expected) > 1 || s.overflow || !fullyVisible) errors.push({ label, expected, actual: s.scrollLeft, overflow: s.overflow, fullyVisible });
        if (s.previous !== undefined && s.previous !== (index === 0)) errors.push({ label, incorrectPreviousDisabled: s.previous });
        if (s.next !== undefined && s.next !== (index === stops.length - 1)) errors.push({ label, incorrectNextDisabled: s.next });
      };
      check(0, "first");
      for (let i = 1; i < stops.length; i++) { next?.click(); await settled(); check(i, "next " + i); }
      for (let i = stops.length - 2; i >= 0; i--) { previous?.click(); await settled(); check(i, "previous " + i); }
      for (let i = 0; i < Math.min(3, stops.length - 1); i++) { next?.click(); await frame(); }
      await settled(); check(Math.min(3, stops.length - 1), "rapid");
      home(); await settled(); check(0, "home");
      c.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })); await settled(); check(stops.length - 1, "end");
      const final = snapshot();
      if (initial.cards.some((e, i) => Math.abs(e.width - final.cards[i].width) > 1)) errors.push("Card width changed after delayed photo");
      setResult(JSON.stringify({ initial, final, stops, errors, checks }, null, 2));
    } catch (error) { setResult(JSON.stringify({ error: String(error) })); }
  }
  return <footer style={{ padding: 16, background: "#fff", position: "relative", zIndex: 100 }}>
    <strong>SYNTHETIC LOCAL — <a href="/?cards=1">1 card</a> · <a href="/?cards=2">2 card</a> · <a href="/?cards=8">8 card</a></strong>
    <button onClick={() => setResult(JSON.stringify(snapshot(), null, 2))}>Misura carosello</button>
    <button onClick={run}>Verifica geometria</button>
    <pre id="carousel-diagnostics" style={{ whiteSpace: "pre-wrap" }}>{result}</pre>
  </footer>;
}
