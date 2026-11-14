const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), SSR = require('react-dom/server');
const { load } = require('./home-photo-harness.cjs');
const { knownInviteContacts, matchInviteContacts } = load('lib/invite-contact-suggestions.ts');
const me = { id: 'me', email: 'ME@example.test' };
const person = (email, name = '', status = 'confirmed') => ({ email, name, status });
const history = [
  { id: 'old', ownerId: 'me', owner: me, participants: [person(' ALICE@example.test ', 'Alice Rossi'), person('alice@example.test'), person('bob@example.test', '', 'pending'), person('bad-address', 'Invalid'), person('ME@EXAMPLE.TEST', 'Self'), person('legacy@example.test', 'Legacy')] },
  { id: 'shared', ownerId: 'other', owner: person('owner@example.test', 'Proprietaria'), participants: [person(' me@example.test '), person('carol@example.test', 'Carolina')] },
  { id: 'unknown', ownerId: 'other', owner: person('private@example.test', 'Privata'), participants: [person('me@example.test', '', 'pending'), person('stranger@example.test', 'Estraneo')] },
  { id: 'target', ownerId: 'me', owner: me, participants: [person('carol@example.test', 'Carolina', 'pending')] },
];

test('authorized history includes known pending contacts and owners, deduplicates and excludes self/current trip/invalid data', () => {
  const rows = knownInviteContacts(history, me, 'target', ['legacy@example.test']);
  assert.deepEqual(Array.from(rows, r => r.email).sort(), ['alice@example.test', 'bob@example.test', 'owner@example.test']);
  assert.equal(rows.find(r => r.email === 'alice@example.test').name, 'Alice Rossi');
  assert.equal(rows.find(r => r.email === 'bob@example.test').name, '');
});
test('no suggestions before two characters; name/email matching, empty match and case-insensitive current members', () => {
  const rows = knownInviteContacts(history, me, 'target', []);
  for (const query of ['', ' ', 'a', ' a ']) assert.equal(matchInviteContacts(rows, query).length, 0);
  assert.equal(matchInviteContacts(rows, 'ROSSI')[0].email, 'alice@example.test');
  assert.equal(matchInviteContacts(rows, 'BOB@')[0].name, '');
  assert.equal(matchInviteContacts(rows, 'zzzz').length, 0);
  assert.equal(matchInviteContacts(rows, 'alice', [' ALICE@EXAMPLE.TEST ']).length, 0);
  assert.equal(matchInviteContacts(Array.from({ length: 20 }, (_, i) => person(`bob${i}@example.test`)), 'bob').length, 6);
});

function api({ user = me, role = 'owner', allowed = true, targetPresent = true } = {}) {
  const calls = [];
  const route = load('app/api/travel-companions/route.ts', {}, {
    'next/server': { NextResponse: { json: (body, opts) => ({ body, status: opts?.status || 200, headers: opts?.headers }) } },
    '../../../lib/auth': { currentUser: async () => user },
    '../../../lib/trip-access': { tripAccess: async (...args) => { calls.push({ access: args }); return { allowed, role, trip: { participants: history.at(-1).participants } }; } },
    '../../../lib/prisma': { prisma: {
      trip: { findMany: async args => { calls.push({ history: args }); return targetPresent ? history : history.filter(trip => trip.id !== 'target'); } },
      tripInvite: { findMany: async args => { calls.push({ pending: args }); return [{ email: 'legacy@example.test' }]; } },
      participant: { findMany: async args => { calls.push({ legacy: args }); return [person('old@example.test', 'Old')].map(x => ({ ...x, tripId: 'old' })); } },
    } },
  });
  return { calls, get: (query = '?scope=invite&tripId=target') => route.GET(new Request('https://fixture.test/api/travel-companions' + query)) };
}
for (const options of [{ user: null }, { allowed: false }, { role: 'participant' }]) test(`suggestion API denies unauthorized requests ${JSON.stringify(options)}`, async () => {
  const h = api(options), r = await h.get(); assert([401, 403].includes(r.status));
  assert(!h.calls.some(c => c.history || c.pending || c.legacy));
});
test('suggestion API uses authorized trip membership, excludes current pending invites and returns identity-bound no-store payload', async () => {
  const h = api({ role: 'co-organizer' }), r = await h.get();
  assert.equal(r.status, 200); assert.equal(r.body.userId, 'me'); assert.equal(r.body.tripId, 'target');
  assert.equal(r.headers['Cache-Control'], 'private, no-store');
  assert.deepEqual(Array.from(r.body.contacts, x => x.email).sort(), ['alice@example.test', 'bob@example.test', 'owner@example.test']);
  const q = h.calls.find(c => c.history).history;
  assert.equal(q.where.OR[0].ownerId, 'me'); assert.equal(q.where.OR[1].participants.some.status, 'confirmed');
  assert.equal(q.where.OR[1].participants.some.email.mode, 'insensitive'); assert(!('invites' in q.select));
  const pending = h.calls.find(c => c.pending).pending;
  assert.equal(pending.where.tripId, 'target'); assert.equal(pending.where.status, 'pending'); assert(pending.where.expiresAt.gt instanceof Date);
});
test('missing target rejected and existing Home companion API behavior remains unchanged', async () => {
  assert.equal((await api().get('?scope=invite')).status, 400);
  const h = api(), r = await h.get(''); assert.equal(r.status, 200); assert.equal(r.body[0].email, 'old@example.test');
  assert.equal(h.calls.length, 1); assert(h.calls[0].legacy);
});
test('membership disappearing between access and history lookup does not return contacts', async () => {
  const r = await api({ targetPresent: false }).get(); assert.equal(r.status, 403); assert(!r.body.contacts);
});

const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
function field({ fail = false, deferred = false, wrongIdentity = false, malformed = false } = {}) {
  let cursor = 0, effectCursor = 0;
  const state = [], effects = [], jobs = [], requests = [], changes = [];
  const props = { tripId: 'target', userId: 'me', enabled: true, disabled: false, value: '', excluded: [], onChange: value => { props.value = value; changes.push(value); } };
  const contacts = [{ name: 'Alice Rossi', email: 'alice@example.test' }, { name: '', email: 'bob@example.test' }];
  const context = { exports: {}, URLSearchParams, AbortController, setTimeout, clearTimeout,
    fetch: (url, options) => { const tripId = props.tripId, userId = props.userId; requests.push({ url, options }); const result = () => fail ? Promise.reject(Error('offline')) : Promise.resolve({ ok: true, json: async () => ({ userId: wrongIdentity ? 'other' : userId, tripId, contacts: malformed ? [{ email: null }] : contacts }) }); return deferred ? new Promise(resolve => jobs.push(() => resolve(result()))) : result(); },
    require: name => {
      if (name === 'react') return { useId: () => 'contact', useState: initial => { const at = cursor++; if (state[at] === undefined) state[at] = initial; return [state[at], v => state[at] = typeof v === 'function' ? v(state[at]) : v]; }, useEffect: (effect, deps) => { const at = effectCursor++, prev = effects[at]; if (!prev || deps.some((x, i) => x !== prev.deps[i])) { prev?.cleanup?.(); effects[at] = { deps, job: effect }; } } };
      if (name.endsWith('invite-contact-suggestions')) return { matchInviteContacts };
      if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, k) => k }) };
      return require(name);
    },
  };
  vm.runInNewContext(compile(fs.readFileSync('app/trips/[id]/participants/invite-contact-field.tsx', 'utf8')), context);
  const render = () => { cursor = effectCursor = 0; const n = context.exports.InviteContactField(props); for (const e of effects) if (e.job) { const job = e.job; e.job = null; e.cleanup = job(); } return n; };
  const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
  const all = () => nodes(render());
  return { props, state, requests, changes, render, all, input: () => all().find(n => n.type === 'input'), options: () => all().filter(n => n.props?.role === 'option'), html: () => SSR.renderToStaticMarkup(render()), type: value => { all().find(n => n.type === 'input').props.onChange({ target: { value } }); }, release: () => jobs.shift()(), unmount: () => effects.forEach(e => e.cleanup?.()) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const key = (h, name) => { const e = { key: name, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} }; h.input().props.onKeyDown(e); return e; };

test('field filters only after two characters; selecting by tap fills email, permits manual edit and never sends an invite', async () => {
  const h = field(); h.render(); await flush();
  h.type('a'); assert.equal(h.options().length, 0); h.type('ro'); assert.equal(h.options().length, 1);
  assert(h.options().every(n => !n.props['aria-selected']));
  h.options()[0].props.onClick(); assert.equal(h.props.value, 'alice@example.test'); assert.equal(h.options().length, 0);
  h.type('changed@example.test'); assert.equal(h.props.value, 'changed@example.test');
  assert.equal(h.requests.length, 1); assert(h.requests.every(r => !r.options.method)); h.unmount();
});
test('keyboard navigation selects only explicitly, Enter does not auto-select/send and Escape dismisses suggestions', async () => {
  const h = field(); h.render(); await flush(); h.type('al');
  assert(key(h, 'Enter').prevented); assert.equal(h.changes.at(-1), 'al');
  key(h, 'ArrowDown'); assert(h.options()[0].props['aria-selected']);
  key(h, 'Enter'); assert.equal(h.props.value, 'alice@example.test'); assert.equal(h.requests.length, 1);
  h.type('bo'); assert(h.html().includes('bob@example.test')); assert(!h.html().includes('<strong>bob'));
  key(h, 'Escape'); assert.equal(h.options().length, 0); h.unmount();
});
test('current participants (including pending) are filtered again when the parent list updates', async () => {
  const h = field(); h.render(); await flush(); h.type('al'); assert.equal(h.options().length, 1);
  h.props.excluded = [' ALICE@EXAMPLE.TEST ']; assert.equal(h.options().length, 0); h.unmount();
});
for (const config of [{ fail: true }, { wrongIdentity: true }, { malformed: true }]) test(`failed or mismatched suggestions preserve manual entry ${JSON.stringify(config)}`, async () => {
  const h = field(config); h.render(); await flush(); h.type('new@example.test');
  assert(h.html().includes('Suggerimenti non disponibili')); assert.equal(h.props.value, 'new@example.test'); assert.equal(h.options().length, 0); h.unmount();
});
test('no suggestion request without permission and busy invitation prevents contact selection', async () => {
  const h = field(); h.props.enabled = false; h.render(); assert.equal(h.requests.length, 0);
  h.props.enabled = true; h.render(); await flush(); h.type('al'); assert.equal(h.options().length, 1);
  h.props.disabled = true; assert.equal(h.options().length, 0); assert(h.input().props.disabled); h.unmount();
});
test('late requests cannot expose contacts after trip/account change, loss of permission or unmount', async () => {
  const h = field({ deferred: true }); h.render(); h.type('al');
  h.props.tripId = 'other-trip'; h.props.userId = 'other-user'; h.render();
  h.release(); await flush(); assert.equal(h.options().length, 0);
  h.release(); await flush(); assert.equal(h.options().length, 1);
  h.props.enabled = false; assert.equal(h.options().length, 0); assert.equal(h.input().props.disabled, true); h.unmount();
  const late = field({ deferred: true }); late.render(); late.unmount(); late.release(); await flush(); assert.equal(late.state[0].status, 'loading');
});

module.exports = { field };
