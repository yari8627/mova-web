"use client";
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Diagnostics() {
  const router = useRouter(), calls = useRef<unknown[]>([]), [result, setResult] = useState('');
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const main = () => Array.from(document.querySelectorAll<HTMLElement>('.trip-detail-shell')).find(e => !e.closest('[inert]'));
  const snapshot = () => ({ path: location.pathname, y: scrollY, coverTop: main()?.querySelector('.shared-trip-cover')?.getBoundingClientRect().top,
    selectedDay: main()?.querySelector('.itinerary-day-nav [aria-pressed="true"]')?.getAttribute('aria-controls'), focusInert: !!document.activeElement?.closest('[inert]') });
  const tab = (label: string) => Array.from(main()!.querySelectorAll<HTMLButtonElement>('.detail-tabs button')).find(e => e.textContent === label)!;
  async function until(check: () => boolean) { for (let i = 0; i < 700; i++) { if (check()) return; await frame(); } throw new Error('Fixture condition not reached'); }
  async function settled() { for (let i = 0; i < 12; i++) await frame(); }
  async function change(label: string, suffix: string) {
    const before = calls.current.length;
    tab(label).click(); await until(() => location.pathname === '/trips/fixture-0' + suffix && !!main()?.querySelector('.shared-trip-cover h1'));
    await settled(); return { ...snapshot(), resetCalls: calls.current.length - before };
  }
  function gesture(dx: number, dy = 0) {
    const target = main()!.querySelector('.trip-swipe-body')!;
    const start = { clientX: dx > 0 ? 100 : 270, clientY: 300 };
    const end = { clientX: start.clientX + dx, clientY: start.clientY + dy };
    for (const [type, touch] of [['touchstart', start], ['touchmove', end], ['touchend', end]] as const) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: { value: type === 'touchend' ? [] : [touch] }, changedTouches: { value: [touch] } });
      target.dispatchEvent(event);
    }
  }
  useEffect(() => {
    const original = window.scrollTo;
    window.scrollTo = ((...args: Parameters<typeof window.scrollTo>) => { calls.current.push({ path: location.pathname, args }); (original as Function).apply(window, args); }) as typeof window.scrollTo;
    return () => { window.scrollTo = original; };
  }, []);
  async function run() {
    setResult('Running'); const cases: unknown[] = [], failures: unknown[] = [], frames: ReturnType<typeof snapshot>[] = [];
    let observing = false, sampleAlive = true, previous = '';
    const sample = () => { if (observing) { const s = snapshot(), key = JSON.stringify(s); if (key !== previous) { frames.push(s); previous = key; } } if (sampleAlive) requestAnimationFrame(sample); };
    requestAnimationFrame(sample);
    const check = (label: string, state: ReturnType<typeof snapshot>) => { cases.push({ label, ...state }); if (state.y !== 0 || (state.coverTop ?? -1) < 0 || state.focusInert || ('resetCalls' in state && state.resetCalls !== 1)) failures.push({ label, ...state }); };
    try {
      router.push('/trips/fixture-0/apps'); await until(() => location.pathname.endsWith('/apps') && !!main()?.querySelector('.useful-app-card')); await settled();
      for (const [label, fraction] of [['apps-bottom-to-overview', 1], ['apps-middle-to-overview', .5]] as const) {
        if (!location.pathname.endsWith('/apps')) await change('App Utili', '/apps');
        window.scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * fraction, behavior: 'instant' }); await settled();
        const before = snapshot(); observing = true; const after = await change('Panoramica', '/overview'); observing = false;
        cases.push({ label: label + '-source', ...before }); check(label, after);
      }
      await change('Itinerario', ''); window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); await settled();
      check('itinerary-bottom-to-overview', await change('Panoramica', '/overview'));
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); await settled();
      check('overview-bottom-to-apps', await change('App Utili', '/apps'));
      for (let i = 0; i < 2; i++) { check('repeat-overview-' + i, await change('Panoramica', '/overview')); check('repeat-apps-' + i, await change('App Utili', '/apps')); }
      // Extra taps while settling must not desynchronize the active route and pane.
      tab('Panoramica').click(); tab('Itinerario').click(); tab('Panoramica').click();
      await until(() => location.pathname.endsWith('/overview') && !!main()?.querySelector('.overview-heading')); await settled(); check('rapid-tabs', snapshot());
      gesture(-150); await until(() => location.pathname.endsWith('/packing') && !!main()?.querySelector('.packing-checklist')); await settled(); check('synthetic-swipe-next', snapshot());
      gesture(150); await until(() => location.pathname.endsWith('/overview') && !!main()?.querySelector('.overview-heading')); await settled(); check('synthetic-swipe-previous', snapshot());
      await change('Itinerario', '');
      main()!.querySelector<HTMLButtonElement>('.itinerary-day-nav [aria-controls="itinerary-day-2"]')!.click();
      await until(() => snapshot().selectedDay === 'itinerary-day-2');
      window.scrollTo({ top: 150, behavior: 'instant' });
      await until(() => !!main()?.querySelector<HTMLImageElement>('.shared-trip-cover img')?.naturalWidth); await settled();
      cases.push({ label: 'selected-day-after-photo-and-vertical-scroll', ...snapshot() });
      if (snapshot().selectedDay !== 'itinerary-day-2') failures.push('selected day changed');
      check('after-day-selection-to-overview', await change('Panoramica', '/overview'));
      await until(() => !!main()?.querySelector<HTMLImageElement>('.shared-trip-cover img')?.naturalWidth);
      window.scrollTo({ top: 200, behavior: 'instant' }); await settled();
      const beforeCalls = calls.current.length, beforeHeight = snapshot();
      const extra = document.createElement('div'); extra.style.height = '350px'; extra.textContent = 'SYNTHETIC HEIGHT CHANGE'; main()!.append(extra); await settled();
      cases.push({ label: 'height-change-no-reset', before: beforeHeight, after: snapshot(), resetCalls: calls.current.length - beforeCalls });
      if (calls.current.length !== beforeCalls) failures.push('height change triggered reset'); extra.remove();
      sampleAlive = false;
      setResult(JSON.stringify({ viewport: innerWidth, failures, cases, frames, calls: calls.current, overflow: document.documentElement.scrollWidth > innerWidth }, null, 2));
    } catch (error) { sampleAlive = false; setResult(JSON.stringify({ failures: [String(error)], cases, frames })); }
  }
  function measure() { setResult(JSON.stringify({ ...snapshot(), calls: calls.current }, null, 2)); }
  return <aside style={{ position: 'fixed', right: 2, top: 2, zIndex: 2000, fontSize: 10 }}><button onClick={measure}>Misura sezione</button><button onClick={run}>Verifica sezioni</button>{result && <details open><summary>Diagnosi sintetica</summary><pre id="section-result" style={{ background: '#fff', maxHeight: 180, maxWidth: 270, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{result}</pre></details>}</aside>;
}
