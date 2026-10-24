const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture } = require('./invite-visibility.test.cjs');

function scenario() {
  const h = fixture({ member: null });
  Object.assign(h.trip, { name: 'Italia 2026', city: 'Milano', startDate: new Date('2026-10-31T12:00:00Z'), endDate: new Date('2026-10-31T12:00:00Z') });
  const invites = [], notices = [], emails = [];
  const match = (row, where) => Object.entries(where).every(([key, value]) => {
    if (key === 'expiresAt') return row[key] > value.gt;
    if (key === 'email' && typeof value === 'object') return row.email.toLowerCase() === value.equals.toLowerCase();
    if (typeof value === 'object' && value?.in) return value.in.includes(row[key]);
    return row[key] === value;
  });
  h.prisma.tripInvite = {
    findUnique: async ({ where }) => invites.find(row => row.code === where.code) || null,
    findFirst: async ({ where }) => [...invites].reverse().find(row => match(row, where)) || null,
    create: async ({ data }) => { const row = { ...data, createdAt: new Date(), status: 'pending', acceptedAt: null, trip: h.trip }; invites.push(row); return row; },
    updateMany: async ({ where, data }) => { const rows = invites.filter(row => match(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; },
  };
  h.prisma.$queryRaw = async () => [{ id: h.trip.id }];
  h.prisma.notification = { upsert: async ({ where, create }) => { const found = notices.find(row => row.dedupeKey === where.dedupeKey); if (found) return found; notices.push(create); return create; } };
  let transactions = Promise.resolve();
  h.prisma.$transaction = action => {
    const result = transactions.then(async () => {
      const before = structuredClone({ invites, notices, members: h.members });
      try { return await action(h.prisma); }
      catch (error) { invites.splice(0, invites.length, ...before.invites); notices.splice(0, notices.length, ...before.notices); h.members.splice(0, h.members.length, ...before.members); throw error; }
    });
    transactions = result.catch(() => undefined); return result;
  };
  h.prisma.participant.findMany = async ({ where }) => h.members.filter(row => match(row, where)).map(row => ({ ...row }));
  h.prisma.participant.findFirst = async ({ where }) => h.members.find(row => match(row, where)) || null;
  h.prisma.participant.deleteMany = async ({ where }) => { for (let i = h.members.length - 1; i >= 0; i--) if (match(h.members[i], where)) h.members.splice(i, 1); return { count: 1 }; };
  h.prisma.participant.createMany = async ({ data }) => { h.members.push(...data); return { count: data.length }; };
  h.prisma.trip.upsert = async () => h.trip;
  const api = (file, depth) => load(file, {}, {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    [depth + 'lib/auth']: { currentUser: async () => h.active },
    [depth + 'lib/prisma']: { prisma: h.prisma }, './prisma': { prisma: h.prisma },
    [depth + 'lib/notifications']: { notifyUser: async (userId, data) => notices.push({ userId, ...data }), notifyTripMembers: async () => {} },
    [depth + 'lib/email']: { appUrl: () => 'https://example.invalid', sendMovaEmail: async message => emails.push(message) },
    [depth + 'lib/progress-cache-scope']: { rotateProgressScope: async () => {} },
    [depth + 'lib/activity-order-storage']: { ensureActivityOrder: async () => {} },
  });
  h.active = h.owner;
  const send = api('app/api/trips/[id]/invites/route.ts', '../../../../../');
  const accept = api('app/api/invites/[code]/accept/route.ts', '../../../../../');
  const get = api('app/api/invites/[code]/route.ts', '../../../../');
  const sync = api('app/api/trips/[id]/sync/route.ts', '../../../../../');
  const request = { json: async () => ({ email: h.guest.email, role: 'participant' }) };
  const params = code => ({ params: Promise.resolve({ id: h.trip.id, code }) });
  return { h, invites, notices, emails, params, send: () => send.POST(request, params()), accept: code => accept.POST({}, params(code)), get: code => get.GET({}, params(code)), sync };
}

test('four sequential invitation submissions reuse one valid invitation and one notification', async () => {
  const s = scenario();
  const responses = [];
  for (let i = 0; i < 4; i++) responses.push(await s.send());
  assert.equal(s.invites.length, 1); assert.equal(s.notices.length, 1);
  assert.equal(new Set(responses.map(row => row.body.code)).size, 1);
  assert.equal(s.h.members.length, 1); assert.equal(s.h.members[0].status, 'pending');
  assert(s.emails.every(row => row.idempotencyKey === s.emails[0].idempotencyKey));
});

test('four parallel invitation retries do not create four invitations or notifications', async () => {
  const s = scenario(); await Promise.all(Array.from({ length: 4 }, () => s.send()));
  assert.equal(s.invites.length, 1); assert.equal(s.notices.length, 1); assert.equal(s.h.members.length, 1);
});

test('accepted invitation lookup grants navigation only to the authenticated confirmed recipient', async () => {
  const s = scenario(); const result = await s.send(); const code = result.body.code;
  s.h.active = s.h.guest; assert.equal((await s.accept(code)).status, 200);
  let view = await s.get(code); assert.equal(view.body.canAccess, true); assert.equal(view.body.user.id, s.h.guest.id);
  s.h.active = s.h.outsider; assert.equal((await s.get(code)).body.canAccess, false);
  s.h.active = null; assert.equal((await s.get(code)).body.canAccess, false);
  s.h.active = s.h.guest; s.h.members.splice(0);
  assert.equal((await s.get(code)).body.canAccess, false); assert.equal((await s.accept(code)).status, 409);
});

test('accepted membership survives stale owner participant status and a subsequent resend', async () => {
  const s = scenario(); const code = (await s.send()).body.code;
  s.h.active = s.h.guest; await s.accept(code);
  const stale = { ...s.h.members[0], status: 'pending' };
  s.h.active = s.h.owner;
  const response = await s.sync.POST({ json: async () => ({ trip: { ...s.h.trip, startDate: '2026-10-31', endDate: '2026-10-31' }, participants: [stale] }) }, s.params());
  assert.equal(response.status, 200); assert.equal(s.h.members[0].status, 'confirmed');
  const count = s.notices.length; await s.send();
  assert.equal(s.h.members[0].status, 'confirmed'); assert.equal(s.notices.length, count);
});

test('expired/revoked invitations may be renewed without erasing legitimate historical notifications', async () => {
  const s = scenario(); await s.send(); s.invites[0].status = 'revoked';
  await s.send(); assert.equal(s.invites.length, 2); assert.equal(s.notices.length, 2);
  s.invites[1].expiresAt = new Date('2000-01-01'); await s.send();
  assert.equal(s.invites.length, 3); assert.equal(s.notices.length, 3);
});

test('invitation and notification commit together; failure leaves no phantom invitation or participant', async () => {
  const s = scenario(); s.h.prisma.notification.upsert = async () => { throw Error('notification storage unavailable'); };
  await assert.rejects(s.send());
  assert.equal(s.invites.length, 0); assert.equal(s.h.members.length, 0); assert.equal(s.emails.length, 0);
});

test('unrelated, anonymous and ordinary participants cannot send invitations or change roles', async () => {
  const s = scenario();
  s.h.active = s.h.outsider; assert.equal((await s.send()).status, 403);
  s.h.active = null; assert.equal((await s.send()).status, 401);
  s.h.active = s.h.owner; const code = (await s.send()).body.code;
  s.h.active = s.h.guest; await s.accept(code);
  assert.equal((await s.send()).status, 403); assert.equal(s.h.members[0].role, 'participant');
});

test('four historical invitations, pending screen and absent Home become visible after one real acceptance in fixtures', async () => {
  const s = scenario();
  // Existing historical duplicates are retained; each explicit revocation makes renewal legitimate.
  for (let i = 0; i < 4; i++) { await s.send(); if (i < 3) s.invites.at(-1).status = 'replaced'; }
  assert.equal(s.notices.length, 4);
  s.h.active = s.h.guest; s.h.user(s.h.guest);
  const code = s.invites.at(-1).code;
  assert.equal((await s.get(code)).body.status, 'pending');
  assert.equal((await s.h.list.GET()).body.length, 0, 'notifications are not membership');
  const responses = await Promise.all([s.accept(code), s.accept(code)]);
  assert(responses.every(row => row.status === 200)); assert.equal(s.h.members.length, 1);
  assert.equal((await s.h.list.GET()).body.length, 1);
  s.h.user(null); assert.equal((await s.h.list.GET()).status, 401);
  s.h.user({ ...s.h.guest }); assert.equal((await s.h.list.GET()).body.length, 1);
  assert.equal(s.notices.filter(row => row.type === 'invite_accepted').length, 1);
});

function screen({ canAccess = true, status = 'accepted', delayed = false } = {}) {
  const effects = [], calls = [], state = [], ref = { current: false };
  const invite = { code: 'NAMI-FIXTURE', status, expired: false, canAccess, user: { id: 'guest', email: 'guest@example.invalid' },
    trip: { id: 'trip', name: 'Italia 2026', city: 'Milano', country: 'Italia', startDate: '2026-10-31', endDate: '2026-10-31' } };
  let cursor = 0, resolvePost;
  const router = { replace: path => calls.push({ replace: path }), push: path => calls.push({ push: path }), refresh() {} };
  const page = load('app/invite/[code]/page.tsx', { fetch: async (url, options) => {
    calls.push({ method: options?.method || 'GET' });
    if (options?.method === 'POST' && delayed) await new Promise(resolve => { resolvePost = resolve; });
    return { ok: true, json: async () => options?.method === 'POST' ? { accepted: true, tripId: 'trip', userId: 'guest' } : invite };
  } }, {
    react: { useEffect: effect => effects.push(effect), useRef: () => ref, useState: initial => { const i = cursor++; if (state[i] === undefined) state[i] = initial; return [state[i], value => { state[i] = value; }]; } },
    'next/navigation': { useParams: () => ({ code: invite.code }), useRouter: () => router },
    '../../../lib/page-cache': { invalidatePageCache: (...args) => calls.push({ invalidate: args }) },
    '../../../lib/trip-client-cache': { setTripCacheAccount() {}, removeTripSnapshot() {} },
  });
  const render = () => { cursor = 0; return page.default(); };
  const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  return { calls, state, mount: () => { render(); return effects.shift()(); }, render, nodes,
    button: () => nodes(render()).find(node => node.type === 'button' && node.props.className?.includes('invite-accept-button')),
    finish: () => resolvePost() };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('opening an accepted link verifies membership and enters the trip without a new POST', async () => {
  const s = screen(); s.mount(); await flush();
  assert.equal(s.calls.filter(row => row.method === 'POST').length, 0);
  assert.equal(s.calls.at(-1).replace, '/trips/trip/overview');
  assert.deepEqual(s.calls.filter(row => row.invalidate).map(row => [...row.invalidate]), [['guest', 'trips'], ['guest', 'access-trip'], ['guest', 'participants-trip']]);
});

test('a removed recipient, another account, or an unmounted lookup cannot redirect to the trip', async () => {
  const denied = screen({ canAccess: false }); denied.mount(); await flush();
  assert(!denied.calls.some(row => row.replace || row.invalidate));
  const unmounted = screen(); const cleanup = unmounted.mount(); cleanup(); await flush();
  assert(!unmounted.calls.some(row => row.replace || row.invalidate));
});

test('two accept clicks in the same render issue one POST and keep the pending state until confirmation', async () => {
  const s = screen({ canAccess: false, status: 'pending', delayed: true }); s.mount(); await flush();
  const button = s.button(); const first = button.props.onClick(); const second = button.props.onClick();
  assert.equal(s.calls.filter(row => row.method === 'POST').length, 1);
  assert.equal(s.state[2], true); s.finish(); await Promise.all([first, second]);
  assert.equal(s.calls.filter(row => row.push).length, 1); assert.equal(s.state[2], false);
});
