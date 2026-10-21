// Controlled route profiling. This does not claim authenticated PostgreSQL/iPhone timings.
const { loadRoute } = require('./progress-performance.cjs');
const fs = require('node:fs');
const { Country } = require('country-state-city');
const { performance } = require('node:perf_hooks');
const source = process.argv.includes('--baseline')
  ? require('node:child_process').execFileSync('git',['show','1e26e19:app/api/progress/route.ts'],{encoding:'utf8'})
  : fs.readFileSync('app/api/progress/route.ts', 'utf8');
(async () => {
  const scenarios = [];
  for (const count of [0,35,120]) {
    const visits = Country.getAllCountries().slice(0,35).map(c => ({ id:c.isoCode, countryCode:c.isoCode, visitedAt:'2026-01-01',source:'manual' }));
    // Countries already present: isolate the unnecessary no-op synchronization.
    const trips = Array.from({length:count},(_,i)=>({country:Country.getCountryByCode(visits[i%visits.length].countryCode).name,startDate:new Date('2026-01-01')}));
    const samples = [];
    for (let i=0;i<5;i++) {
      const h = loadRoute({ source, trips, visits:count?visits:[],latency:20,timing:true });
      const start = performance.now(); const response = await h.api.GET();
      samples.push({ totalMs:+(performance.now()-start).toFixed(2),serverTiming:response.headers.get('Server-Timing'),queries:h.calls.map(c=>c.name) });
    }
    scenarios.push({trips:count, visits:count?35:0, samples, medianMs:[...samples].sort((a,b)=>a.totalMs-b.totalMs)[2].totalMs});
  }
  console.log(JSON.stringify({conditions:'Synthetic authenticated identity; simulated 20ms per auth/query, 5 samples per scenario, serial single-connection behavior; no PostgreSQL/network/browser',scenarios},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
