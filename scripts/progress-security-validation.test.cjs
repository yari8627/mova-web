// Release-gate tests for NAMI-PERF-003.5. Synthetic data only.
// The imported harness also registers the 20 existing memory-cache tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, harness, visit, A, B } = require('./progress-memory.test.cjs');

test('SECURITY GATE: a scope mismatch observed by read permanently discards the previous snapshot', async t => {
  const h = harness(t);
  await h.seed([visit('IT')]);
  h.setScope(B);
  assert.equal(h.store.read(), null);
  // An untrusted public marker must not make a discarded identity readable again.
  // No new authenticated response has arrived between these reads.
  h.setScope(A);
  assert.equal(h.store.read(), null, 'old private snapshot revived by replaying the public marker');
});

test('scope replay after a read cannot revive an old in-flight GET even when abort is ignored', async t => {
  const h = harness(t);
  await h.seed();
  const pending = h.store.revalidate(), old = h.calls.at(-1);
  h.setScope(B);
  assert.equal(h.store.read(), null);
  h.setScope(A);
  old.resolve(h.response([visit('JP')], { scope: A }));
  await pending;
  assert.equal(h.store.read(), null);
  await h.seed([visit('FR')]);
  assert.equal(h.store.read()[0].countryCode, 'FR', 'only a new verified GET can repopulate the discarded cache');
});

test('an expired snapshot destroyed by read cannot return if the clock later moves backwards', async t => {
  const h = harness(t);
  await h.seed();
  h.advance(60001);
  assert.equal(h.store.read(), null);
  h.advance(-60001);
  assert.equal(h.store.read(), null);
});

test('403 from an authenticated revalidation clears all personal data', async t => {
  const h = harness(t);
  await h.seed();
  const request = h.store.revalidate();
  h.calls.at(-1).resolve(h.response({}, { status: 403 }));
  await request;
  assert.equal(h.store.read(), null);
  assert.equal(h.store.issue(), 'session');
});

test('account change during an in-flight POST rejects the old result without requiring a broadcast', async t => {
  const h = harness(t);
  await h.seed();
  const operation = h.store.add('JP');
  const rejected = assert.rejects(operation);
  await new Promise(resolve => setImmediate(resolve));
  const post = h.calls.at(-1);
  assert.equal(post.options.method, 'POST');
  h.setScope(B);
  post.resolve(h.response(visit('JP'), { scope: A }));
  await rejected;
  assert.equal(h.store.read(), null);
});

test('a changed country notification revalidates an active tab without sharing personal data', async t => {
  const calls = [], channels = [], sent = [];
  const document = { cookie: `nami_progress_scope=${A}`, visibilityState: 'visible', addEventListener() {} };
  class Channel {
    constructor() { channels.push(this); }
    postMessage(value) { sent.push(value); }
  }
  const adapter = load('lib/progress-memory.ts', {
    window: { addEventListener() {} }, document, location: { protocol: 'https:' }, BroadcastChannel: Channel,
    fetch: (url, options) => new Promise(resolve => calls.push({ url, options, resolve })),
  });
  t.after(() => adapter.resetProgressMemory());
  const response = data => new Response(JSON.stringify(data), { headers: {
    'X-Nami-Progress-Scope': A, 'X-Nami-Progress-Owner': 'a'.repeat(64),
    'X-Nami-Progress-Expiry': new Date(Date.now() + 60000).toISOString(),
  } });
  const unsubscribe = adapter.subscribeProgressMemory(() => {});
  t.after(unsubscribe);
  const first = adapter.refreshProgressMemory();
  calls.at(-1).resolve(response([visit('IT')]));
  await first;
  channels[0].onmessage({ data: 'changed' });
  assert.equal(calls.length, 2);
  assert.equal(adapter.readProgressMemory()[0].countryCode, 'IT');
  const updated = adapter.refreshProgressMemory();
  calls.at(-1).resolve(response([visit('JP'), visit('IT')]));
  await updated;
  assert.equal(adapter.readProgressMemory().length, 2);
  assert(sent.every(value => typeof value === 'string'));
});

test('server revocation cannot be authorized by a public scope marker', async () => {
  let suppliedTokenHash;
  const auth = load('lib/auth.ts', { process: { env: { NODE_ENV: 'production' } } }, {
    'next/headers': { cookies: async () => ({ get: key => ({ value: key === 'mova_session' ? 'synthetic-revoked-token' : A }) }) },
    './prisma': { prisma: { authSession: { findUnique: async args => { suppliedTokenHash = args.where.tokenHash; return null; } } } },
  });
  assert.equal(await auth.currentUser(), null);
  assert.match(suppliedTokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(suppliedTokenHash, A);
});

function tripHarness() {
  const user = { id: 'owner', name: 'Owner', email: 'owner@example.invalid', sessionExpiresAt: '2099-01-01T00:00:00.000Z' };
  const state = { signedIn: true, allowed: true, role: 'owner', rotations: 0, endings: 0, writes: 0,
    existing: { id: 'trip', country: 'Italia', startDate: new Date('2026-10-01T12:00:00Z'), ownerId: 'owner' },
    memberStatus: 'confirmed', inviteStatus: 'pending', inviteEmail: user.email, passwordValid: true };
  const write = async () => { state.writes++; return {}; };
  const prisma = {
      $queryRaw: async () => [{ id: 'trip' }],
    trip: { findUnique: async () => state.existing, update: write, upsert: write },
    participant: { findUnique: async () => ({ id: 'member', email: user.email, status: state.memberStatus }), update: write, delete: write, upsert: write, deleteMany: write, createMany: write },
    activity: { deleteMany: write, createMany: write },
    tripInvite: { findUnique: async () => ({ tripId: 'trip', trip: { ownerId: 'owner', name: 'Trip' }, email: state.inviteEmail,
      status: state.inviteStatus, expiresAt: new Date('2099-01-01'), role: 'participant' }), update: write, updateMany: async () => ({ count: 1 }), deleteMany: write },
    user: { findUnique: async () => ({ id: 'target', email: user.email, passwordLogin: true, passwordHash: 'fixture', trips: [], documents: [] }), delete: write },
  };
  prisma.$transaction = async action => typeof action === 'function' ? action(prisma) : Promise.all(action);
  const route = (file, depth) => load(file, { crypto: require('node:crypto') }, {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    [depth + 'lib/auth']: { currentUser: async () => state.signedIn ? user : null, verifyPassword: () => state.passwordValid },
    [depth + 'lib/prisma']: { prisma },
    [depth + 'lib/trip-access']: { tripAccess: async () => ({ allowed: state.allowed, role: state.role, trip: { ...state.existing, participants: [{ email: user.email }] } }) },
    [depth + 'lib/progress-cache-scope']: { rotateProgressScope: async () => { state.rotations++; }, endProgressScope: async () => { state.endings++; } },
    [depth + 'lib/notifications']: { notifyUser: async () => {}, notifyTripMembers: async () => {} },
    [depth + 'lib/activity-order-storage']: { ensureActivityOrder: async () => {} },
    [depth + 'lib/avatar-storage']: { deleteAvatar: async () => {} },
    [depth + 'lib/document-storage']: { deleteDocumentFile: async () => {} },
    [depth + 'lib/country-names']: {}, [depth + 'lib/trip-people']: {}, [depth + 'lib/expense-identities']: {},
  });
  return { state, route, params: { params: Promise.resolve({ id: 'trip', code: 'fixture-invite' }) } };
}

test('departure changes invalidate; sync unchanged data and participant activity writes do not', async () => {
  const h = tripHarness();
  const detail = h.route('app/api/trips/[id]/route.ts', '../../../../');
  await detail.PATCH({ json: async () => ({ startDate: '2026-10-02' }) }, h.params);
  assert.equal(h.state.rotations, 1);
  const sync = h.route('app/api/trips/[id]/sync/route.ts', '../../../../../');
  const trip = { id: 'trip', country: 'Italia', startDate: '2026-10-01', endDate: '2026-10-03' };
  await sync.POST({ json: async () => ({ trip }) }, h.params);
  assert.equal(h.state.rotations, 1);
  await sync.POST({ json: async () => ({ trip: { ...trip, country: 'France' } }) }, h.params);
  assert.equal(h.state.rotations, 2);
  h.state.role = 'participant';
  await sync.POST({ json: async () => ({ trip, activities: [] }) }, h.params);
  assert.equal(h.state.rotations, 2);
  h.state.allowed = false;
  assert.equal((await sync.POST({ json: async () => ({ trip }) }, h.params)).status, 403);
  assert.equal(h.state.rotations, 2);
});

test('leaving and ownership transfer retain permission and confirmed-member checks before invalidation', async () => {
  const h = tripHarness();
  const leave = h.route('app/api/trips/[id]/leave/route.ts', '../../../../../');
  assert.equal((await leave.POST({}, h.params)).status, 400);
  h.state.role = 'participant';
  assert.equal((await leave.POST({}, h.params)).status, 200);
  assert.equal(h.state.rotations, 1);
  const transfer = h.route('app/api/trips/[id]/transfer/route.ts', '../../../../../');
  const request = { json: async () => ({ email: 'target@example.invalid' }) };
  assert.equal((await transfer.POST(request, h.params)).status, 403);
  h.state.role = 'owner'; h.state.memberStatus = 'pending';
  assert.equal((await transfer.POST(request, h.params)).status, 400);
  assert.equal(h.state.rotations, 1);
  h.state.memberStatus = 'confirmed';
  assert.equal((await transfer.POST(request, h.params)).status, 200);
  assert.equal(h.state.rotations, 2);
  h.state.signedIn = false;
  assert.equal((await transfer.POST(request, h.params)).status, 401);
  assert.equal(h.state.rotations, 2);
});

test('invite acceptance invalidates only an authorized, newly confirmed membership', async () => {
  const h = tripHarness(), api = h.route('app/api/invites/[code]/accept/route.ts', '../../../../../');
  h.state.inviteEmail = 'other@example.invalid';
  assert.equal((await api.POST({}, h.params)).status, 403);
  h.state.inviteEmail = 'owner@example.invalid'; h.state.inviteStatus = 'revoked';
  assert.equal((await api.POST({}, h.params)).status, 409);
  h.state.inviteStatus = 'accepted';
  assert.equal((await api.POST({}, h.params)).status, 200);
  assert.equal(h.state.rotations, 0);
  h.state.inviteStatus = 'pending';
  assert.equal((await api.POST({}, h.params)).status, 200);
  assert.equal(h.state.rotations, 1);
});

test('account deletion ends the scope only after existing confirmation and password checks succeed', async () => {
  const h = tripHarness(), api = h.route('app/api/auth/account/route.ts', '../../../../');
  assert.equal((await api.DELETE({ json: async () => ({ confirmation: '' }) })).status, 400);
  h.state.passwordValid = false;
  const request = { json: async () => ({ confirmation: 'ELIMINA', password: 'synthetic' }) };
  assert.equal((await api.DELETE(request)).status, 400);
  assert.equal(h.state.endings, 0);
  h.state.passwordValid = true;
  assert.equal((await api.DELETE(request)).status, 200);
  assert.equal(h.state.endings, 1);
});
