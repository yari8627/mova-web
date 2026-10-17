const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), SSR = require('react-dom/server');
const fixture = ['IT','FR','GB','US','JP','AU','EG','BR'].map((countryCode, index) => ({ id: countryCode, countryCode, visitedAt: '2026-10-17', source: index === 1 ? 'position' : index === 2 ? 'trip' : 'manual' }));
function harness({ visits = fixture, geo = 'success', detectOK = true } = {}) {
  const state = [visits, [], '', '', false, false], effects = [], calls = [];
  let cursor = 0, keyboard;
  const context = { exports: {}, Intl, Date, console, navigator: {} };
  if (geo !== 'unsupported') context.navigator.geolocation = { getCurrentPosition: (success, failure, options) => { calls.push({ geolocation: options }); if (geo === 'denied') failure(); else void success({ coords: { latitude: 0, longitude: 0 } }); } };
  context.fetch = async (url, options) => {
    calls.push({ url, options });
    const body = JSON.parse(options?.body || '{}');
    const result = url === '/world-countries.json' ? JSON.parse(fs.readFileSync('public/world-countries.json', 'utf8')) : url === '/api/progress/detect-country' ? { countryCode: 'JP', error: 'Paese non riconosciuto.' } : options?.method === 'POST' ? { id: body.countryCode, countryCode: body.countryCode, source: body.source, visitedAt: '2026-10-17' } : visits;
    return { ok: url !== '/api/progress/detect-country' || detectOK, json: async () => result };
  };
  context.require = name => {
    if (name === 'react') return { useEffect: fn => effects.push(fn), useMemo: fn => fn(), useState: initial => { const i = cursor++; if (state[i] === undefined) state[i] = initial; return [state[i], value => state[i] = typeof value === 'function' ? value(state[i]) : value]; } };
    if (name === 'next/navigation') return { useRouter: () => ({ push: path => calls.push({ route: path }) }) };
    if (name.endsWith('/use-autocomplete-keyboard')) return { useAutocompleteKeyboard: options => { keyboard = options; return { onKeyDown() {}, activeIndex: -1, setActiveIndex() {} }; } };
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    return require(name);
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/progress/page.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
  const render = () => { cursor = 0; return context.exports.default(); };
  return { state, effects, calls, render, html: () => SSR.renderToStaticMarkup(render()), keyboard: () => keyboard };
}
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const find = (h, predicate) => nodes(h.render()).find(predicate);
const flush = () => new Promise(resolve => setImmediate(resolve));
test('world count, rounding, last added country and all six continent statistics use the original data', () => {
  const h = harness(), html = h.html();
  assert(html.includes('4,1%')); assert(html.includes('Paesi visitati su 195'));
  assert(html.includes('Ultimo Paese aggiunto</span><strong>Italia'));
  assert.equal(find(h, n => n.props?.role === 'progressbar').props['aria-valuenow'], 8 / 195 * 100);
  const continents = find(h, n => n.props?.className === 'continent-progress-grid');
  assert.equal(nodes(continents).filter(n => n.type === 'article').length, 6);
  assert(html.includes('Europa')); assert(html.includes('Oceania')); assert(html.includes('3 su 44 Paesi'));
});
test('initial six preserve alphabetic order and flags; expanding and searching never change the total', () => {
  const h = harness();
  const rows = () => nodes(find(h, n => n.props?.className === 'visited-list')).filter(n => n.type === 'article');
  assert.equal(rows().length, 6);
  const initialNames = rows().map(n => nodes(n).find(n => n.type === 'strong').props.children);
  assert.deepEqual(initialNames, [...initialNames].sort((a,b) => a.localeCompare(b,'it',{sensitivity:'base'})));
  assert(h.html().includes(require('country-state-city').Country.getCountryByCode('FR').flag));
  const more = () => find(h, n => n.props?.['aria-controls'] === 'visited-country-list');
  more().props.onClick(); assert.equal(rows().length, 8);
  more().props.onClick(); assert.equal(rows().length, 6);
  find(h, n => n.props?.role === 'combobox').props.onChange({ target: { value: 'giapp' } });
  assert.equal(rows().length, 8); assert.equal(h.state[0].length, 8);
  assert(h.html().includes('Giappone')); assert(h.html().includes('Già visitato'));
});
test('actual world topology loads once and search additions and trash removal keep all views synchronized', async () => {
  const h = harness(); h.render(); h.effects[0](); await flush();
  assert(h.state[1].length > 150);
  assert.equal(h.calls.filter(c => c.url === '/world-countries.json').length, 1);
  assert(!h.calls.some(c => c.geolocation));
  const italy = () => find(h, n => n.type === 'path' && n.props['aria-label']?.startsWith('Italia'));
  assert.equal(italy().props.className, 'visited');
  assert.equal(typeof nodes(italy()).find(n => n.type === 'title').props.children, 'string');
  find(h, n => n.props?.role === 'combobox').props.onChange({ target: { value: 'giapp' } });
  h.render(); h.keyboard().onSelect(0); await flush();
  assert.equal(h.state[0].length, 8); assert.equal(h.state[0][0].countryCode, 'JP');
  assert.equal(h.state[2], '');
  assert.equal(h.state[3], ''); assert(!h.html().includes('progress-message'));
  await find(h, n => n.props?.['aria-label'] === 'Rimuovi IT').props.onClick();
  assert.equal(h.state[0].length, 7); assert.equal(italy().props.className, '');
  find(h, n => n.props?.role === 'combobox').props.onChange({ target: { value: 'italia' } });
  h.render(); h.keyboard().onSelect(0); await flush();
  assert.equal(h.state[0].length, 8); assert.equal(italy().props.className, 'visited');
  assert(!h.html().includes('progress-message'));
  assert(h.html().includes('3 su 44 Paesi'));
  assert.equal(h.calls.filter(c => c.url === '/world-countries.json').length, 1);
});
test('geolocation runs only after explicit action and preserves source, privacy options and denied permissions', async () => {
  const h = harness({ visits: [] }); h.render(); assert(!h.calls.some(c => c.geolocation));
  find(h, n => n.props?.onClick?.name === 'detectCountry').props.onClick(); await flush();
  assert.equal(h.state[0][0].source, 'position'); assert.equal(h.state[0][0].countryCode, 'JP');
  assert.equal(h.calls.find(c => c.geolocation).geolocation.enableHighAccuracy, false);
  assert.equal(h.state[4], false); assert(!h.html().includes('progress-message'));
  for (const geo of ['denied', 'unsupported']) {
    const denied = harness({ geo });
    find(denied, n => n.props?.onClick?.name === 'detectCountry').props.onClick();
    assert(denied.state[3].includes(geo === 'denied' ? 'Permesso posizione' : 'non è supportata'));
    assert(denied.html().includes('progress-message'));
    assert.equal(denied.state[4], false); assert(!denied.calls.some(c => c.url));
  }
  const failure = harness({ detectOK: false });
  find(failure, n => n.props?.onClick?.name === 'detectCountry').props.onClick(); await flush();
  assert.equal(failure.state[3], 'Paese non riconosciuto.'); assert.equal(failure.state[4], false);
});
test('empty state keeps zero statistics, no fabricated last country and no unnecessary show-all', () => {
  const h = harness({ visits: [] }), html = h.html();
  assert(html.includes('0%')); assert(html.includes('Ultimo Paese aggiunto</span><strong>—'));
  assert(html.includes('pronta per il primo Paese')); assert(!html.includes('Mostra tutti'));
  assert(html.includes('OpenStreetMap')); assert(!html.includes('Gestisci viaggio'));
});

test('continental section preserves headings and six bars without the duplicate world badge', () => {
  const h = harness();
  const section = find(h, n => n.props?.className === 'continent-progress');
  const header = nodes(section).find(n => n.type === 'header');
  assert.equal(nodes(header).filter(n => n.type === 'strong').length, 0);
  assert.equal(nodes(section).filter(n => n.props?.className === 'continent-progress-track').length, 6);
  assert(h.html().includes('Quanto mondo hai esplorato'));
  assert(h.html().includes('PROGRESSI PER CONTINENTE'));
  assert(!h.html().includes('8 / 195'));
});

test('map is display-only: no mutation handlers or keyboard targets on any country or ancestor', async () => {
  const h = harness(); h.render(); h.effects[0](); await flush();
  const map = find(h, n => n.props?.className === 'world-map-wrap');
  const snapshot = JSON.stringify(h.state[0]), requests = h.calls.length;
  const paths = nodes(map).filter(n => n.type === 'path');
  assert(paths.some(n => n.props.className === 'visited'));
  assert(paths.some(n => n.props.className === ''));
  for (const node of nodes(map)) {
    assert(!Object.keys(node.props).some(key => /^on[A-Z]/.test(key)), 'no event handlers in map subtree');
    assert.equal(node.props.tabIndex, undefined); assert.notEqual(node.props.role, 'button');
  }
  const root = h.render();
  assert(!Object.keys(root.props).some(key => /^on[A-Z]/.test(key)));
  assert(!Object.keys(find(h, n => n.props?.className === 'world-progress-layout').props).some(key => /^on[A-Z]/.test(key)));
  assert(!Object.keys(find(h, n => n.props?.className === 'world-map-card').props).some(key => /^on[A-Z]/.test(key)));
  assert.equal(find(h, n => n.type === 'svg').props.role, 'img');
  assert(h.html().includes('I Paesi che hai visitato, tutti sulla tua mappa.'));
  assert(!h.html().includes('Clicca per aggiungere'));
  assert(!h.html().includes('Seleziona un Paese sulla mappa'));
  assert.equal(JSON.stringify(h.state[0]), snapshot); assert.equal(h.calls.length, requests);
});
test('header has only the original Home wordmark and no back button', () => {
  const h = harness();
  const header = find(h, n => n.props?.className === 'progress-topbar');
  const buttons = nodes(header).filter(n => n.type === 'button');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].props['aria-label'], 'NAMI Travel, torna alla Home');
  buttons[0].props.onClick(); assert.equal(h.calls.at(-1).route, '/');
  assert(!h.html().includes('aria-label="Torna alla Home"'));
});

test('existing bottom navigation retains all four destinations and Progressi active state', () => {
  const calls = [], context = { exports: {}, require: name => name === 'next/navigation' ? { usePathname: () => '/progress', useRouter: () => ({ push: path => calls.push(path) }) } : require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/components/app-bottom-nav.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const buttons = nodes(context.exports.AppBottomNav()).filter(n => n.type === 'button');
  assert.equal(buttons.length, 4);
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(calls, ['/', '/progress', '/about', '/settings/profile']);
  assert.equal(buttons[1].props['aria-current'], 'page');
});
