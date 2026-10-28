"use client";
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Fixture-only instrumentation: observe real native scrolling/focus and routing.
export default function Diagnostics() {
  const events = useRef<unknown[]>([]), [result, setResult] = useState('');
  const router = useRouter();
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  async function until(check: () => boolean) { for (let i = 0; i < 600; i++) { if (check()) return; await frame(); } throw new Error('Fixture condition not reached'); }
  async function run() {
    setResult('Running');
    const cases: unknown[] = [], failures: unknown[] = [], frames: unknown[] = [];
    let watching = true, last = '';
    const sample = () => {
      const cover = document.querySelector('.shared-trip-cover');
      const state = { path: location.pathname, y: scrollY, coverTop: cover?.getBoundingClientRect().top };
      const key = JSON.stringify(state);
      if (key !== last) { frames.push(state); last = key; }
      if (watching) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    try {
      for (const [id, label] of [['fixture-2', 'Concluso'], ['fixture-0', 'Futuro'], ['fixture-1', 'In corso']]) {
        router.push('/');
        await until(() => location.pathname === '/' && !!document.querySelector('.trip-card'));
        const card = Array.from(document.querySelectorAll<HTMLElement>('.trip-card')).find(e => e.textContent?.includes(label))!;
        card.scrollIntoView({ block: 'center', behavior: 'instant' });
        const homeY = scrollY, homeCarousel = document.querySelector('#completed-trips-carousel')?.scrollLeft;
        card.click();
        await until(() => location.pathname === `/trips/${id}/overview` && !!document.querySelector('.shared-trip-cover h1'));
        for (let i = 0; i < 8; i++) await frame();
        const first = { y: scrollY, coverTop: document.querySelector('.shared-trip-cover')!.getBoundingClientRect().top };
        await until(() => !!document.querySelector<HTMLImageElement>('.shared-trip-cover img')?.naturalWidth);
        const late = { y: scrollY, coverTop: document.querySelector('.shared-trip-cover')!.getBoundingClientRect().top };
        if (first.y !== 0 || first.coverTop < 0 || late.y !== 0) failures.push({ id, first, late });
        router.back(); await until(() => location.pathname === '/' && !!document.querySelector('.trip-card'));
        for (let i = 0; i < 8; i++) await frame();
        cases.push({ id, homeY, homeCarousel, first, late, returnedY: scrollY, returnedCarousel: document.querySelector('#completed-trips-carousel')?.scrollLeft });
      }
      router.forward(); await until(() => location.pathname === '/trips/fixture-1/overview' && !!document.querySelector('.shared-trip-cover'));
      for (let i = 0; i < 8; i++) await frame();
      if (scrollY !== 0) failures.push({ forwardY: scrollY });
      watching = false;
      setResult(JSON.stringify({ viewport: innerWidth, failures, cases, frames, forwardY: scrollY, overflow: document.documentElement.scrollWidth > innerWidth }, null, 2));
    } catch (error) { watching = false; setResult(JSON.stringify({ failures: [String(error)], cases, frames })); }
  }
  useEffect(() => {
    const into = Element.prototype.scrollIntoView, focus = HTMLElement.prototype.focus;
    const record = (kind: string, target?: Element) => events.current.push({ kind, path: location.pathname, y: scrollY, target: target?.className, stack: new Error().stack?.split('\n').slice(2, 7) });
    Element.prototype.scrollIntoView = function(...args) { record('scrollIntoView', this); return into.apply(this, args); };
    HTMLElement.prototype.focus = function(...args) { record('focus', this); return focus.apply(this, args); };
    const scroll = () => record('scroll');
    window.addEventListener('scroll', scroll, { passive: true });
    return () => { Element.prototype.scrollIntoView = into; HTMLElement.prototype.focus = focus; window.removeEventListener('scroll', scroll); };
  }, []);
  function measure() {
    const cover = document.querySelector('.shared-trip-cover'), carousel = document.querySelector('#completed-trips-carousel');
    setResult(JSON.stringify({ path: location.pathname, y: scrollY, coverTop: cover?.getBoundingClientRect().top, focused: document.activeElement?.outerHTML.slice(0, 180), carousel: carousel?.scrollLeft, events: events.current.slice(-20) }, null, 2));
  }
  return <aside style={{ position: 'fixed', right: 2, top: 2, zIndex: 2000, fontSize: 10 }}><button onClick={measure}>Misura apertura</button><button onClick={run}>Verifica aperture</button>{result && <details open><summary>Diagnosi sintetica</summary><pre id="entry-result" style={{ background: '#fff', maxHeight: 180, maxWidth: 280, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{result}</pre></details>}</aside>;
}
