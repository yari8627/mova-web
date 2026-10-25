const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
function load(file, globals = {}, dependencies = {}) {
  const cache = new Map();
  function read(file) {
    file = path.resolve(file); if (!fs.existsSync(file) && file.endsWith('.ts') && fs.existsSync(file + 'x')) file += 'x'; if (cache.has(file)) return cache.get(file);
    const context = { exports: {}, Date, URL, AbortSignal, AbortController, setTimeout, clearTimeout, ...globals }; cache.set(file, context.exports);
    context.require = name => name in dependencies ? dependencies[name] : name.endsWith('.css') ? { default: new Proxy({}, { get: (_, key) => key }) } : name.startsWith('.') ? read(path.resolve(path.dirname(file), name + '.ts')) : require(name);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
    return context.exports;
  }
  return read(file);
}
function fixture({ email = 'guest@example.invalid', status = 'pending', member = 'pending', expired = false, endDate = '2099-01-02' } = {}) {
  const owner = { id: 'owner', email: 'owner@example.invalid', name: 'Owner' };
  const guest = { id: 'guest', email: 'guest@example.invalid', name: 'Guest' };
  const outsider = { id: 'outsider', email: 'other@example.invalid', name: 'Other' };
  let user = guest, rotations = 0, notifications = 0, exists = true;
  const trip = { id: 'trip', name: 'Shared trip', country: 'Italia', city: 'Roma', startDate: new Date(endDate.startsWith('2099') ? '2099-01-01' : endDate.startsWith('2020') ? '2020-01-01' : Date.now() - 86400000), endDate: new Date(endDate), archivedAt: null, ownerId: owner.id, people: 1 };
  const invite = { id: 'invite', code: 'NAMI-FIXTURE', tripId: trip.id, email, name: 'Guest', role: 'participant', status,
    expiresAt: new Date(expired ? '2000-01-01' : '2099-01-01'), acceptedAt: status === 'accepted' ? new Date() : null, trip };
  const members = member ? [{ id: 'guest-member', tripId: trip.id, email, name: 'Guest', role: 'participant', status: member }] : [];
  const emailMatches = (actual, expected) => typeof expected === 'object' ? expected.in ? expected.in.includes(actual) : actual.toLowerCase() === expected.equals.toLowerCase() : actual === expected;
  const membership = where => members.find(row => where.id ? row.id === where.id : row.tripId === where.tripId_email.tripId && row.email === where.tripId_email.email);
  const prisma = {
    $queryRaw: async () => [{ id: trip.id }],
    notification: { upsert: async () => { notifications++; } },
    trip: {
      findUnique: async () => exists ? ({ ...trip, owner, activities: [], bookings: [], expenses: [], documents: [], invites: [{ email: invite.email, name: invite.name }], participants: members.map(row => ({ ...row })) }) : null,
      findMany: async ({ where }) => exists && trip.archivedAt === null && where.OR.some(condition => condition.ownerId === user?.id && trip.ownerId === user?.id || condition.participants && members.some(row => row.status === 'confirmed' && emailMatches(row.email, condition.participants.some.email))) ? [{ ...trip, owner, participants: members.map(row => ({ ...row })) }] : [],
      create: async ({ data }) => { exists = true; return Object.assign(trip, data); },
      update: async ({ data }) => Object.assign(trip, data),
      delete: async () => { exists = false; return trip; },
    },
    tripInvite: { findUnique: async () => ({ ...invite }), findFirst: async () => invite.status === 'accepted' ? invite : null, update: async ({ data }) => Object.assign(invite, data),
      updateMany: async ({ where, data }) => {
        if (where.code && invite.code === where.code && invite.status === where.status && invite.expiresAt > where.expiresAt.gt) { Object.assign(invite, data); return { count: 1 }; }
        return { count: 0 };
      }, create: async ({ data }) => Object.assign(invite, data, { status: 'pending' }) },
    user: { findUnique: async () => guest },
    document: { findMany: async () => [] },
    participant: {
      findFirst: async () => members[0] || null,
      findUnique: async ({ where }) => membership(where) || null,
      upsert: async ({ where, update, create }) => { const row = membership(where); if (row) return Object.assign(row, update); const added = { ...create }; members.push(added); return added; },
      update: async ({ where, data }) => { const row = membership(where); if (!row) throw Error('Missing member'); return Object.assign(row, data); },
      updateMany: async ({ where, data }) => { for (const row of members) if (row.tripId === where.tripId && row.email === where.email && row.status !== where.status.not) Object.assign(row, data); return { count: 1 }; },
      deleteMany: async ({ where }) => { for (let index = members.length - 1; index >= 0; index--) if (members[index].tripId === where.tripId && emailMatches(members[index].email, where.email)) members.splice(index, 1); return { count: 1 }; },
      delete: async ({ where }) => { const index = members.indexOf(membership(where)); if (index < 0) throw Error('Missing member'); return members.splice(index, 1)[0]; },
    },
  };
  let transactions = Promise.resolve();
  prisma.$transaction = action => {
    const request = transactions.then(async () => {
      const previous = structuredClone({ members, invite });
      try { return typeof action === 'function' ? await action(prisma) : await Promise.all(action); }
      catch (error) { members.splice(0, members.length, ...previous.members); Object.assign(invite, previous.invite); throw error; }
    });
    transactions = request.then(() => undefined, () => undefined);
    return request;
  };
  function route(file, depth) {
    return load(file, { crypto: require('node:crypto') }, {
      'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
      [depth + 'lib/auth']: { currentUser: async () => user }, [depth + 'lib/prisma']: { prisma },
      './prisma': { prisma },
      [depth + 'lib/notifications']: { notifyUser: async () => { notifications++; } },
      [depth + 'lib/email']: { appUrl: () => 'https://example.invalid', sendMovaEmail: async () => {} },
      [depth + 'lib/activity-order-storage']: { ensureActivityOrder: async () => {} },
      [depth + 'lib/document-storage']: { deleteDocumentFile: async () => {} },
      [depth + 'lib/progress-cache-scope']: { rotateProgressScope: async () => { rotations++; } },
    });
  }
  const accept = route('app/api/invites/[code]/accept/route.ts', '../../../../../');
  const list = route('app/api/trips/route.ts', '../../../');
  const access = load('lib/trip-access.ts', {}, { './prisma': { prisma } });
  const leave = route('app/api/trips/[id]/leave/route.ts', '../../../../../');
  const sendInvite = route('app/api/trips/[id]/invites/route.ts', '../../../../../');
  const detail = route('app/api/trips/[id]/route.ts', '../../../../');
  const transfer = route('app/api/trips/[id]/transfer/route.ts', '../../../../../');
  return { owner, guest, outsider, trip, invite, members, prisma, accept, list, access, leave, sendInvite, detail, transfer, exists: value => { exists = value; },
    params: { params: Promise.resolve({ code: invite.code, id: trip.id }) },
    user: value => { user = value; }, rotations: () => rotations, notifications: () => notifications };
}

test('acceptance with legacy email casing is visible through the actual Home list query', async () => {
  const h = fixture({ email: 'Guest@Example.Invalid' });
  assert.equal((await h.accept.POST({}, h.params)).status, 200);
  assert.equal(h.invite.status, 'accepted');
  assert.equal(h.members.length, 1, 'retain the existing participant ID, avoid a second identity');
  assert.equal(h.members[0].id, 'guest-member');
  assert.equal(h.members[0].email, h.guest.email);
  assert.equal((await h.list.GET()).body.length, 1);
});
test('a previously accepted legacy confirmed member remains visible after refresh/new session', async () => {
  const h = fixture({ email: 'Guest@Example.Invalid', status: 'accepted', member: 'confirmed' });
  assert.equal((await h.list.GET()).body.length, 1);
  h.user(null); assert.equal((await h.list.GET()).status, 401);
  h.user({ ...h.guest }); assert.equal((await h.list.GET()).body.length, 1);
});
for (const membership of [null, 'pending']) test(`an accepted invite with ${membership || 'missing'} membership cannot falsely report participation or restore revoked access`, async () => {
  const h = fixture({ status: 'accepted', member: membership });
  const result = await h.accept.POST({}, h.params);
  assert.equal(result.status, 409);
  assert.equal((await h.list.GET()).body.length, 0);
  assert.equal((await h.access.tripAccess('trip', h.guest)).allowed, false);
});
for (const endDate of ['2099-01-02', new Date(Date.now() + 86400000).toISOString(), '2020-01-02']) test(`shared trip ${endDate.slice(0,10)} survives navigation, refresh and a fresh login for both users`, async () => {
  const h = fixture({ endDate });
  assert.equal((await h.list.GET()).body.length, 0);
  assert.equal((await h.accept.POST({}, h.params)).status, 200);
  for (let i = 0; i < 3; i++) { assert.equal((await h.list.GET()).body[0].id, 'trip'); assert.equal((await h.access.tripAccess('trip', h.guest)).role, 'participant'); }
  h.user(null); assert.equal((await h.list.GET()).status, 401);
  h.user({ ...h.guest }); assert.equal((await h.list.GET()).body.length, 1);
  h.user(h.owner); assert.equal((await h.list.GET()).body.length, 1);
  h.user(h.outsider); assert.equal((await h.list.GET()).body.length, 0); assert.equal((await h.access.tripAccess('trip', h.outsider)).allowed, false);
});
test('login during acceptance, duplicate acceptance and roles do not grant ownership or duplicate participants', async () => {
  const h = fixture(); h.user(null); assert.equal((await h.accept.POST({}, h.params)).status, 401);
  h.user(h.guest); assert.equal((await h.accept.POST({}, { params: Promise.resolve({ code: h.invite.code }) })).status, 200);
  assert.equal((await h.accept.POST({}, h.params)).status, 200);
  assert.equal(h.members.length, 1); assert.equal(h.trip.ownerId, h.owner.id); assert.equal(h.members[0].role, 'participant');
  assert.equal(h.rotations(), 1); assert.equal(h.notifications(), 1);
});
for (const status of ['revoked', 'replaced']) test(`${status} invitations cannot create membership`, async () => {
  const h = fixture({ status }); assert.equal((await h.accept.POST({}, h.params)).status, 409);
  assert.equal(h.members[0].status, 'pending'); assert.equal(h.rotations(), 0);
});
test('expired or wrong-account invitation never confirms participation', async () => {
  const h = fixture({ expired: true }); assert.equal((await h.accept.POST({}, h.params)).status, 410);
  h.user(h.outsider); assert.equal((await h.accept.POST({}, h.params)).status, 403);
  assert.equal(h.members[0].status, 'pending');
});
test('a candidate returned by the database is never exposed without an exact normalized membership identity', async () => {
  const h = fixture({ member: 'confirmed' });
  h.prisma.trip.findMany = async () => [{ ...h.trip, owner: h.owner, participants: [{ ...h.members[0], email: 'someone-else@example.invalid' }] }];
  assert.equal((await h.list.GET()).body.length, 0);
  h.user(h.owner); assert.equal((await h.list.GET()).body.length, 1);
});
test('leaving removes legacy-case membership and accepted links do not regrant it', async () => {
  const h = fixture({ email: 'Guest@Example.Invalid', status: 'accepted', member: 'confirmed' });
  assert.equal((await h.leave.POST({}, h.params)).status, 200);
  assert.equal((await h.list.GET()).body.length, 0);
  assert.equal((await h.accept.POST({}, h.params)).status, 409);
});

test('the owner creates an invitation, the guest accepts, and repeated invitations preserve confirmed access', async () => {
  const h = fixture({ member: null });
  h.user(h.owner); h.exists(false);
  assert.equal((await h.list.POST({ json: async () => ({ ...h.trip, startDate: '2099-01-01', endDate: '2099-01-02' }) })).status, 201);
  const request = { json: async () => ({ email: h.guest.email, role: 'participant' }) };
  assert.equal((await h.sendInvite.POST(request, h.params)).status, 201);
  assert.equal(h.members.length, 1); assert.equal(h.members[0].status, 'pending');
  h.user(h.guest); assert.equal((await h.accept.POST({}, { params: Promise.resolve({ code: h.invite.code }) })).status, 200);
  assert.equal((await h.list.GET()).body.length, 1);
  assert.equal((await h.detail.GET({}, h.params)).body.accessRole, 'participant');
  h.user(h.owner); assert.equal((await h.sendInvite.POST(request, h.params)).status, 201);
  assert.equal(h.members[0].status, 'confirmed'); assert.equal(h.members.length, 1);
  h.user(h.guest); assert.equal((await h.list.GET()).body.length, 1);
});
test('trip deletion remains owner-only and removes visibility for both accounts', async () => {
  const h = fixture({ member: 'confirmed' });
  assert.equal((await h.detail.DELETE({}, h.params)).status, 403);
  h.user(h.owner); assert.equal((await h.detail.DELETE({}, h.params)).status, 200);
  assert.equal((await h.list.GET()).body.length, 0);
  h.user(h.guest); assert.equal((await h.list.GET()).body.length, 0);
});
test('ownership transfer preserves other confirmed members and the previous owner remains a co-organizer', async () => {
  const h = fixture({ member: 'confirmed' });
  h.members.push({ id: 'third', tripId: 'trip', name: 'Other', email: h.outsider.email, role: 'participant', status: 'confirmed' });
  h.user(h.owner);
  assert.equal((await h.transfer.POST({ json: async () => ({ email: h.guest.email }) }, h.params)).status, 200);
  assert.equal((await h.access.tripAccess('trip', h.owner)).role, 'co-organizer');
  h.user(h.guest); assert.equal((await h.access.tripAccess('trip', h.guest)).role, 'owner'); assert.equal((await h.list.GET()).body.length, 1);
  h.user(h.outsider); assert.equal((await h.list.GET()).body.length, 1);
});
test('a failed acceptance transaction does not leave a confirmed participant with a pending invite', async () => {
  const h = fixture();
  h.prisma.participant.update = async () => { throw Error('database unavailable'); };
  await assert.rejects(h.accept.POST({}, h.params));
  assert.equal(h.members[0].status, 'pending'); assert.equal(h.invite.status, 'pending'); assert.equal(h.rotations(), 0);
});
test('legacy invitation roles cannot create an owner, while co-organizer stays within existing access rules', async () => {
  const h = fixture(); h.invite.role = 'owner'; await h.accept.POST({}, h.params);
  assert.equal((await h.access.tripAccess('trip', h.guest)).role, 'participant'); assert.equal(h.trip.ownerId, h.owner.id);
  const other = fixture(); other.invite.role = 'co-organizer'; await other.accept.POST({}, other.params);
  assert.equal((await other.access.tripAccess('trip', other.guest)).role, 'co-organizer');
});
test('parallel acceptance is idempotent and a replacement between validation and claim cannot be accepted', async () => {
  const h = fixture();
  const results = await Promise.all([h.accept.POST({}, h.params), h.accept.POST({}, h.params)]);
  assert(results.every(result => result.status === 200)); assert.equal(h.members.length, 1); assert.equal(h.notifications(), 1);
  const other = fixture(); const claim = other.prisma.tripInvite.updateMany;
  other.prisma.tripInvite.updateMany = async args => { other.invite.status = 'replaced'; return claim(args); };
  assert.equal((await other.accept.POST({}, other.params)).status, 409); assert.equal(other.members[0].status, 'pending');
});

module.exports = { load, fixture };

test('Home trip-list invalidation rejects stale in-flight data and keeps account caches separate', async () => {
  const values = new Map(), calls = [];
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const cache = load('lib/page-cache.ts', { sessionStorage: storage, fetch: () => new Promise(resolve => calls.push(resolve)) });
  cache.writePageCache('owner', 'trips', [{ id: 'private-owner-trip' }]);
  const old = cache.fetchPageCache('guest', 'trips', '/api/trips');
  cache.invalidatePageCache('guest', 'trips');
  const next = cache.fetchPageCache('guest', 'trips', '/api/trips');
  calls[0]({ ok: true, json: async () => [] }); await old;
  const duplicate = cache.fetchPageCache('guest', 'trips', '/api/trips');
  assert.equal(calls.length, 2, 'late cleanup must not remove the newer in-flight request');
  calls[1]({ ok: true, json: async () => [{ id: 'accepted-trip' }] }); await Promise.all([next, duplicate]);
  assert.equal(cache.readPageCache('guest', 'trips')[0].id, 'accepted-trip');
  assert.equal(cache.readPageCache('owner', 'trips')[0].id, 'private-owner-trip');
});

function inviteClient({ signedIn = true, ok = true, networkError = false } = {}) {
  let cursor = 0; const calls = [];
  const state = [{ code: 'NAMI-FIXTURE', email: 'guest@example.invalid', user: signedIn ? { id: 'guest', email: 'guest@example.invalid' } : null,
    role: 'participant', status: 'pending', expired: false, trip: { id: 'trip', name: 'Trip', country: 'Italia', city: 'Roma', startDate: '2099-01-01', endDate: '2099-01-02' } }, '', false];
  const api = load('app/invite/[code]/page.tsx', { fetch: async () => { if (networkError) throw Error('offline'); return { ok, status: ok ? 200 : 403, json: async () => ok ? { accepted: true, tripId: 'trip', userId: 'guest' } : { error: 'Accesso negato' } }; } }, {
    react: { useEffect() {}, useRef: value => ({ current: value }), useState(initial) { const at = cursor++; if (state[at] === undefined) state[at] = initial; return [state[at], value => { state[at] = value; }]; } },
    'next/navigation': { useParams: () => ({ code: 'NAMI-FIXTURE' }), useRouter: () => ({ push: path => calls.push({ push: path }), refresh: () => calls.push({ refresh: true }) }) },
    '../../../lib/page-cache': { invalidatePageCache: (...args) => calls.push({ invalidate: args }) },
    '../../../lib/trip-client-cache': { setTripCacheAccount: id => calls.push({ account: id }), removeTripSnapshot: id => calls.push({ snapshot: id }) },
  });
  const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  return { calls, state, accept: async () => { cursor = 0; const tree = api.default(); const button = nodes(tree).find(node => node.type === 'button' && node.props.className?.includes('invite-accept-button')); await button.props.onClick(); }, open: () => { cursor = 0; const tree = api.default(); nodes(tree).find(node => node.type === 'button' && node.props.children === 'Apri il viaggio').props.onClick(); } };
}
test('confirmed acceptance invalidates only the authenticated guest list and role snapshots before navigation', async () => {
  const h = inviteClient(); await h.accept();
  assert.deepEqual(h.calls.filter(row => row.invalidate).map(row => [...row.invalidate]), [['guest', 'trips'], ['guest', 'access-trip'], ['guest', 'participants-trip']]);
  assert.equal(h.calls.some(row => row.push), false, 'success is visible before explicit navigation');
  h.open(); assert.equal(h.calls.at(-2).push, '/trips/trip/overview'); assert.equal(h.calls.at(-1).refresh, true);
});
test('a login detour retains the original invitation and a denied/offline acceptance never clears cache or redirects', async () => {
  const anonymous = inviteClient({ signedIn: false }); await anonymous.accept();
  assert.equal(anonymous.calls[0].push, '/auth?next=%2Finvite%2FNAMI-FIXTURE');
  for (const config of [{ ok: false }, { networkError: true }]) {
    const h = inviteClient(config); await h.accept(); assert.equal(h.calls.length, 0); assert(config.networkError ? h.state[3].phase === 'uncertain' : h.state[1]); assert.equal(h.state[2], false);
  }
});

test('the actual Home groups accepted future/current trips in Programma and past trips in Completati', async () => {
  const SSR = require('react-dom/server');
  for (const endDate of ['2099-01-02', new Date(Date.now() + 86400000).toISOString(), '2020-01-02']) {
    const h = fixture({ endDate }); await h.accept.POST({}, h.params);
    const trips = (await h.list.GET()).body.map(trip => ({ ...trip, startDate: trip.startDate.toISOString().slice(0,10), endDate: trip.endDate.toISOString().slice(0,10) }));
    let cursor = 0; const state = [trips, h.guest, true, false, true];
    const page = load('app/page.tsx', {}, {
      react: { useState(initial) { const at = cursor++; if (state[at] === undefined) state[at] = typeof initial === 'function' ? initial() : initial; return [state[at], () => {}]; }, useEffect() {}, useRef: () => ({ current: null }), useMemo: callback => callback(), useCallback: callback => callback },
      'next/navigation': { useRouter: () => ({}) }, '../lib/preload-trips': {}, '../lib/trip-client-cache': {}, '../lib/page-cache': {},
      '../lib/use-autocomplete-keyboard': { useAutocompleteKeyboard: () => ({}) }, './components/home-trip-photo': { HomeTripPhoto: () => null },
      './components/nami-animated-splash': { NamiAnimatedSplash: props => props.children }, './home.module.css': { __esModule: true, default: {} },
    });
    const html = SSR.renderToStaticMarkup(page.default());
    const completed = html.slice(html.indexOf('id="completed-trips-carousel"'));
    assert.equal(completed.includes('Shared trip'), endDate.startsWith('2020'));
    assert(html.includes('Shared trip'));
  }
});
