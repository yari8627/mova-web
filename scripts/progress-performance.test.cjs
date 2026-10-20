const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, loadMapModule } = require('./progress-performance.cjs');
const fs = require('node:fs');

test('GET uses a bounded query count, keeps first trip date and skips duplicate countries', async () => {
  const first = new Date('2026-01-01');
  const h = loadRoute({ trips: Array.from({ length: 100 }, (_, i) => ({ country: i % 2 ? 'France' : 'Italia', startDate: i === 0 ? first : new Date('2026-02-01') })) });
  assert.equal((await h.api.GET()).status, 200);
  assert.equal(h.calls.length, 3);
  const bulk = h.calls.find(call => call.name === 'createMany').args;
  assert.equal(bulk.skipDuplicates, true);
  assert.equal(bulk.data.length, 2);
  assert.equal(bulk.data[0].countryCode, 'IT');
  assert.equal(bulk.data[0].visitedAt, first);
  assert(bulk.data.every(row => row.userId === 'test-user' && row.source === 'trip'));
  const access = h.calls[0].args.where;
  assert.equal(access.OR[0].ownerId, 'test-user');
  assert.equal(access.OR[1].participants.some.email, 'test@example.invalid');
  assert.equal(access.OR[1].participants.some.status, 'confirmed');
  assert.equal(h.calls.at(-1).args.where.userId, 'test-user');
  assert.equal(h.calls.at(-1).args.orderBy.visitedAt, 'desc');
});

test('empty or unrecognized trip countries never create records; unauthorized requests never query data', async () => {
  for (const trips of [[], [{ country: 'not a country', startDate: new Date() }]]) {
    const h = loadRoute({ trips }); await h.api.GET();
    assert.equal(h.calls.length, 2);
    assert(!h.calls.some(call => call.name === 'createMany'));
  }
  const h = loadRoute({ user: null });
  assert.equal((await h.api.GET()).status, 401); assert.equal(h.calls.length, 0);
});

test('bulk import preserves existing manual/position records and account isolation across reloads', async () => {
  const rows = [
    { id: 'manual', userId: 'test-user', countryCode: 'IT', source: 'manual', visitedAt: new Date('2026-04-01') },
    { id: 'position', userId: 'test-user', countryCode: 'JP', source: 'position', visitedAt: new Date('2026-05-01') },
    { id: 'other', userId: 'other-user', countryCode: 'FR', source: 'manual', visitedAt: new Date('2026-06-01') },
  ];
  const snapshot = JSON.stringify(rows);
  const database = {
    trip: { findMany: async () => ['Italia','Japan','France'].map(country => ({ country, startDate: new Date('2026-01-01') })) },
    visitedCountry: {
      createMany: async ({ data, skipDuplicates }) => { assert(skipDuplicates); for (const row of data) if (!rows.some(r => r.userId === row.userId && r.countryCode === row.countryCode)) rows.push(row); },
      findMany: async ({ where }) => rows.filter(row => row.userId === where.userId).sort((a,b) => b.visitedAt-a.visitedAt),
    },
  };
  const h = loadRoute({ database });
  const first = await h.api.GET(), second = await h.api.GET();
  assert.equal(first.body.length, 3); assert.equal(second.body.length, 3);
  assert.equal(JSON.stringify(rows.slice(0,3)), snapshot);
  assert(first.body.every(row => row.userId === 'test-user'));
  assert.equal(first.body[0].id, 'position');
});

test('manual creation and removal retain API validations and authenticated user filters', async () => {
  const h = loadRoute();
  assert.equal((await h.api.POST({ json: async () => ({ countryCode: 'XX' }) })).status, 400);
  assert.equal(h.calls.length, 0);
  assert.equal((await h.api.POST({ json: async () => ({ countryCode: 'it', source: 'manual' }) })).body.countryCode, 'IT');
  assert.equal(h.calls[0].args.where.userId_countryCode.userId, 'test-user');
  await h.api.DELETE(new Request('http://localhost/api/progress?countryCode=it'));
  assert.equal(h.calls[1].args.where.userId, 'test-user');
  assert.equal(h.calls[1].args.where.countryCode, 'IT');
  const denied = loadRoute({ user: null });
  assert.equal((await denied.api.POST({})).status, 401);
  assert.equal((await denied.api.DELETE({})).status, 401);
  assert.equal(denied.calls.length, 0);
});

test('geography is fetched and built once across concurrent requests and subsequent mounts', async () => {
  let calls = 0;
  const map = loadMapModule(async () => { calls++; return { ok: true, json: async () => JSON.parse(fs.readFileSync('public/world-countries.json','utf8')) }; });
  const [first, second] = await Promise.all([map.loadMapCountries(), map.loadMapCountries()]);
  assert.equal(first, second); assert.equal(await map.loadMapCountries(), first); assert.equal(calls, 1);
  assert(first.length > 150);
  assert(first.every(row => Object.keys(row).sort().join(',') === 'code,name,path'));
  assert(first.some(row => row.code === 'FR'));
});

test('failed geography loads are not cached and can be retried', async () => {
  let calls = 0;
  const map = loadMapModule(async () => ({ ok: ++calls > 1, json: async () => JSON.parse(fs.readFileSync('public/world-countries.json','utf8')) }));
  await assert.rejects(map.loadMapCountries(), /Mappa non disponibile/);
  assert((await map.loadMapCountries()).length > 150); assert.equal(calls, 2);
});
