const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), ts = require('typescript');
function load(file, globals = {}, dependencies = {}) {
  const modules = new Map();
  function moduleFor(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    const context = { exports: {}, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Date, ...globals };
    modules.set(file, context.exports);
    context.require = name => name in dependencies ? dependencies[name] : name.startsWith('.') ? moduleFor(path.resolve(path.dirname(file), name + '.ts')) : require(name);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
    return context.exports;
  }
  return moduleFor(file);
}
const photo = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/Aerial-Sal-Reis-Cape-Verde-2012.JPG/1920px-Aerial-Sal-Reis-Cape-Verde-2012.JPG';
const flush = () => new Promise(resolve => setImmediate(resolve));

test('duplicate city lookups share one request; success is reused on Home return without persistent storage', async () => {
  const calls = [];
  const api = load('lib/home-trip-images.ts', { fetch: (url, options) => new Promise(resolve => calls.push({ url, options, resolve })) });
  const a = api.resolveHomePhoto('Capo Verde', 'Sal Rei · Praia'), b = api.resolveHomePhoto('Capo Verde', 'Sal Rei');
  assert.equal(a, b); assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url, 'https://local').searchParams.get('city'), 'Sal Rei');
  calls[0].resolve({ ok: true, json: async () => ({ image: photo }) });
  assert.equal(await a, photo); assert.equal(await b, photo);
  assert.equal(await api.resolveHomePhoto('Capo Verde', 'Sal Rei'), photo); assert.equal(calls.length, 1);
});
test('a fast destination becomes available independently of an unrelated slow lookup', async () => {
  const calls = [];
  const api = load('lib/home-trip-images.ts', { fetch: () => new Promise(resolve => calls.push(resolve)) });
  const slow = api.resolveHomePhoto('Francia', 'Paris'), fast = api.resolveHomePhoto('Capo Verde', 'Sal Rei');
  calls[1]({ ok: true, json: async () => ({ image: photo }) });
  assert.equal(await fast, photo); assert.equal(api.cachedHomePhoto('Capo Verde', 'Sal Rei'), photo);
  assert.equal(api.cachedHomePhoto('Francia', 'Paris'), '');
  calls[0]({ ok: false }); await slow;
});
for (const status of [403, 404, 500]) test(`metadata HTTP ${status} is not cached and a later attempt can recover`, async () => {
  let calls = 0;
  const api = load('lib/home-trip-images.ts', { fetch: async () => ++calls === 1 ? { ok: false, status } : { ok: true, json: async () => ({ image: photo }) } });
  assert.equal(await api.resolveHomePhoto('Capo Verde', 'Sal Rei'), '');
  assert.equal(await api.resolveHomePhoto('Capo Verde', 'Sal Rei'), photo); assert.equal(calls, 2);
});
test('city selection overrides legacy national assets', async () => {
  let requested; const api = load('lib/home-trip-images.ts', { fetch: async url => { requested = new URL(url, 'https://local'); return { ok: true, json: async () => ({ image: photo }) }; } });
  assert.equal(await api.resolveHomePhoto('Italia', 'Roma', true), photo);
  assert.equal(requested.searchParams.get('city'), 'Roma'); assert.equal(requested.searchParams.get('scope'), 'home-v2');
});
test('transport errors, missing pictures and unsafe URL schemes use an empty result rather than a broken URL', async () => {
  for (const result of [null, 'javascript:alert(1)', '//private.example/image']) {
    const api = load('lib/home-trip-images.ts', { fetch: async () => ({ ok: true, json: async () => ({ image: result }) }) });
    assert.equal(await api.resolveHomePhoto('Unknown', 'Specific place'), '');
  }
  const api = load('lib/home-trip-images.ts', { fetch: async () => { throw Error('offline'); } });
  assert.equal(await api.resolveHomePhoto('Unknown', 'Specific place'), '');
});
test('metadata timeout aborts the lookup and releases the pending slot', async () => {
  let timeout, requests = 0;
  const api = load('lib/home-trip-images.ts', { setTimeout: callback => { timeout = callback; return 1; }, clearTimeout() {},
    fetch: (_, options) => { requests++; return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted')))); } });
  const request = api.resolveHomePhoto('Capo Verde', 'Sal Rei'); timeout(); assert.equal(await request, '');
  const second = api.resolveHomePhoto('Capo Verde', 'Sal Rei'); timeout(); await second; assert.equal(requests, 2);
});
test('a synchronous transport exception does not leave a permanently failed in-flight entry', async () => {
  let calls = 0;
  const api = load('lib/home-trip-images.ts', { fetch: () => { if (++calls === 1) throw Error('offline'); return Promise.resolve({ ok: true, json: async () => ({ image: photo }) }); } });
  assert.equal(await api.resolveHomePhoto('Capo Verde', 'Sal Rei'), '');
  assert.equal(await api.resolveHomePhoto('Capo Verde', 'Sal Rei'), photo);
  assert.equal(calls, 2);
});
test('expired URL metadata is refreshed and an explicit recovery may accept a renewed URL', async () => {
  let now = 0, calls = 0;
  const api = load('lib/home-trip-images.ts', { Date: { now: () => now }, fetch: async () => ({ ok: true, json: async () => ({ image: `https://upload.wikimedia.org/test/${++calls}.jpg` }) }) });
  assert.equal(await api.resolveHomePhoto('Capo Verde', 'Sal Rei'), 'https://upload.wikimedia.org/test/1.jpg');
  now = 86400001;
  assert.equal(api.cachedHomePhoto('Capo Verde', 'Sal Rei'), '');
  assert.equal(await api.resolveHomePhoto('Capo Verde', 'Sal Rei'), 'https://upload.wikimedia.org/test/2.jpg');
  assert.equal(await api.resolveHomePhoto('Capo Verde', 'Sal Rei', true), 'https://upload.wikimedia.org/test/3.jpg');
});
test('responsive Wikimedia sources keep the exact photo and use supported standard widths only', () => {
  const api = load('lib/home-trip-images.ts');
  const set = api.homePhotoSrcSet(photo);
  assert(set.includes('/330px-Aerial-Sal-Reis')); assert(set.includes('/500px-Aerial-Sal-Reis'));
  assert(!set.includes('320w')); assert(!set.includes('640w'));
  for (const source of ['/destinations/italy.webp', 'https://private.example.test/photo.jpg', 'https://thumb.wikimedia.org.evil.test/thumb/a/1920px-file.jpg']) {
    assert.equal(api.homePhotoSrcSet(source), undefined);
  }
});

function component({ kind = 'hero', source = photo, resolve = async () => source, carousel = null } = {}) {
  const hooks = [], effects = [], listeners = new Map(), timers = new Map(), intersections = [], calls = [];
  let cursor = 0, tree;
  const react = {
    useRef(initial) { const at = cursor++; return hooks[at] ||= { current: initial }; },
    useState(initial) { const at = cursor++; if (!hooks[at]) hooks[at] = { value: typeof initial === 'function' ? initial() : initial }; return [hooks[at].value, value => { hooks[at].value = typeof value === 'function' ? value(hooks[at].value) : value; }]; },
    useEffect(callback, deps) { const at = cursor++, old = hooks[at]; if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) { hooks[at] = { deps, cleanup: old?.cleanup }; effects.push(() => { hooks[at].cleanup?.(); hooks[at].cleanup = callback(); }); } },
  };
  const window = { setTimeout(callback) { const id = timers.size + 1; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); },
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); }, removeEventListener(name, callback) { listeners.get(name)?.delete(callback); } };
  const observers = [];
  class Observer { constructor(callback, options) { intersections.push(callback); observers.push({ callback, options, targets: [], disconnected: false }); this.record = observers.at(-1); } observe(target) { this.record.targets.push(target); } disconnect() { this.record.disconnected = true; } }
  const api = load('app/components/home-trip-photo.tsx', { window, IntersectionObserver: Observer }, {
    react, './home-trip-photo.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
    '../../lib/home-trip-images': { cachedHomePhoto: () => source, homePhotoKey: (country, city) => JSON.stringify([country, city]),
      homePhotoSrcSet: () => source.startsWith('https://thumb.wikimedia') ? photo.replace('1920px-', '500px-') + ' 500w' : undefined,
      resolveHomePhoto: (...args) => { calls.push(args); return resolve(...args); } },
  });
  const props = { country: 'Capo Verde', city: 'Sal Rei', kind };
  function render(commit = true) { cursor = 0; const child = api.HomeTripPhoto(props); tree = child.type(child.props); tree.props.ref.current = { closest: () => carousel }; if (commit) for (const effect of effects.splice(0)) effect(); return tree; }
  function img() { return [tree.props.children].flat().find(node => node?.type === 'img'); }
  function target(extra = {}) { const node = img(), image = { naturalWidth: 500, currentSrc: source, decode: async () => {}, ...extra }; node.props.ref.current = image; return image; }
  return { render, img, target, calls, props, api, timers, observers,
    state: () => tree.props['data-photo-state'], enter: () => intersections.forEach(callback => callback([{ isIntersecting: true }])),
    online: () => [...listeners.get('online') || []].forEach(callback => callback()),
    unmount: () => hooks.forEach(hook => hook.cleanup?.()),
  };
}
test('only the hero starts immediately at high priority; offscreen cards wait for intersection', async () => {
  const hero = component(); hero.render(); assert.equal(hero.img().props.fetchPriority, 'high'); assert.equal(hero.calls.length, 1); hero.unmount();
  const card = component({ kind: 'completed' }); card.render(); assert.equal(card.img(), undefined); assert.equal(card.calls.length, 0);
  card.enter(); card.render(); assert.equal(card.img().props.fetchPriority, 'auto'); assert.equal(card.calls.length, 1); card.unmount();
});
test('a decoded image replaces its placeholder without changing the fixed photographic container', async () => {
  const h = component(); h.render(); await flush(); h.render(); const image = h.target();
  await h.img().props.onLoad({ currentTarget: image }); await flush(); h.render();
  assert.equal(h.state(), 'ready'); assert.equal(h.img().props.style.opacity, 1); assert.equal(h.img().props.alt, ''); h.unmount();
});
test('a failed responsive rendition falls back once to the exact original; repeated failures terminate', async () => {
  const h = component(); h.render(); const image = h.target({ currentSrc: photo.replace('1920px-', '500px-') });
  h.img().props.onError({ currentTarget: image }); h.render(); assert.equal(h.img().props.srcSet, undefined); assert.equal(h.img().props.src, photo);
  h.img().props.onError({ currentTarget: h.target() }); await flush(); h.render(); assert.equal(h.state(), 'error'); assert.equal(h.calls.length, 2); assert.equal(h.calls[1][3], true); h.unmount();
});
test('decode failure is treated as a photo error, not as a successful permanent placeholder', async () => {
  const h = component({ source: '/local.webp' }); h.render(); await flush(); h.render();
  h.img().props.onLoad({ currentTarget: h.target({ decode: async () => { throw Error('corrupt'); } }) });
  await flush(); h.render(); assert.equal(h.state(), 'error'); h.unmount();
});
test('a stalled download has a bounded fallback and a later valid load can recover', async () => {
  const h = component(); h.render(); await flush(); h.render();
  [...h.timers.values()].forEach(callback => callback()); h.render(); assert.equal(h.state(), 'error');
  h.img().props.onLoad({ currentTarget: h.target() }); await flush(); h.render(); assert.equal(h.state(), 'ready'); h.unmount();
});
test('offline recovery retries once on online and cannot form a retry loop', async () => {
  const h = component({ source: '', resolve: async () => '' }); h.render(); await flush(); h.render(); assert.equal(h.state(), 'error');
  h.online(); h.render(); await flush(); h.render(); assert.equal(h.calls.length, 2); assert.equal(h.calls[1][2], true);
  h.online(); h.render(); assert.equal(h.calls.length, 2); h.unmount();
});
test('a late decode cannot update an unmounted image or a replacement image', async () => {
  let finish; const h = component(); h.render(); await flush(); h.render();
  h.img().props.onLoad({ currentTarget: h.target({ decode: () => new Promise(resolve => { finish = resolve; }) }) });
  h.img().props.ref.current = {}; finish(); await flush(); h.render(); assert.notEqual(h.state(), 'ready'); h.unmount();
});
test('changed destination identity has a different React key; no previous photo is retained by index', () => {
  const h = component();
  assert.notEqual(h.api.HomeTripPhoto(h.props).key, h.api.HomeTripPhoto({ ...h.props, city: 'Paris' }).key);
});

test('a confirmed missing photo is briefly cached to prevent repeated Home lookups', async () => {
  let requests=0,now=100;
  const api=load('lib/home-trip-images.ts',{Date:{now:()=>now},fetch:async()=>{requests++;return{ok:true,json:async()=>({image:null})}}});
  await api.resolveHomePhoto('Italia','Milano');await api.resolveHomePhoto('Italia','Milano');assert.equal(requests,1);
  now+=60001;await api.resolveHomePhoto('Italia','Milano');assert.equal(requests,2);
});
test('case and accent normalization share a single destination cache entry',async()=>{
  let requests=0;const api=load('lib/home-trip-images.ts',{fetch:async()=>{requests++;return{ok:true,json:async()=>({image:photo})}}});
  await api.resolveHomePhoto('Norvegia','Tromsø');await api.resolveHomePhoto(' norvegia ','Tromso');assert.equal(requests,1);
});
test('an image loaded before passive effects is recovered from complete/naturalWidth instead of staying blank',async()=>{
  const h=component();h.render(false);const target=h.target({complete:true});
  await h.img().props.onLoad({currentTarget:target});await flush();
  h.render();await flush();h.render();assert.equal(h.state(),'ready');assert.equal(h.img().props.style.opacity,1);h.unmount();
});
test('a broken original photo makes one local alternative lookup before neutral fallback',async()=>{
  let requests=0;const alternative=photo.replace('Aerial-Sal-Reis','Sal-Rei-waterfront');
  const h=component({resolve:async()=>++requests===1?photo:alternative});h.render();await flush();h.render();
  h.img().props.onError({currentTarget:h.target()});await flush();h.render();
  assert.equal(h.img().props.src,alternative);assert.equal(h.calls[1][3],true);assert.equal(h.calls[1][0],'Capo Verde');assert.equal(h.calls[1][1],'Sal Rei');
  await h.img().props.onLoad({currentTarget:h.target()});await flush();h.render();assert.equal(h.state(),'ready');h.unmount();
});
test('client respects 429 across destinations and forced recovery, then allows an explicit request after cooldown',async()=>{
  let now=100000,requests=0;const api=load('lib/home-trip-images.ts',{Date:{now:()=>now,parse:Date.parse},fetch:async()=>{requests++;return requests===1?{ok:false,status:429,headers:{get:()=> '120'}}:{ok:true,json:async()=>({image:photo})}}});
  assert.equal(await api.resolveHomePhoto('Italia','Milano'),'');assert.equal(requests,1);
  assert.equal(await api.resolveHomePhoto('Italia','Napoli'),'');await api.resolveHomePhoto('Italia','Milano',true,true);assert.equal(requests,1);
  now+=120001;assert.equal(await api.resolveHomePhoto('Italia','Milano'),photo);assert.equal(requests,2);
});
test('rate limiting preserves a previously valid cached image',async()=>{
  let requests=0;const api=load('lib/home-trip-images.ts',{fetch:async()=>++requests===1?{ok:true,json:async()=>({image:photo})}:{ok:false,status:429,headers:{get:()=> '600'}}});
  await api.resolveHomePhoto('Italia','Milano');assert.equal(await api.resolveHomePhoto('Italia','Milano',true),photo);
  assert.equal(await api.resolveHomePhoto('Italia','Milano'),photo);assert.equal(requests,2);
});


test('completed carousel preloads beyond its overflow edge only when the carousel approaches the viewport', async () => {
  const carousel = {};
  const h = component({ kind: 'completed', carousel }); h.render();
  assert.equal(h.calls.length, 0);
  const viewport = h.observers.find(observer => !observer.options.root);
  const horizontal = h.observers.find(observer => observer.options.root === carousel);
  assert(horizontal, 'an explicit carousel root must expand the horizontal preload area past overflow');
  assert.equal(horizontal.options.rootMargin, '0px 160px');
  horizontal.callback([{ isIntersecting: true }]); h.render();
  assert.equal(h.calls.length, 0, 'do not load a carousel still below the viewport');
  viewport.callback([{ isIntersecting: true }]); h.render(); await flush(); h.render();
  assert.equal(h.calls.length, 1); assert(h.img());
  assert(h.observers.every(observer => observer.disconnected)); h.unmount();
});

test('a visible carousel alone does not load distant cards; rapid entry/exit never cancels an activated photo', async () => {
  let finish;
  const carousel = {}, h = component({ kind: 'completed', carousel, source: '', resolve: () => new Promise(resolve => finish = resolve) });
  h.render(); const viewport=h.observers.find(o=>!o.options.root), horizontal=h.observers.find(o=>o.options.root===carousel);
  viewport.callback([{isIntersecting:true}]); h.render(); assert.equal(h.calls.length,0);
  horizontal.callback([{isIntersecting:true}]); h.render(); assert.equal(h.calls.length,1);
  horizontal.callback([{isIntersecting:false}]); h.render(); finish(photo); await flush(); h.render();
  assert(h.img()); await h.img().props.onLoad({currentTarget:h.target()}); await flush();h.render();
  assert.equal(h.state(),'ready'); assert.equal(h.img().props.style.opacity,1);assert.equal(h.calls.length,1);h.unmount();
});

test('completed cards expose distinct neutral loading and unavailable feedback without changing their image box', async () => {
  const h=component({kind:'completed',source:'',resolve:async()=>''});h.render();
  const text=tree=>JSON.stringify(tree.props.children);
  assert.match(text(h.render()),/Caricamento foto/);
  h.enter();h.render();await flush();h.render();
  assert.equal(h.state(),'error');assert.match(text(h.render()),/Foto non disponibile/);assert.equal(h.img(),undefined);h.unmount();
});


test('a completed cached image that already failed before effects runs recovery immediately, not a 20 second blank wait',async()=>{
  const h=component({kind:'completed',resolve:async()=>photo});h.render();h.enter();h.render(false);
  h.target({complete:true,naturalWidth:0});h.render();await flush();h.render();
  assert.equal(h.state(),'error');assert.equal(h.calls.length,2,'initial lookup plus one same-place alternative');h.unmount();
});

for(const count of [1,8])test('first Home opening with '+count+' completed cards loads nearby cards once and retains photos on return to the first',async()=>{
 const carousel={},cards=Array.from({length:count},()=>component({kind:'completed',carousel}));
 for(const h of cards){h.render();h.observers.find(o=>!o.options.root).callback([{isIntersecting:true}]);h.render();}
 for(let index=0;index<cards.length;index++){
  const h=cards[index];h.observers.find(o=>o.options.root===carousel).callback([{isIntersecting:true}]);h.render();await flush();h.render();
  await h.img().props.onLoad({currentTarget:h.target()});await flush();h.render();assert.equal(h.state(),'ready');
 }
 for(const h of cards){h.render();assert.equal(h.state(),'ready');assert.equal(h.calls.length,1);assert.equal(h.img().props.style.opacity,1);h.unmount();}
});

for(const scenario of ['slow','404','decode'])test('completed photo '+scenario+' terminates with explicit fallback and can never stay blank',async()=>{
 const h=component({kind:'completed',source:scenario==='decode'?'/corrupt.webp':photo});h.render();h.enter();h.render();await flush();h.render();
 if(scenario==='slow'){for(const timeout of [...h.timers.values()])timeout();}
 else if(scenario==='decode'){await h.img().props.onLoad({currentTarget:h.target({decode:async()=>{throw Error('decode failed')}})});await flush();}
 else{h.img().props.onError({currentTarget:h.target()});await flush();h.render();h.img().props.onError({currentTarget:h.target()});await flush();}
 h.render();assert.equal(h.state(),'error');assert.match(JSON.stringify(h.render().props.children),/Foto non disponibile/);h.unmount();
});

test('returning to Home and a fresh mount after refresh handle already decoded completed photos',async()=>{
 for(const kindOfReturn of ['tab','refresh']){
  const h=component({kind:'completed'});h.render();h.enter();h.render(false);h.target({complete:true});h.render();await flush();h.render();
  assert.equal(h.state(),'ready',kindOfReturn);assert.equal(h.calls.length,1);assert.equal(h.img().props.style.opacity,1);h.unmount();
 }
});


test('trip cover shares the priority photo lifecycle instead of waiting for intersection',async()=>{
 const h=component({kind:'trip'});h.render();assert(h.img());assert.equal(h.img().props.fetchPriority,'high');assert.equal(h.calls.length,1);
 await h.img().props.onLoad({currentTarget:h.target()});await flush();h.render();assert.equal(h.state(),'ready');h.unmount();
});

test('trip cover uses responsive renditions of the same canonical cached photo',async()=>{
 const h=component({kind:'trip'});h.render();assert.equal(h.img().props.src,photo);assert.match(h.img().props.sizes,/100vw/);
 assert(h.img().props.srcSet.includes('Aerial-Sal-Reis'));h.unmount();
});

test('trip cover has the same explicit neutral fallback for missing photographs',async()=>{
 const h=component({kind:'trip',source:'',resolve:async()=>''});h.render();await flush();h.render();
 assert.equal(h.state(),'error');assert.match(JSON.stringify(h.render().props.children),/Foto non disponibile/);h.unmount();
});
