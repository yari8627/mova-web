const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), SSR = require('react-dom/server');
const trip = { id: 'trip', name: 'Viaggio di prova', country: 'Italia', countryCode: 'IT', city: 'Roma', startDate: '2026-10-20', endDate: '2026-10-25', people: 3, theme: 'blue', owner: { email: 'owner@example.test' }, participants: [{ email: 'confirmed@example.test', name: 'Confermato', status: 'confirmed' }, { email: 'pending@example.test', name: 'In attesa', status: 'pending' }, { email: 'OWNER@example.test', name: 'Proprietario', status: 'confirmed' }, { email: 'legacy-owner@example.test', name: 'Proprietario precedente nei dati', status: 'confirmed', role: 'owner' }] };
function harness(role = 'owner', { accepted = true, ok = true } = {}) {
  const state = [{ ...trip }, [], '', ''], calls = [], effects = [], storage = new Map([['mova-trips', JSON.stringify([{ id: 'trip' }, { id: 'other' }])]]);
  let cursor = 0;
  const localStorage = { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) };
  const context = { exports: {}, localStorage, confirm: text => { calls.push({ confirm: text }); return accepted; }, fetch: async (url, options) => { calls.push({ url, options }); return { ok, json: async () => ({ error: 'Errore di prova' }) }; } };
  context.require = name => {
    if (name === 'react') return { useEffect: fn => effects.push(fn), useState: initial => { const i = cursor++; if (state[i] === undefined) state[i] = initial; return [state[i], value => state[i] = value]; } };
    if (name === 'next/navigation') return { useParams: () => ({ id: 'trip' }), useRouter: () => ({ push: url => calls.push({ push: url }), replace: url => calls.push({ replace: url }), refresh: () => calls.push({ refresh: true }) }) };
    if (name.endsWith('/use-trip-permissions')) return { useTripPermissions: () => ({ role, canManage: role === 'owner' || role === 'co-organizer' }) };
    if (name.endsWith('/trip-client-cache')) return { readTripSnapshot: () => trip, fetchTripSnapshot: async () => trip, removeTripSnapshot: id => calls.push({ invalidated: id }) };
    if (/\/trip-(header|tabs|cover)$/.test(name)) return { TripHeader: () => null, TripTabs: () => null, TripCover: () => null };
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    return require(name);
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/trips/[id]/settings/page.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const render = () => { cursor = 0; return context.exports.default(); };
  return { state, calls, effects, storage, render, html: () => SSR.renderToStaticMarkup(render()) };
}
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const button = (h, name) => nodes(h.render()).find(n => n.type === 'button' && n.props.onClick?.name === name);
const flush = () => new Promise(resolve => setImmediate(resolve));
test('roles preserve main form access and owner-only advanced controls', () => {
  for (const role of ['owner', 'co-organizer', 'participant']) {
    const h = harness(role), html = h.html();
    assert.equal(html.includes('Informazioni principali'), role !== 'participant');
    assert.equal(html.includes('Elimina definitivamente'), role === 'owner');
    assert.equal(html.includes('Esci dal viaggio'), role !== 'owner');
  }
});
test('prefill retains all fields and only confirmed people can be selected for transfer', async () => {
  const h = harness(); h.render(); h.effects[0](); await flush();
  assert.equal(h.state[0].countryCode, 'IT'); assert.equal(h.state[0].startDate, '2026-10-20');
  const options = nodes(h.render()).filter(n => n.type === 'option');
  assert.equal(options.length, 2); assert.equal(options[1].props.value, 'confirmed@example.test');
  const dates = nodes(h.render()).filter(n => n.type === 'input' && n.props.type === 'date');
  assert.equal(dates.length, 2); assert(dates.every(n => n.props.required));
  assert.equal(dates[1].props.min, h.state[0].startDate);
});
test('saving uses the unchanged draft and reports existing success and error responses', async () => {
  for (const ok of [true, false]) {
    const h = harness('owner', { ok });
    await nodes(h.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
    const request = h.calls.find(c => c.url);
    assert.equal(request.options.method, 'PATCH'); assert.equal(request.url, '/api/trips/trip');
    assert.deepEqual(JSON.parse(request.options.body), h.state[0]);
    assert.equal(h.state[2], ok ? 'Modifiche salvate' : 'Errore di prova');
    assert.equal(h.calls.some(c => c.invalidated), ok);
  }
});
test('archive, transfer, remove and leave never call APIs when confirmation is cancelled', async () => {
  for (const action of ['archive','transfer','remove','leave']) {
    const h = harness(action === 'leave' ? 'participant' : 'owner', { accepted: false });
    h.render(); h.effects[0]();
    h.state[3] = 'confirmed@example.test';
    await button(h, action).props.onClick();
    assert(h.calls.some(c => c.confirm)); assert(!h.calls.some(c => c.url));
  }
});
test('confirmed owner actions retain endpoints, cache cleanup and navigation in mocks', async () => {
  const archived = harness(); await button(archived, 'archive').props.onClick();
  assert.deepEqual(JSON.parse(archived.calls.find(c => c.url).options.body), { archived: true });
  assert(archived.calls.some(c => c.push === '/'));
  const transferred = harness(); transferred.render(); transferred.effects[0](); transferred.state[3] = 'confirmed@example.test';
  await button(transferred, 'transfer').props.onClick();
  const request = transferred.calls.find(c => c.url);
  assert.equal(request.url, '/api/trips/trip/transfer'); assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), { email: 'confirmed@example.test' });
  assert(transferred.calls.some(c => c.push === '/trips/trip/overview'));
  const removed = harness(); removed.storage.set('mova-documents-trip', 'fixture');
  await button(removed, 'remove').props.onClick();
  assert.equal(removed.calls.find(c => c.url).options.method, 'DELETE');
  assert(!removed.storage.has('mova-documents-trip'));
  assert.deepEqual(JSON.parse(removed.storage.get('mova-trips')), [{ id: 'other' }]);
  assert(removed.calls.some(c => c.replace === '/')); assert(removed.calls.some(c => c.refresh));
});
test('leave and failed destructive actions retain existing behavior without production data', async () => {
  const left = harness('participant'); await button(left, 'leave').props.onClick();
  assert.equal(left.calls.find(c => c.url).url, '/api/trips/trip/leave');
  const failed = harness('owner', { ok: false }); await button(failed, 'remove').props.onClick();
  assert.equal(failed.state[2], 'Errore di prova'); assert(!failed.calls.some(c => c.replace));
  assert.equal(JSON.parse(failed.storage.get('mova-trips')).length, 2);
});
test('transfer is collapsed and inert by default, opens accessibly and enables only a valid confirmed recipient', async () => {
  const h = harness(); h.render(); h.effects[0](); await flush();
  const toggle = () => nodes(h.render()).find(n => n.props?.['aria-controls'] === 'trip-transfer-controls');
  const panel = () => nodes(h.render()).find(n => n.props?.id === 'trip-transfer-controls');
  assert.equal(toggle().props['aria-expanded'], false);
  assert.equal(panel().props.inert, true); assert.equal(panel().props['aria-hidden'], true);
  assert.equal(button(h, 'transfer').props.disabled, true);
  toggle().props.onClick();
  assert.equal(toggle().props['aria-expanded'], true); assert.equal(panel().props.inert, false);
  assert.equal(button(h, 'transfer').props.disabled, true);
  const select = () => nodes(h.render()).find(n => n.type === 'select');
  assert.equal(select().props.disabled, false);
  select().props.onChange({ target: { value: 'pending@example.test' } });
  assert.equal(button(h, 'transfer').props.disabled, true);
  await button(h, 'transfer').props.onClick(); assert(!h.calls.some(c => c.url));
  select().props.onChange({ target: { value: 'owner@example.test' } });
  assert.equal(button(h, 'transfer').props.disabled, true);
  select().props.onChange({ target: { value: 'confirmed@example.test' } });
  assert.equal(button(h, 'transfer').props.disabled, false);
  toggle().props.onClick(); assert.equal(panel().props.inert, true);
  assert.equal(button(h, 'transfer').props.disabled, true);
});
