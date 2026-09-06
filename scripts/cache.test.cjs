const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, fetch = async () => { throw Error('offline'); }, dependencies = {}) {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const context = { exports: {}, require: name => dependencies[name], AbortSignal, fetch, Date, Map, JSON, sessionStorage: storage, window: { localStorage: storage, dispatchEvent() {} }, CustomEvent: class {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports;
}

test('page copies are separated by account and resource', () => {
  const cache = load('lib/page-cache.ts');
  cache.writePageCache('alice', 'packing-personal', ['passport']);
  assert.equal(cache.readPageCache('bob', 'packing-personal'), null);
  assert.equal(cache.readPageCache('alice', 'packing-shared'), null);
  assert.equal(cache.readPageCache('alice', 'packing-personal')[0], 'passport');
});

test('overview preload and opening share three requests and reuse ready data', async () => {
  let calls = 0;
  const cache = load('lib/page-cache.ts', async url => {
    calls++;
    return { ok: true, json: async () => url.endsWith('check-in') ? { completed: true, returnCompleted: true } : [{ id: 'item', packed: true }] };
  });
  await Promise.all([cache.preloadOverview('alice', 'trip'), cache.preloadOverview('alice', 'trip')]);
  await cache.preloadOverview('alice', 'trip');
  assert.equal(calls, 3);
  assert.equal(cache.readPageCache('alice', 'check-in-trip').completed, true);
  cache.writePageCache('alice', 'packing-trip-personal', [{ id: 'item', packed: false }]);
  await cache.preloadOverview('alice', 'trip');
  assert.equal(cache.readPageCache('alice', 'packing-trip-personal')[0].packed, false);
});

test('a preload cannot overwrite a later check-in edit', async () => {
  let resolve;
  const cache = load('lib/page-cache.ts', () => new Promise(done => { resolve = done; }));
  const pending = cache.fetchPageCache('alice', 'check-in-trip', '/check-in');
  cache.writePageCache('alice', 'check-in-trip', { completed: true });
  resolve({ ok: true, json: async () => ({ completed: false }) });
  assert.equal((await pending).completed, true);
  assert.equal(cache.readPageCache('alice', 'check-in-trip').completed, true);
});

test('cover and page share a concurrent request', async () => {
  let calls = 0;
  let resolve;
  const cache = load('lib/trip-client-cache.ts', () => { calls++; return new Promise(done => { resolve = done; }); });
  cache.setTripCacheAccount('alice');
  const a = cache.fetchTripSnapshot('trip');
  const b = cache.fetchTripSnapshot('trip');
  resolve({ ok: true, json: async () => ({ id: 'trip' }) });
  await Promise.all([a, b]);
  assert.equal(calls, 1);
  assert.equal(cache.readTripSnapshot('trip').id, 'trip');
});

test('late response from an earlier account cannot repopulate cache', async () => {
  let resolve;
  const cache = load('lib/trip-client-cache.ts', () => new Promise(done => { resolve = done; }));
  cache.setTripCacheAccount('alice');
  const pending = cache.fetchTripSnapshot('trip');
  cache.setTripCacheAccount('bob');
  cache.setTripCacheAccount('alice');
  resolve({ ok: true, json: async () => ({ id: 'trip', name: 'old' }) });
  assert.equal(await pending, null);
  assert.equal(cache.readTripSnapshot('trip'), null);
});

test('invalidating after an edit rejects an older response', async () => {
  let resolve;
  const cache = load('lib/trip-client-cache.ts', () => new Promise(done => { resolve = done; }));
  cache.setTripCacheAccount('alice');
  const pending = cache.fetchTripSnapshot('trip');
  cache.removeTripSnapshot('trip');
  resolve({ ok: true, json: async () => ({ id: 'trip' }) });
  assert.equal(await pending, null);
  assert.equal(cache.readTripSnapshot('trip'), null);
});

test('network failure preserves the cached snapshot', async () => {
  const cache = load('lib/trip-client-cache.ts');
  cache.setTripCacheAccount('alice');
  cache.writeTripSnapshot('trip', { id: 'trip' });
  assert.equal((await cache.fetchTripSnapshot('trip', true)).id, 'trip');
  cache.setTripCacheAccount('bob');
  assert.equal(cache.readTripSnapshot('trip'), null);
});

test('startup prepares every trip and its tab data before resolving', async () => {
  let requests = 0;
  const fetch = async url => {
    requests++;
    const id = url.includes('/two') ? 'two' : 'one';
    const value = url.endsWith('/check-in') ? { completed: true, returnCompleted: false }
      : url.includes('packing') ? [] : { id, accessRole: 'owner', country: 'Italia', documents: [], participants: [], bookings: [], expenses: [], activities: [] };
    return { ok: true, json: async () => value };
  };
  const pages = load('lib/page-cache.ts', fetch);
  const trips = load('lib/trip-client-cache.ts', fetch);
  const startup = load('lib/preload-trips.ts', fetch, { './page-cache': pages, './trip-client-cache': trips });
  const progress = [];
  await startup.preloadTrips({ id: 'alice', name: 'Alice' }, [{ id: 'one' }, { id: 'two' }], (done, total) => progress.push([done, total]), () => false);
  assert.equal(requests, 9);
  assert.equal(startup.tripsPrepared('alice', [{ id: 'one' }, { id: 'two' }]), true);
  assert.equal(pages.readPageCache('alice', 'access-two').role, 'owner');
  assert.equal(pages.readPageCache('alice', 'check-in-two').completed, true);
  assert.equal(progress.at(-1)[0], 2);
  await trips.fetchTripSnapshot('two');
  await pages.preloadOverview('alice', 'two');
  assert.equal(requests, 9, 'opening a prepared tab must not repeat network calls');
});

test('startup queue limits concurrency, survives failures and honors cancellation', async () => {
  const startup = load('lib/preload-trips.ts');
  let active = 0;
  let peak = 0;
  const attempted = [];
  await startup.runPreloadQueue([1, 2, 3, 4], async value => {
    active++;
    peak = Math.max(peak, active);
    attempted.push(value);
    await Promise.resolve();
    active--;
    if (value === 2) throw Error('unavailable');
  }, () => {});
  assert.equal(peak, 2);
  assert.equal(attempted.length, 4);
  await startup.runPreloadQueue([5], async () => assert.fail('cancelled work started'), () => {}, () => true);
});
