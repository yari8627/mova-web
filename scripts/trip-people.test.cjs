const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const context = { exports: {}, require: name => dependencies[name] };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText, context);
  return context.exports;
}
const counts = load('lib/trip-people.ts');
const base = { ownerId: 'owner', owner: { email: 'owner@example.com' }, participants: [] };

test('late invitations update the count; accepting does not count twice', () => {
  assert.equal(counts.countTripPeople(base), 1);
  const invited = { ...base, participants: [{ email: 'guest@example.com', status: 'pending' }] };
  assert.equal(counts.countTripPeople(invited), 2);
  invited.participants[0].status = 'confirmed';
  assert.equal(counts.countTripPeople(invited), 2);
  invited.participants = [];
  assert.equal(counts.countTripPeople(invited), 1);
});

test('deduplicate owner and email casing, and ignore inactive memberships', () => {
  assert.equal(counts.countTripPeople({ ...base, participants: [
    { email: 'OWNER@example.com', status: 'confirmed' },
    { email: 'guest@example.com', status: 'pending' },
    { email: ' Guest@example.com ', status: 'confirmed' },
    { email: 'removed@example.com', status: 'removed' },
  ] }), 2);
});

test('Home and detail APIs return the same current count despite stale stored people', async () => {
  const record = { ...base, id: 'trip', name: 'Roma', country: 'Italia', people: 1,
    participants: [{ email: 'first@example.com', status: 'pending' }, { email: 'second@example.com', status: 'confirmed' }] };
  for (const [file, depth] of [['app/api/trips/route.ts', '../../../'], ['app/api/trips/[id]/route.ts', '../../../../']]) {
    const api = load(file, {
      'next/server': { NextResponse: { json: value => value } },
      [`${depth}lib/auth`]: { currentUser: async () => ({ id: 'owner', email: 'owner@example.com' }) },
      [`${depth}lib/prisma`]: { prisma: { trip: { findMany: async query => { assert.ok(query.include.participants); return [record]; }, findUnique: async () => record } } },
      [`${depth}lib/trip-access`]: { tripAccess: async () => ({ allowed: true, role: 'owner' }) },
      [`${depth}lib/country-names`]: { normalizeTripCountry: value => value },
      [`${depth}lib/trip-people`]: counts,
    });
    const result = await api.GET({}, { params: Promise.resolve({ id: 'trip' }) });
    const trip = Array.isArray(result) ? result[0] : result;
    assert.equal(trip.people, 3);
    if (Array.isArray(result)) assert.equal(trip.participants, undefined, 'summary need not expose participant emails');
  }
});
