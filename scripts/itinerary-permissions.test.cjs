const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function moduleWith(file, dependencies) {
  const context = { exports: {}, require: name => dependencies[name] };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText, context);
  return context.exports;
}

function route({ role = 'participant', allowed = true, signedIn = true, bookingCount = 1, fail = false } = {}) {
  const calls = { metadata: 0, activities: null, notifications: [] };
  const tx = { trip: { upsert: async () => { calls.metadata++; } }, activity: {
    deleteMany: async () => {}, createMany: async ({ data }) => { if (fail) throw Error('transaction failed'); calls.activities = data; },
  } };
  const api = moduleWith('app/api/trips/[id]/sync/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '../../../../../lib/auth': { currentUser: async () => signedIn ? { id: 'member', name: 'Maria' } : null },
    '../../../../../lib/trip-access': { tripAccess: async () => ({ allowed, role }) },
    '../../../../../lib/prisma': { prisma: { trip: { findUnique: async () => ({ id: 'trip' }) }, booking: { count: async () => bookingCount }, $transaction: async fn => fn(tx) } },
    '../../../../../lib/notifications': { notifyTripMembers: async (...args) => calls.notifications.push(args) },
  });
  return { calls, post: body => api.POST({ json: async () => ({ trip: { id: 'trip', name: 'forged metadata' }, ...body }) }, { params: Promise.resolve({ id: 'trip' }) }) };
}

const activity = { id: 'activity', day: 1, title: 'Museo', place: 'Roma', time: '09:00', done: false, bookingId: 'booking', bookingEvent: 'start' };
for (const [action, activities] of [['edit', [{ ...activity, title: 'Museo aggiornato' }]], ['complete', [{ ...activity, done: true }]], ['reopen', [activity]], ['delete', []]]) {
  test(`confirmed participant can ${action} synced activities and notify others`, async () => {
    const api = route();
    assert.equal((await api.post({ activities })).status, 200);
    assert.equal(api.calls.metadata, 0, 'participant cannot change trip metadata');
    assert.equal(api.calls.activities.length, activities.length);
    if (activities.length) { assert.equal(api.calls.activities[0].title, activities[0].title); assert.equal(api.calls.activities[0].done, activities[0].done); }
    assert.equal(api.calls.notifications.length, 1);
    assert.equal(api.calls.notifications[0][0], 'trip');
    assert.equal(api.calls.notifications[0][1], 'member');
    assert.equal(api.calls.notifications[0][2].type, 'itinerary');
  });
}

test('participant cannot smuggle other resources into an activity sync', async () => {
  for (const extra of [{ budget: 1 }, { bookings: [] }, { documents: [] }, { participants: [] }, { expenses: [] }]) {
    const api = route();
    assert.equal((await api.post({ activities: [], ...extra })).status, 403);
    assert.equal(api.calls.activities, null);
    assert.equal(api.calls.notifications.length, 0);
  }
});

test('nonmembers and unsigned users cannot edit', async () => {
  assert.equal((await route({ allowed: false }).post({ activities: [] })).status, 403);
  assert.equal((await route({ signedIn: false }).post({ activities: [] })).status, 401);
});

test('booking links must belong to the same trip', async () => {
  const api = route({ bookingCount: 0 });
  assert.equal((await api.post({ activities: [activity] })).status, 400);
  assert.equal(api.calls.activities, null);
});

test('organizer permissions still work; failed saves send no notification', async () => {
  for (const role of ['owner', 'co-organizer']) assert.equal((await route({ role }).post({ activities: [] })).status, 200);
  const api = route({ fail: true });
  await assert.rejects(api.post({ activities: [activity] }));
  assert.equal(api.calls.notifications.length, 0);
});

test('notifications target confirmed members and owner, excluding the actor', async () => {
  let userQuery;
  let sent;
  const notifications = moduleWith('lib/notifications.ts', {
    crypto: { randomUUID: () => 'notification' },
    './prisma': { prisma: {
      trip: { findUnique: async query => { assert.equal(query.include.participants.where.status, 'confirmed'); return { ownerId: 'owner', participants: [{ email: 'OTHER@example.com' }] }; } },
      user: { findMany: async query => { userQuery = query; return [{ id: 'owner' }, { id: 'other' }]; } },
      notification: { createMany: async ({ data }) => { sent = data; } },
    } },
  });
  await notifications.notifyTripMembers('trip', 'member', { type: 'itinerary', title: 'Itinerario aggiornato', message: 'Maria ha modificato l’itinerario.', link: '/trips/trip' });
  assert.equal(userQuery.where.NOT.id, 'member');
  assert.equal(userQuery.where.OR[0].id, 'owner');
  assert.equal(userQuery.where.OR[1].email.in[0], 'other@example.com');
  assert.equal(sent.length, 2);
});
