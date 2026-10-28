const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm');
function harness(trip = 'completed', route = `/trips/${trip}/overview`, initialY = 480) {
  const refs = [], layouts = [], calls = []; let cursor = 0, layoutCursor = 0, path = route, y = initialY;
  const nav = { exports: {} };
  const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2021 } }).outputText;
  vm.runInNewContext(compile('lib/trip-navigation.ts'), nav);
  const history = { scrollRestoration: 'auto' };
  const ctx = { exports: {}, window: { history, scrollTo: options => { calls.push(options); y = options.top; } }, require(name) {
    if (name === 'react') return { useState: () => [null, () => {}], useRef: initial => refs[cursor++] ?? (refs[cursor - 1] = { current: initial }), useEffect() {}, useLayoutEffect(fn, deps) { const i = layoutCursor++, prev = layouts[i]; if (!prev || deps.some((d, n) => d !== prev.deps[n])) layouts[i] = { fn, deps, pending: true }; } };
    if (name === 'next/navigation') return { usePathname: () => path };
    if (name === 'next/dynamic') return { default: () => () => null };
    if (name.includes('trip-navigation')) return nav.exports;
    if (name.includes('trip-pane-path')) return { TripPanePath: { Provider: 'provider' } };
    if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
    return { default: {} };
  } };
  vm.runInNewContext(compile('app/components/trip-swipe-navigation.tsx'), ctx);
  return { calls, history, y: () => y, scroll(value) { y = value; }, render(nextTrip = trip, nextPath = path) { trip = nextTrip; path = nextPath; cursor = layoutCursor = 0; ctx.exports.TripSwipeNavigation({ tripId: trip, children: null }); }, commit() { for (const l of layouts) if (l.pending) { l.pending = false; l.fn(); } } };
}
for (const trip of ['completed', 'future', 'active']) test(`${trip}: overview entry resets vertical scroll synchronously before paint`, () => { const h = harness(trip); h.render(); assert.equal(h.y(), 480); h.commit(); assert.equal(h.y(), 0); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].behavior, 'instant'); });
// BUG-016 intentionally changes the old internal-tab scroll preservation rule.
test('internal tabs reset once at commit; unchanged-section re-renders retain scroll', () => { const h = harness(); h.render(); h.commit(); h.scroll(340); const before = h.calls.length; h.render('completed', '/trips/completed/packing'); h.commit(); assert.equal(h.y(), 0); h.scroll(220); h.render('completed', '/trips/completed/overview'); h.commit(); assert.equal(h.y(), 0); h.scroll(180); h.render(); h.commit(); assert.equal(h.calls.length, before + 2); assert.equal(h.y(), 180); });
test('a different trip receives its own one-time entry reset', () => { const h = harness(); h.render(); h.commit(); h.scroll(650); h.render('other', '/trips/other/overview'); h.commit(); assert.equal(h.y(), 0); assert.equal(h.calls.length, 2); });
test('direct itinerary entry retains its existing rule; explicit overview change starts at top', () => { const h = harness('active', '/trips/active', 275); h.render(); h.commit(); assert.equal(h.y(), 275); h.render('active', '/trips/active/overview'); h.commit(); assert.equal(h.y(), 0); assert.equal(h.calls.length, 1); });
test('direct overview and refresh mounts both start at the top', () => { for (const y of [0, 700]) { const h = harness('future', '/trips/future/overview', y); h.render(); h.commit(); assert.equal(h.y(), 0); } });
test('no global scroll restoration policy or Home/carousel scroll is changed', () => { const h = harness(); h.render(); h.commit(); const count = h.calls.length; h.scroll(123); h.render('completed', '/'); h.commit(); assert.equal(h.history.scrollRestoration, 'auto'); assert.equal(h.y(), 123); assert.equal(h.calls.length, count); });
test('late data/photo re-render cannot cause another scroll jump', () => { const h = harness(); h.render(); h.commit(); h.scroll(250); for (let i = 0; i < 5; i++) { h.render(); h.commit(); } assert.equal(h.y(), 250); assert.equal(h.calls.length, 1); });
