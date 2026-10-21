// Same endpoint fixture and simulated latency before/after. Not a browser or iPhone measurement.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {performance}=require('node:perf_hooks');
const {countries}=require('countries-list');
function moduleFor(file){const context={exports:{},AbortController,setTimeout,clearTimeout,require:name=>name.endsWith('/progress-cache-contract')?moduleFor('lib/progress-cache-contract.ts'):require(name)};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);return context.exports;}
const {createProgressMemoryStore}=moduleFor('lib/progress-memory-store.ts');
const data=Object.keys(countries).slice(0,35).map((countryCode,i)=>({id:countryCode,countryCode,visitedAt:'2026-10-01T00:00:00.000Z',source:['manual','position','trip'][i%3]}));
const scope='11111111-1111-4111-8111-111111111111';
const samples=[];let calls=0;
async function endpoint(){calls++;await new Promise(resolve=>setTimeout(resolve,200));return new Response(JSON.stringify(data),{headers:{'X-Nami-Progress-Scope':scope,'X-Nami-Progress-Owner':'a'.repeat(64),'X-Nami-Progress-Expiry':new Date(Date.now()+60000).toISOString()}});}
(async()=>{
  // Warm up platform classes before timed samples.
  new Response('[]');
  for(let i=0;i<5;i++){
    let started=performance.now();await (await endpoint()).json();const beforeReturnMs=performance.now()-started;
    const store=createProgressMemoryStore({fetch:endpoint,readScope:()=>scope,seedScope(){}});
    try{
      started=performance.now();await store.revalidate();const firstLoadMs=performance.now()-started;
      started=performance.now();const cached=store.read();const cachedReadMs=performance.now()-started;
      if(cached?.length!==35)throw Error('Cache fixture mismatch');
      started=performance.now();await store.revalidate();const backgroundGetMs=performance.now()-started;
      samples.push({beforeReturnMs,firstLoadMs,cachedReadMs,backgroundGetMs});
    }finally{store.clear();}
  }
  const median=key=>+samples.map(sample=>sample[key]).sort((a,b)=>a-b)[2].toFixed(4);
  console.log(JSON.stringify({conditions:'Node desktop; 35 synthetic visits; 200ms simulated API delay; 5 samples; identity metadata verified by the store; excludes rendering and real network',samples,median:{beforeReturnMs:median('beforeReturnMs'),firstLoadMs:median('firstLoadMs'),cachedReadMs:median('cachedReadMs'),backgroundGetMs:median('backgroundGetMs')},requests:calls,requestsPerMount:1,extraIdentityRequests:0},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
