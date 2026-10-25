const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./invite-visibility.test.cjs');
const { createInviteAcceptance } = load('lib/invite-acceptance.ts');
const result = { accepted: true, tripId: 'trip', userId: 'guest' };
const pending = { code: 'NAMI-FIXTURE', status: 'pending', expired: false, user: { id: 'guest' }, trip: { id: 'trip' } };
const response = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function client(transport, extra = {}) {
  const states = [], successes = [], requests = [];
  const controller = createInviteAcceptance({ code: pending.code, userId: 'guest', tripId: 'trip', timeoutMs: 100, checkTimeoutMs: 100,
    fetch: async (url, init) => { requests.push({ url, ...init }); return transport(requests.at(-1), requests.length); },
    onState: state => states.push(state), onSuccess: value => successes.push(value), ...extra });
  return { ...controller, states, successes, requests };
}
for (const count of [2, 5]) test(`${count} immediate taps lock synchronously; slow response shows accepting until confirmed`, async () => {
  const slow = deferred(), h = client(() => slow.promise);
  const actions = Array.from({ length: count }, () => h.accept());
  assert.equal(h.requests.length, 1); assert.equal(h.isBusy(), true);
  assert.equal(h.states[0].message, 'Accettazione in corso…'); assert.equal(h.successes.length, 0);
  slow.resolve(response(result)); await Promise.all(actions);
  assert.equal(h.states.at(-1).message, 'Invito accettato!'); assert.equal(h.successes.length, 1);
  await h.accept(); assert.equal(h.requests.length, 1);
});
for (const status of [401, 403, 404, 409, 410]) test(`explicit ${status} rejection preserves error and never reports success`, async () => {
  const h = client(() => response({ error: 'Invito non utilizzabile' }, status));
  await h.accept(); assert.equal(h.requests.length, 1); assert.equal(h.states.at(-1).phase, 'error');
  assert.equal(h.successes.length, 0); assert.equal(h.isBusy(), false);
});
test('server failure can mean a committed acceptance: GET confirms authorized access', async () => {
  const h = client((_, n) => n === 1 ? response({}, 500) : response({ ...pending, status: 'accepted', canAccess: true }));
  await h.accept(); assert.deepEqual(h.requests.map(r => r.method), ['POST', 'GET']);
  assert.equal(h.successes.length, 1); assert.equal(h.states.at(-1).phase, 'success');
});
test('timeout checks status; a late POST cannot overwrite confirmed result', async () => {
  const slow = deferred(), h = client((_, n) => n === 1 ? slow.promise : response({ ...pending, status: 'accepted', canAccess: true }), { timeoutMs: 5 });
  await h.accept(); assert.equal(h.successes.length, 1); slow.resolve(response(result));
  await Promise.resolve(); assert.equal(h.successes.length, 1);
});
test('offline uncertainty permits only GET checks until status is known', async () => {
  const h = client(() => { throw Error('offline'); });
  await h.accept(); assert.equal(h.states.at(-1).phase, 'uncertain');
  await h.accept(); assert.deepEqual(h.requests.map(r => r.method), ['POST', 'GET', 'GET']);
  assert.equal(h.successes.length, 0);
});
test('GET timeout stays uncertain without replaying POST', async () => {
  const h = client((_, n) => n === 1 ? response({}, 503) : new Promise(() => {}), { checkTimeoutMs: 5 });
  await h.accept(); assert.equal(h.states.at(-1).phase, 'uncertain'); assert.equal(h.requests.length, 2);
});
test('pending status unlocks explicit idempotent retry; no automatic second POST', async () => {
  const h = client((_, n) => n === 1 ? response({}, 500) : n === 2 ? response(pending) : response(result));
  await h.accept(); assert.equal(h.states.at(-1).phase, 'error'); assert.equal(h.requests.length, 2);
  await h.accept(); assert.deepEqual(h.requests.map(r => r.method), ['POST', 'GET', 'POST']); assert.equal(h.successes.length, 1);
});
for (const checked of [{ ...pending, user: { id: 'other' }, canAccess: true }, { ...pending, trip: { id: 'other' }, canAccess: true }, { ...pending, status: 'accepted', canAccess: false }]) test(`status never grants access for mismatched identity/trip or unconfirmed member ${JSON.stringify(checked)}`, async () => {
  const h = client((_, n) => n === 1 ? response({}, 500) : response(checked)); await h.accept(); assert.equal(h.successes.length, 0);
});
test('unmount/code change cancels pending operation and ignores late success', async () => {
  const slow = deferred(), h = client(() => slow.promise); const promise = h.accept(); h.cancel();
  slow.resolve(response(result)); await promise; assert.equal(h.successes.length, 0); assert.equal(h.states.length, 1);
});
test('wrong identity in POST response is verified before accepting success', async () => {
  const h = client((_, n) => n === 1 ? response({ ...result, userId: 'other' }) : response({ ...pending, user: null }));
  await h.accept(); assert.equal(h.successes.length, 0);
});

const { renderInvite } = require('./invite-page-fixture.cjs');
for (const state of ['valid', 'accepting', 'checking', 'success', 'accepted', 'expired', 'unauthorized', 'uncertain', 'invalid', 'anonymous', 'used']) test(`real invitation page renders ${state} with approved wordmark and accessible CTA`, () => {
  const { markup, css } = renderInvite(state);
  assert.match(markup, /aria-label="NAMI Travel"/); assert.match(markup, /TRAVEL/); assert.match(css, /#f8f5ef/); assert.match(css, /#102b40/);
  assert.doesNotMatch(markup, /mobile-bottom-nav/); assert.match(css, /safe-area-inset-top/);
  if (['accepting', 'checking'].includes(state)) { assert.match(markup, /disabled=""/); assert.match(markup, /aria-busy="true"/); }
  if (state === 'accepting') assert.match(markup, /Accettazione in corso…/);
  if (state === 'success') { assert.match(markup, /Invito accettato!/); assert.match(markup, /Apri il viaggio/); }
  if (state === 'accepted') { assert.match(markup, /Invito già accettato/); assert.match(markup, /Apri il viaggio/); assert.doesNotMatch(markup, /Accetta l’invito/); }
  if (state === 'used') { assert.doesNotMatch(markup, /Apri il viaggio/); assert.match(markup, /disabled=""/); }
  if (state === 'uncertain') assert.match(markup, /Verifica stato/);
  if (state === 'anonymous') assert.match(markup, /Accedi per accettare/);
  if (state === 'unauthorized') { assert.match(markup, /altro account/); assert.match(markup, /disabled=""/); }
  if (state === 'expired') assert.match(markup, /Invito scaduto/);
});
const { fixture } = require('./invite-visibility.test.cjs');
test('five concurrent acceptance requests keep one confirmed member, assigned role and one notification', async () => {
  const h = fixture(); h.invite.role = 'co-organizer';
  const results = await Promise.all(Array.from({ length: 5 }, () => h.accept.POST({}, h.params)));
  assert(results.every(result => result.status === 200));
  assert.equal(h.members.length, 1); assert.equal(h.members[0].status, 'confirmed');
  assert.equal(h.members[0].role, 'co-organizer'); assert.equal(h.notifications(), 1);
  await h.accept.POST({}, h.params);
  assert.equal(h.members.length, 1); assert.equal(h.members[0].status, 'confirmed'); assert.equal(h.notifications(), 1);
});
