const { test } = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { scenario } = require('./invite-retry.test.cjs');
const { load } = require('./invite-visibility.test.cjs');
const { createInviteSubmission } = load('lib/invite-submission.ts', { AbortController, setTimeout, clearTimeout, crypto: require('node:crypto') });
const draft = { email: 'guest@example.invalid', role: 'participant' };
const result = { userId: 'owner', participant: { id: 'guest', ...draft, name: 'Guest', status: 'pending' }, code: 'FIXTURE', link: '/invite/FIXTURE' };
const response = (value, status = 201) => ({ ok: status < 400, status, json: async () => value });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function client(transport, options = {}) {
  let scope = 'session-a', owner = 'owner', keyCount = 0;
  const states = [], successes = [], requests = [];
  const controller = createInviteSubmission({ context: () => scope, userId: () => owner, tripId: () => 'trip',
    key: () => 'fixture-operation-' + ++keyCount, timeoutMs: 100, checkTimeoutMs: 100,
    fetch: (url, init) => { const row = { url, body: JSON.parse(init.body), key: init.headers['Idempotency-Key'], signal: init.signal }; requests.push(row); return transport(row, requests.length); },
    onState: state => states.push({ ...state, at: performance.now() }), onSuccess: value => successes.push(value), ...options });
  return { ...controller, states, successes, requests, session: (value, user = owner) => { scope = value; owner = user; } };
}
for (const count of [1, 2, 5]) test(`${count} immediate submissions produce one POST and synchronous feedback`, async () => {
  const pending = deferred(), h = client(() => pending.promise);
  const attempts = Array.from({ length: count }, () => h.submit(draft));
  assert.equal(h.requests.length, 1); assert.equal(h.states[0].phase, 'submitting'); assert.equal(h.isBusy(), true);
  pending.resolve(response(result)); await Promise.all(attempts);
  assert.equal(h.successes.length, 1); assert.equal(h.states.at(-1).phase, 'success');
  await h.submit(draft); assert.equal(h.requests.length, 1, 'a completed operation cannot be resubmitted');
});

test('confirmed validation error unlocks the form, preserves the operation key and succeeds on retry', async () => {
  const h = client((_, number) => Promise.resolve(number === 1 ? response({ error: 'Dati non validi' }, 400) : response(result)));
  await h.submit(draft); assert.equal(h.states.at(-1).phase, 'error'); assert.equal(h.isBusy(), false);
  await h.submit({ ...draft, email: ' GUEST@EXAMPLE.INVALID ' });
  assert.equal(h.requests[0].key, h.requests[1].key); assert.equal(h.successes.length, 1);
});

test('timeout after commit is resolved by a read-only status check without another send', async () => {
  const h = client(row => row.body.intent === 'status' ? Promise.resolve(response({ ...result, found: true })) : new Promise(() => {}), { timeoutMs: 5 });
  await h.submit(draft);
  assert.deepEqual(h.requests.map(row => row.body.intent), ['send', 'status']);
  assert.equal(new Set(h.requests.map(row => row.key)).size, 1); assert.equal(h.successes.length, 1);
  assert(h.states.some(row => row.phase === 'uncertain' && row.checking));
});

test('interrupted network stays uncertain; reopening and retry reuse the same key', async () => {
  let online = false;
  const h = client(() => online ? Promise.resolve(response(result)) : Promise.reject(Error('offline')));
  await h.submit(draft); assert.equal(h.states.at(-1).phase, 'uncertain'); assert.equal(h.isBusy(), false);
  const key = h.requests[0].key; h.reset(); h.reset(); online = true; await h.submit(draft);
  assert(h.requests.every(row => row.key === key)); assert.equal(h.successes.length, 1);
});

test('a late original response cannot overwrite the uncertain result or run success twice', async () => {
  const pending = deferred();
  const h = client(row => row.body.intent === 'status' ? Promise.resolve(response({ found: false })) : pending.promise, { timeoutMs: 5 });
  await h.submit(draft); assert.equal(h.states.at(-1).phase, 'uncertain');
  pending.resolve(response(result)); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.successes.length, 0); assert.equal(h.states.at(-1).phase, 'uncertain');
});

test('logout/account change rejects late results and never sends a status retry as the new user', async () => {
  for (const owner of ['', 'other']) {
    const pending = deferred(), h = client(() => pending.promise);
    const running = h.submit(draft); h.session('session-b', owner); pending.resolve(response(result)); await running;
    assert.equal(h.successes.length, 0); assert.equal(h.requests.length, 1); assert.equal(h.isBusy(), false);
    assert.equal(h.states.at(-1).phase, 'error');
  }
});

test('unmount aborts even a transport ignoring abort, without stale success or status retry', async () => {
  const h = client(() => new Promise(() => {})); const running = h.submit(draft); h.cancel(); await running;
  assert.equal(h.requests[0].signal.aborted, true); assert.equal(h.successes.length, 0); assert.equal(h.requests.length, 1);
});

test('wrong backend identity cannot update the participant list', async () => {
  const h = client(() => Promise.resolve(response({ ...result, userId: 'other' })));
  await h.submit(draft); assert.equal(h.successes.length, 0); assert.equal(h.states.at(-1).phase, 'error');
});

test('different recipients and a new explicit form intention receive distinct operation keys', async () => {
  const h = client(row => Promise.resolve(response({ ...result, participant: { ...result.participant, email: row.body.email } })));
  await h.submit(draft); h.reset(); await h.submit({ ...draft, email: 'second@example.invalid' });
  assert.notEqual(h.requests[0].key, h.requests[1].key); assert.equal(h.successes.length, 2);
});

test('five concurrent requests with different keys and casing converge across two browser intentions', async () => {
  const s = scenario();
  const rows = await Promise.all(Array.from({ length: 5 }, (_, index) => s.send({ email: index % 2 ? 'GUEST@EXAMPLE.INVALID' : draft.email }, 'browser-operation-' + index)));
  assert.equal(s.invites.length, 1); assert.equal(s.notices.length, 1); assert.equal(s.h.members.length, 1);
  assert.equal(new Set(rows.map(row => row.body.inviteId)).size, 1);
  assert.equal(new Set(s.emails.map(row => row.idempotencyKey)).size, 1);
});

test('different recipients receive independent participants, invitations and notifications', async () => {
  const s = scenario();
  const values = await Promise.all([s.send({}, 'recipient-one-operation'), s.send({ email: s.h.outsider.email }, 'recipient-two-operation')]);
  assert(values.every(row => row.status === 201)); assert.equal(s.invites.length, 2); assert.equal(s.notices.length, 2);
  assert.equal(s.h.members.length, 2); assert.notEqual(values[0].body.inviteId, values[1].body.inviteId);
});

test('explicit resend creates one new intention; five retries of it reuse that result', async () => {
  const s = scenario(); const first = await s.send({}, 'initial-operation-1');
  const body = { intent: 'resend', resendOf: first.body.inviteId };
  const rows = await Promise.all(Array.from({ length: 5 }, () => s.send(body, 'resend-operation-1')));
  assert(rows.every(row => row.status === 201));
  assert.equal(s.invites.length, 2); assert.equal(s.invites[0].status, 'replaced'); assert.equal(s.notices.length, 2);
  assert.equal(new Set(rows.map(row => row.body.inviteId)).size, 1);
  const later = await s.send(body, 'other-browser-resend-1');
  assert.equal(later.body.inviteId, rows[0].body.inviteId); assert.equal(s.invites.length, 2);
});

test('same key cannot be reused with another recipient; revoked operation cannot silently re-invite', async () => {
  const s = scenario(); await s.send({}, 'stable-operation-1');
  assert.equal((await s.send({ email: 'different@example.invalid' }, 'stable-operation-1')).status, 409);
  s.invites[0].status = 'revoked'; assert.equal((await s.send({}, 'stable-operation-1')).status, 409);
  assert.equal(s.invites.length, 1); assert.equal(s.notices.length, 1);
});

test('a technical retry key that reused another pending record cannot recreate a later revoked invite', async () => {
  const s = scenario(); await s.send({}, 'first-browser-operation'); await s.send({}, 'second-browser-operation');
  s.invites[0].status = 'revoked';
  const replay = await s.send({}, 'second-browser-operation');
  assert.equal(replay.status, 409); assert.equal(replay.body.code, 'RESEND_REQUIRED');
  assert.equal(s.invites.length, 1); assert.equal(s.notices.length, 1);
});

test('explicit resend gets a new key once; interrupted resend retries keep that key and intention', async () => {
  let step = 0;
  const h = client(row => {
    step++;
    if (step === 1) return Promise.resolve(response({ error: 'Conferma reinvio', code: 'RESEND_REQUIRED', resendOf: 'old-invite' }, 409));
    if (step === 2 || step === 3) return Promise.reject(Error('offline'));
    return Promise.resolve(response(result));
  });
  await h.submit(draft); assert.equal(h.states.at(-1).resendOf, 'old-invite');
  await h.submit(draft, 'old-invite'); assert.equal(h.states.at(-1).phase, 'uncertain');
  await h.submit(draft);
  assert.notEqual(h.requests[0].key, h.requests[1].key);
  assert.equal(h.requests[1].key, h.requests[3].key); assert.equal(h.requests[3].body.intent, 'resend');
});

test('status check does not create anything and a confirmed/accepted member never regresses', async () => {
  const s = scenario(); assert.equal((await s.send({ intent: 'status' }, 'stable-operation-1')).body.found, false);
  assert.equal(s.invites.length, 0); assert.equal(s.h.members.length, 0); assert.equal(s.emails.length, 0);
  const first = await s.send({}, 'stable-operation-1'); s.h.active = s.h.guest; await s.accept(first.body.code); s.h.active = s.h.owner;
  const before = s.notices.length; const value = await s.send({}, 'other-operation-1');
  assert.equal(value.body.participant.status, 'confirmed'); assert.equal(value.body.emailStatus, 'not_required'); assert.equal(s.notices.length, before);
  assert.equal((await s.send({ intent: 'status' }, 'stable-operation-1')).body.found, true);
});

test('email failure after database commit reports persisted invitation without claiming delivery', async () => {
  const s = scenario({ failEmail: true }); const value = await s.send({}, 'stable-operation-1');
  assert.equal(value.status, 201); assert.equal(value.body.emailStatus, 'not_confirmed'); assert.equal(s.invites.length, 1);
  await s.send({}, 'stable-operation-1'); assert.equal(s.notices.length, 1); assert.equal(s.invites.length, 1);
});

test('synthetic latency exposes synchronous feedback and separates API transaction/notification/email timing', async t => {
  const s = scenario({ emailDelayMs: 60 });
  const originalLock = s.h.prisma.$queryRaw, originalNotice = s.h.prisma.notification.upsert;
  s.h.prisma.$queryRaw = async (...args) => { await new Promise(resolve => setTimeout(resolve, 8)); return originalLock(...args); };
  s.h.prisma.notification.upsert = async (...args) => { await new Promise(resolve => setTimeout(resolve, 8)); return originalNotice(...args); };
  let apiMs, mockQueriesMs = 0;
  for (const table of [s.h.prisma.participant, s.h.prisma.tripInvite, s.h.prisma.trip, s.h.prisma.user]) for (const key of Object.keys(table)) {
    const original = table[key];
    table[key] = async (...args) => { const started = performance.now(); try { return await original(...args); } finally { mockQueriesMs += performance.now() - started; } };
  }
  const h = client(async row => { const started = performance.now(); const value = await s.send(row.body, row.key); apiMs = performance.now() - started; assert(value.headers['Server-Timing']); t.diagnostic('Server-Timing (fixture, ms): ' + value.headers['Server-Timing']); return response({ ...value.body, userId: 'owner' }); }, { timeoutMs: 3000 });
  const click = performance.now(); const running = h.submit(draft); const feedbackMs = h.states[0].at - click;
  assert.equal(h.states[0].phase, 'submitting'); await running;
  t.diagnostic(JSON.stringify({ simulation: true, feedbackMs: +feedbackMs.toFixed(2), apiMs: +apiMs.toFixed(2), mockQueriesMs: +mockQueriesMs.toFixed(2), confirmationMs: +(h.states.at(-1).at - click).toFixed(2), artificialEmailDelayMs: 60 }));
  assert.equal(h.successes.length, 1);
});
