const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), SSR = require('react-dom/server');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const people = [
  { id: 'owner-alice', name: 'Alice', email: 'alice@example.test', role: 'owner', status: 'confirmed' },
  { id: 'bob', name: 'Bob', email: 'bob@example.test', role: 'co-organizer', status: 'confirmed' },
  { id: 'carol', name: 'Carol', email: 'carol@example.test', role: 'participant', status: 'pending' }
];
function harness({ role = 'owner', members = people, syncOK = true, inviteOK = true } = {}) {
  const state = [members, undefined, null, false, false, '', ''], calls = [], storage = new Map();
  let cursor = 0;
  const context = { exports: {}, console, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } };
  const localStorage = { setItem: (k,v) => storage.set(k,v), getItem: k => storage.get(k) || null };
  context.localStorage = localStorage;
  context.window = { localStorage, location: { origin: 'https://nami.example.test' }, dispatchEvent: e => calls.push({ event: e.type }), setTimeout() {} };
  context.navigator = { clipboard: { writeText: async value => calls.push({ copied: value }) } };
  context.fetch = async (url, options) => {
    calls.push({ url, options });
    const body = JSON.parse(options.body);
    return { ok: inviteOK, json: async () => inviteOK ? { participant: { id: 'invited', name: 'Invitato', email: body.email, role: body.role, status: 'pending' }, code: 'NAMI-TEST', link: '/invite/NAMI-TEST' } : { error: 'Invito non valido' } };
  };
  context.require = name => {
    if (name === 'react') return { useEffect() {}, useState: initial => { const i = cursor++; if (state[i] === undefined) state[i] = initial; return [state[i], value => state[i] = value]; } };
    if (name === 'next/navigation') return { useParams: () => ({ id: 'trip' }), useRouter: () => ({ push() {} }) };
    if (name.endsWith('/use-trip-permissions')) return { useTripPermissions: () => ({ canInvite: role === 'owner' || role === 'co-organizer', canAssignRoles: role === 'owner' }) };
    if (name.endsWith('/trip-session')) return { useTripUserId: () => 'alice' };
    if (name.endsWith('/trip-client-cache')) return { removeTripSnapshot() {}, fetchTripSnapshot: async () => null };
    if (name.endsWith('/page-cache')) return { readPageCache: () => null, writePageCache: (...args) => calls.push({ cache: args }) };
    if (name.endsWith('/trip-sync')) return { syncTripResource: async (...args) => { calls.push({ sync: args }); return syncOK; } };
    if (name.endsWith('/trip-cover')) return { TripCover: () => null };
    if (name.endsWith('/trip-tabs')) return { TripTabs: () => null };
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    return require(name);
  };
  vm.runInNewContext(compile(fs.readFileSync('app/trips/[id]/participants/page.tsx', 'utf8')), context);
  const render = () => { cursor = 0; return context.exports.default(); };
  return { state, calls, render, html: () => SSR.renderToStaticMarkup(render()) };
}
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const find = (h, predicate) => nodes(h.render()).find(predicate);
const flush = () => new Promise(resolve => setImmediate(resolve));
test('group count includes the same records while distinguishing confirmed and pending members', () => {
  const h = harness(), html = h.html();
  assert(html.includes('3 persone nel gruppo')); assert(html.includes('Confermati 2')); assert(html.includes('In attesa 1'));
  for (const text of ['Proprietario', 'Co-organizzatore', 'Partecipante', 'alice@example.test']) assert(html.includes(text));
  assert(!html.includes('aria-label="Rimuovi Alice"'));
  assert(html.includes('aria-label="Modifica Carol"'));
  assert(harness({ members: [people[0]] }).html().includes('1 persona nel gruppo'));
});
test('only authorized roles see invite and member management controls', () => {
  for (const role of ['owner', 'co-organizer', 'participant', null]) {
    const h = harness({ role });
    const actions = nodes(h.render()).filter(n => n.props?.onClick?.name === 'openNew');
    assert.equal(actions.length, role === 'owner' || role === 'co-organizer' ? 2 : 0);
    assert.equal(h.html().includes('aria-label="Rimuovi Bob"'), role === 'owner');
    if (actions.length) {
      actions[0].props.onClick();
      const options = nodes(h.render()).filter(n => n.type === 'option').map(n => n.props.value);
      assert.deepEqual(options, role === 'owner' ? ['participant', 'co-organizer'] : ['participant']);
    }
  }
});
test('existing invite flow preserves required email, pending state, creation endpoint and link copy', async () => {
  const h = harness();
  find(h, n => n.props?.onClick?.name === 'openNew').props.onClick();
  assert(!nodes(h.render()).some(n => n.type === 'input' && n.props.placeholder === 'Nome del partecipante'));
  const email = find(h, n => n.type === 'input' && n.props.type === 'email');
  assert.equal(email.props.required, true);
  email.props.onChange({ target: { value: 'invitee@example.test' } });
  find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await flush();
  const request = h.calls.find(c => c.url);
  assert.equal(request.url, '/api/trips/trip/invites');
  assert.deepEqual(JSON.parse(request.options.body), { email: 'invitee@example.test', role: 'participant' });
  assert.equal(h.state[0].at(-1).status, 'pending'); assert.equal(h.state[3], false);
  find(h, n => n.props?.['aria-label'] === 'Copia link invito').props.onClick();
  await flush();
  assert.equal(h.calls.find(c => c.copied).copied, 'https://nami.example.test/invite/NAMI-TEST');
  assert(h.html().includes('Link copiato'));
});
test('edit and removal preserve owner protection and existing sync rollback', async () => {
  const h = harness();
  find(h, n => n.props?.['aria-label'] === 'Modifica Carol').props.onClick();
  assert.equal(h.state[1].status, 'pending');
  h.state[1] = { ...h.state[1], name: 'Carolina', role: 'co-organizer' };
  find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await flush();
  const sync = h.calls.find(c => c.sync).sync;
  assert.equal(sync[1], 'participants'); assert(!sync[2].some(p => p.role === 'owner'));
  assert.equal(sync[2].find(p => p.id === 'carol').role, 'co-organizer');
  find(h, n => n.props?.['aria-label'] === 'Rimuovi Carolina').props.onClick();
  await flush();
  assert.equal(h.state[0].length, 2);
  const failed = harness({ syncOK: false });
  find(failed, n => n.props?.['aria-label'] === 'Rimuovi Carol').props.onClick();
  await flush();
  assert.equal(failed.state[0].length, 3);
});
test('rejected invitation keeps existing people and editor without fabricating success', async () => {
  const h = harness({ inviteOK: false });
  find(h, n => n.props?.onClick?.name === 'openNew').props.onClick();
  h.state[1] = { ...h.state[1], email: 'bad@example.test' };
  find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await flush();
  assert.equal(h.state[0].length, 3); assert.equal(h.state[3], true); assert.equal(h.state[5], '');
});
