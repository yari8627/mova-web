// Repeatable isolated benchmark; database latency is simulated, never production data.
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const { performance } = require('node:perf_hooks');
const { execFileSync } = require('node:child_process');
const routeFile = 'app/api/progress/route.ts';
const BASELINE = 'ea53ba0';
function loadRoute({ source = fs.readFileSync(routeFile, 'utf8'), trips = [], visits = [], user = { id: 'test-user', email: 'test@example.invalid' }, latency = 0, database, timing = false } = {}) {
  const calls = [];
  const query = async (name, value, args) => { calls.push({ name, args }); if (latency) await new Promise(r => setTimeout(r, latency)); return value; };
  const context = { exports: {}, URL, process: { env: { NAMI_PROGRESS_TIMING: timing ? '1' : undefined } }, require: name => {
    if (name.endsWith('/progress-cache-scope')) return { progressCacheScope: async (_, expiresAt) => ({ scope:'11111111-1111-4111-8111-111111111111',owner:'a'.repeat(64),expiresAt:expiresAt || '2099-01-01T00:00:00.000Z' }) };
    if (name.endsWith('/progress-cache-contract')) { const module={exports:{},require}; vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/progress-cache-contract.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,module); return module.exports; }
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, headers: new Headers(options?.headers), status: options?.status || 200 }) } };
    if (name.endsWith('/auth')) return { currentUser: async () => { if (latency) await new Promise(r => setTimeout(r, latency)); return user; } };
    if (name.endsWith('/prisma')) return { prisma: database || {
      trip: { findMany: args => query('trips', trips, args) },
      visitedCountry: {
        findMany: args => query('visits', visits, args),
        upsert: args => query('upsert', args.create, args),
        createMany: args => query('createMany', { count: args.data.length }, args),
        deleteMany: args => query('deleteMany', { count: 1 }, args),
      },
    } };
    return require(name);
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return { api: context.exports, calls };
}
async function benchmark(source) {
  const result = [];
  for (const size of [0, 35, 100]) {
    const trips = Array.from({ length: size }, (_, i) => ({ country: ['Italia', 'France', 'Japan'][i % 3], startDate: new Date('2026-01-01') }));
    const times = []; let requests;
    for (let i = 0; i < 5; i++) {
      const visits = require('country-state-city').Country.getAllCountries().slice(0, size).map(c => ({ id: c.isoCode, countryCode: c.isoCode, source: 'manual', visitedAt: '2026-01-01' }));
      const h = loadRoute({ source, trips, visits, latency: 10 });
      const start = performance.now(); await h.api.GET(); times.push(performance.now() - start);
      requests = h.calls.length;
    }
    result.push({ trips: size, medianMs: +times.sort((a,b) => a-b)[2].toFixed(2), databaseCallsExcludingAuth: requests });
  }
  return result;
}
function loadMapModule(fetch) {
  const context = { exports: {}, fetch, require };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/progress-map.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, context);
  return context.exports;
}
function baselineMapLoader() {
  const source = execFileSync('git', ['show', BASELINE + ':app/progress/page.tsx'], { encoding: 'utf8' });
  let effect, result;
  const context = { exports: {}, fetch: async url => ({ ok: true, json: async () => url === '/world-countries.json' ? JSON.parse(fs.readFileSync('public/world-countries.json', 'utf8')) : [] }), require: name => {
    if (name === 'react') { let index = 0; return { useEffect: fn => { effect = fn; }, useMemo: fn => fn(), useState: value => { const slot = index++; return [value, next => { if (slot === 1) result = next; }]; } }; }
    if (name === 'next/navigation') return { useRouter: () => ({}) };
    if (name.endsWith('/use-autocomplete-keyboard')) return { useAutocompleteKeyboard: () => ({}) };
    if (name.endsWith('.css')) return { __esModule: true, default: {} };
    return require(name);
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
  context.exports.default();
  return async () => { effect(); await new Promise(r => setImmediate(r)); return result; };
}
async function benchmarkMap() {
  const before = baselineMapLoader(); let requests = 0;
  const after = loadMapModule(async () => { requests++; return { ok: true, json: async () => JSON.parse(fs.readFileSync('public/world-countries.json', 'utf8')) }; }).loadMapCountries;
  const original = await before(), optimized = await after();
  require('node:assert/strict').equal(JSON.stringify(original), JSON.stringify(optimized));
  const measure = async fn => { const samples = []; for (let i=0;i<20;i++) { const start = performance.now(); await fn(); samples.push(performance.now()-start); } return +samples.sort((a,b)=>a-b)[10].toFixed(3); };
  return { conditions: 'Node; real 107761-byte topology; 20 warm repeated loads; excludes SVG/browser rendering', paths: optimized.length, identicalGeometry: true, beforeMedianMs: await measure(before), afterMedianMs: await measure(after), afterRequestsIncludingWarmup: requests };
}
if (require.main === module) {
  (async () => {
    const source = process.argv.includes('--baseline') ? execFileSync('git', ['show', BASELINE + ':' + routeFile], { encoding: 'utf8' }) : fs.readFileSync(routeFile, 'utf8');
    console.log(JSON.stringify({ conditions: 'Node; 5 samples; simulated 10ms per auth/query; no network or real database', results: await benchmark(source) }, null, 2));
    if (!process.argv.includes('--baseline')) console.log(JSON.stringify(await benchmarkMap(), null, 2));
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { loadRoute, loadMapModule };
