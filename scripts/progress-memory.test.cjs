const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const visit=(code,source='manual')=>({id:code,countryCode:code,visitedAt:'2026-01-01T00:00:00.000Z',source});
function load(file,globals={},dependencies={}) {
  const cache=new Map();
  function moduleFor(file) {
    file=path.resolve(file);if(cache.has(file))return cache.get(file);
    const context={exports:{},AbortController,setTimeout,clearTimeout,Date,...globals};cache.set(file,context.exports);
    context.require=name=>name in dependencies?dependencies[name]:name.startsWith('.')?moduleFor(path.resolve(path.dirname(file),name+'.ts')):require(name);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,context);
    return context.exports;
  }
  return moduleFor(file);
}
function harness(t,{scope=A,timeoutMs=8000,abort=false}={}) {
  const calls=[];let clock=Date.now(),marker=scope;
  const store=load('lib/progress-memory-store.ts').createProgressMemoryStore({
    readScope:()=>marker,seedScope:(value)=>{if(!marker)marker=value;},now:()=>clock,timeoutMs,
    fetch:(url,options)=>new Promise((resolve,reject)=>{calls.push({url,options,resolve,reject});if(abort)options?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});}),
  });
  t.after(()=>store.clear());
  const response=(data,{scope=marker,owner=scope===B?'b'.repeat(64):'a'.repeat(64),status=200}={})=>new Response(JSON.stringify(data),{status,headers:{'X-Nami-Progress-Scope':scope,'X-Nami-Progress-Owner':owner,'X-Nami-Progress-Expiry':new Date(clock+60000).toISOString()}});
  async function seed(data=[visit('IT')]){const request=store.revalidate();calls.at(-1).resolve(response(data));await request;}
  return{store,calls,response,seed,setScope:value=>{marker=value;},scope:()=>marker,advance:amount=>{clock+=amount;}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('cold load verifies the identity once and deduplicates concurrent GETs',async t=>{
  const h=harness(t);assert.equal(h.store.read(),null);
  const first=h.store.revalidate(),second=h.store.revalidate();assert.equal(first,second);assert.equal(h.calls.length,1);
  assert.equal(h.store.read(),null);h.calls[0].resolve(h.response([visit('IT')]));await first;
  assert.equal(h.store.read()[0].countryCode,'IT');assert(!h.calls.some(c=>c.url==='/api/auth/me'));
});
test('return is immediate while a slow revalidation preserves data; identical data keeps its reference',async t=>{
  const h=harness(t);await h.seed();const previous=h.store.read();
  const unsubscribe=h.store.subscribe(()=>{});unsubscribe();
  const returning=h.store.read();const refresh=h.store.revalidate();assert.equal(returning,previous);assert.equal(h.store.read(),previous);
  h.calls.at(-1).resolve(h.response([visit('IT')]));await refresh;assert.equal(h.store.read(),previous);
});
test('different server data replaces all personal statistics inputs together',async t=>{
  const h=harness(t);await h.seed();const refresh=h.store.revalidate();h.calls.at(-1).resolve(h.response([visit('JP','position'),visit('IT')]));await refresh;
  assert.equal(h.store.read().length,2);assert.equal(h.store.read()[0].countryCode,'JP');assert.equal(h.store.read()[0].source,'position');
});
test('failed background GET preserves the last data with a stale warning, and retry recovers',async t=>{
  const h=harness(t);await h.seed();const previous=h.store.read(),refresh=h.store.revalidate();h.calls.at(-1).resolve(h.response({}, {status:500}));await refresh;
  assert.equal(h.store.read(),previous);assert.equal(h.store.issue(),'stale');await h.seed([visit('JP')]);assert.equal(h.store.issue(),null);
});
test('timeout preserves cached data but 401 always erases it',async t=>{
  const h=harness(t,{timeoutMs:5,abort:true});await h.seed();await h.store.revalidate();assert.equal(h.store.issue(),'stale');assert.equal(h.store.read().length,1);
  const request=h.store.revalidate();h.calls.at(-1).resolve(h.response({}, {status:401}));await request;assert.equal(h.store.read(),null);assert.equal(h.store.issue(),'session');
});
test('logout during GET cannot restore private data even if the transport ignores abort',async t=>{
  const h=harness(t);await h.seed();const request=h.store.revalidate();h.setScope('signed-out');h.store.clear();h.calls.at(-1).resolve(h.response([visit('JP')],{scope:A}));await request;
  assert.equal(h.store.read(),null);assert.equal(h.scope(),'signed-out');
});
test('account change hides old data before the next request and ignores out-of-order responses',async t=>{
  const h=harness(t);await h.seed();const older=h.store.revalidate(),old=h.calls.at(-1);h.setScope(B);assert.equal(h.store.read(),null);h.store.checkSession();
  const newer=h.store.revalidate();h.calls.at(-1).resolve(h.response([visit('JP')],{scope:B}));await newer;
  old.resolve(h.response([visit('IT')],{scope:A}));await older;assert.equal(h.store.read()[0].countryCode,'JP');
});
test('legacy sessions bootstrap only after server verification; late responses cannot overwrite a newer login',async t=>{
  const h=harness(t,{scope:''});const first=h.store.revalidate();h.calls[0].resolve(h.response([visit('IT')],{scope:A}));await first;assert.equal(h.scope(),A);assert.equal(h.store.read().length,1);
  const other=harness(t,{scope:''});const stale=other.store.revalidate();other.setScope(B);other.calls[0].resolve(other.response([visit('IT')],{scope:A}));await stale;assert.equal(other.scope(),B);assert.equal(other.store.read(),null);
});
test('unverified response metadata never enters the cache',async t=>{
  const h=harness(t);const request=h.store.revalidate();h.calls[0].resolve(new Response(JSON.stringify([visit('IT')]),{status:200}));await request;
  assert.equal(h.store.read(),null);assert.equal(h.store.issue(),'load');
});
test('trip changes invalidate cached data by changing only the public scope marker',async t=>{
  const h=harness(t);await h.seed();h.setScope(B);assert.equal(h.store.read(),null);h.store.checkSession();await h.seed([visit('FR','trip'),visit('IT')]);
  assert.equal(h.store.read()[0].source,'trip');assert.equal(h.store.read().length,2);
});
test('GET before a confirmed mutation cannot overwrite it; additions and removals serialize',async t=>{
  const h=harness(t);await h.seed();const oldGet=h.store.revalidate(),old=h.calls.at(-1);
  const add=h.store.add('JP','position'),remove=h.store.remove('IT');await flush();
  const post=h.calls.at(-1);assert.equal(post.options.method,'POST');assert.equal(JSON.parse(post.options.body).source,'position');
  old.resolve(h.response([visit('IT')]));await oldGet;
  post.resolve(h.response(visit('JP','position')));await add;await flush();
  const deletion=h.calls.at(-1);assert.equal(deletion.options.method,'DELETE');deletion.resolve(h.response({deleted:true}));await remove;
  assert.equal(h.store.read().length,1);assert.equal(h.store.read()[0].countryCode,'JP');
});
test('revalidation requested during a mutation waits for confirmation and issues only one GET',async t=>{
  const h=harness(t);await h.seed();const add=h.store.add('JP');await flush();const post=h.calls.at(-1);
  const first=h.store.revalidate(),second=h.store.revalidate();assert.equal(h.calls.length,2);
  post.resolve(h.response(visit('JP')));await add;await flush();assert.equal(h.calls.length,3);
  h.calls.at(-1).resolve(h.response([visit('JP'),visit('IT')]));await Promise.all([first,second]);assert.equal(h.store.read().length,2);
});
test('logout/account change during queued mutations never sends the queued operation as the new user',async t=>{
  const h=harness(t);await h.seed();const add=h.store.add('JP'),remove=h.store.remove('IT');const rejectedAdd=assert.rejects(add),rejectedRemove=assert.rejects(remove);await flush();const post=h.calls.at(-1);
  h.setScope(B);h.store.clear();post.resolve(h.response(visit('JP'),{scope:A}));await Promise.all([rejectedAdd,rejectedRemove]);
  assert.equal(h.calls.length,2);assert.equal(h.store.read(),null);
});
test('failed mutations preserve the last confirmed cache value',async t=>{
  const h=harness(t);await h.seed();const remove=h.store.remove('IT'),rejected=assert.rejects(remove);await flush();h.calls.at(-1).resolve(h.response({}, {status:500}));await rejected;
  assert.equal(h.store.read()[0].countryCode,'IT');assert.equal(h.store.issue(),'mutation');
});
test('expired session snapshots are not readable and unnecessary fields are never retained',async t=>{
  const h=harness(t);await h.seed([{...visit('IT'),userId:'not-retained',passwordHash:'not-retained'}]);assert.equal(Object.keys(h.store.read()[0]).sort().join(','),'countryCode,id,source,visitedAt');
  h.advance(60001);assert.equal(h.store.read(),null);h.store.checkSession();assert.equal(h.store.read(),null);
});
test('server rendering never creates a personal cache or accesses browser storage',async()=>{
  let calls=0;
  const adapter=load('lib/progress-memory.ts',{fetch:()=>{calls++;throw Error('unexpected');}});
  assert.equal(adapter.readProgressMemory(),null);assert.equal(await adapter.refreshProgressMemory(),null);adapter.resetProgressMemory();assert.equal(calls,0);
});

test('public marker rotates on actual session creation, and logout writes a tombstone without changing authentication checks',async()=>{
  const values=new Map(),writes=[],databaseCalls=[];
  const expiresAt=new Date(Date.now()+60000);
  const jar={get:key=>values.has(key)?{value:values.get(key)}:undefined,set:(key,value,options)=>{values.set(key,value);writes.push({key,value,options});},delete:key=>values.delete(key)};
  const dependencies={
    'next/headers':{cookies:async()=>jar},
    './prisma':{prisma:{authSession:{create:async args=>databaseCalls.push(args),deleteMany:async args=>databaseCalls.push(args),findUnique:async()=>({expiresAt,user:{id:'test-user',name:'Test',email:'test@example.invalid',externalAvatarUrl:null}})}}},
  };
  const auth=load('lib/auth.ts',{process:{env:{NODE_ENV:'production'}}},dependencies);
  values.set('nami_progress_scope',A);assert.equal(await auth.currentUser(),null,'a public cache marker alone never authenticates');
  await auth.createSession('test-user');const first=values.get('nami_progress_scope');assert.match(first,/^[\da-f-]{36}$/i);
  assert.notEqual(first,values.get('mova_session'));assert.equal(writes.find(x=>x.key==='mova_session').options.httpOnly,true);
  const marker=writes.find(x=>x.key==='nami_progress_scope');assert.equal(marker.options.httpOnly,false);assert.equal(marker.options.secure,true);
  assert.equal((await auth.currentUser()).sessionExpiresAt,expiresAt.toISOString());
  await auth.createSession('other-user');assert.notEqual(values.get('nami_progress_scope'),first);
  await auth.destroySession();assert.equal(values.has('mova_session'),false);assert.equal(values.get('nami_progress_scope'),'signed-out');
});

test('server scope headers bind accounts without exposing IDs, and GET never overwrites a new session cookie',async()=>{
  let writes=0;
  const helper=load('lib/progress-cache-scope.ts',{process:{env:{NODE_ENV:'production'}}},{'next/headers':{cookies:async()=>({get:()=>({value:A}),set:()=>{writes++;}})}});
  const first=await helper.progressCacheScope('account-a','2099-01-01T00:00:00.000Z');
  const second=await helper.progressCacheScope('account-b','2099-01-01T00:00:00.000Z');
  assert.equal(first.scope,A);assert.notEqual(first.owner,second.owner);assert.match(first.owner,/^[\da-f]{64}$/);
  assert(!JSON.stringify(first).includes('account-a'));assert.equal(writes,0);
});

test('confirmed trip creation/edit/removal invalidate the cache, while denied or unrelated changes do not',async()=>{
  let role='owner',rotations=0;
  const user={id:'owner',email:'owner@example.invalid',sessionExpiresAt:'2099-01-01T00:00:00.000Z'};
  const record={id:'trip',country:'Italia',startDate:new Date('2026-01-01')};
  function api(file,depth){return load(file,{}, {
    'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
    [depth+'lib/auth']:{currentUser:async()=>user},
    [depth+'lib/progress-cache-scope']:{rotateProgressScope:async()=>{rotations++;}},
    [depth+'lib/prisma']:{prisma:{trip:{findUnique:async()=>null,create:async()=>record,update:async()=>record,delete:async()=>record},document:{findMany:async()=>[]}}},
    [depth+'lib/trip-access']:{tripAccess:async()=>({allowed:true,role})},
    [depth+'lib/country-names']:{normalizeTripCountry:value=>value},
    [depth+'lib/trip-people']:{},[depth+'lib/activity-order-storage']:{},[depth+'lib/expense-identities']:{},[depth+'lib/document-storage']:{deleteDocumentFile:async()=>{}},
  });}
  const collection=api('app/api/trips/route.ts','../../../');
  await collection.POST({json:async()=>({id:'trip',country:'Italia',startDate:'2026-01-01',endDate:'2026-01-02'})});assert.equal(rotations,1);
  const detail=api('app/api/trips/[id]/route.ts','../../../../'),params={params:Promise.resolve({id:'trip'})};
  await detail.PATCH({json:async()=>({country:'France'})},params);assert.equal(rotations,2);
  await detail.PATCH({json:async()=>({budget:50})},params);assert.equal(rotations,2,'unrelated expenses do not invalidate countries');
  role='participant';assert.equal((await detail.PATCH({json:async()=>({country:'Japan'})},params)).status,403);assert.equal(rotations,2);
  role='owner';await detail.DELETE({},params);assert.equal(rotations,3);
});

test('browser adapter uses no persistent storage and cross-tab scope checks do not add auth or data fetches',async t=>{
  const messages=[],events=new Map(),channels=[],calls=[];let marker=A;
  const document={visibilityState:'visible',addEventListener:(name,fn)=>events.set(name,fn)};
  Object.defineProperty(document,'cookie',{get:()=>`nami_progress_scope=${marker}`,set:value=>{marker=value.split(';')[0].split('=')[1];}});
  const window={addEventListener:(name,fn)=>events.set(name,fn)};
  for(const key of ['localStorage','sessionStorage','indexedDB'])Object.defineProperty(window,key,{get:()=>{throw Error('persistent storage forbidden');}});
  class Channel{constructor(){channels.push(this);}postMessage(value){messages.push(value);}}
  const adapter=load('lib/progress-memory.ts',{window,document,location:{protocol:'https:'},BroadcastChannel:Channel,fetch:(url,options)=>new Promise(resolve=>calls.push({url,options,resolve}))});
  t.after(()=>adapter.resetProgressMemory());
  adapter.checkProgressSessionAcrossTabs();assert.equal(calls.length,0);assert.deepEqual(messages,['scope-check']);
  const request=adapter.refreshProgressMemory();calls[0].resolve(new Response(JSON.stringify([visit('IT')]),{headers:{'X-Nami-Progress-Scope':A,'X-Nami-Progress-Owner':'a'.repeat(64),'X-Nami-Progress-Expiry':'2099-01-01T00:00:00.000Z'}}));await request;
  assert.equal(adapter.readProgressMemory().length,1);channels[0].onmessage({data:'scope-check'});assert.equal(adapter.readProgressMemory().length,1);
  marker=B;channels[0].onmessage({data:'scope-check'});assert.equal(adapter.readProgressMemory(),null);
  assert.equal(calls.length,1);assert(!messages.some(value=>typeof value!=='string'));
});

module.exports={load,harness,visit,A,B};
