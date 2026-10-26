const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {load}=require('./home-photo-harness.cjs');
const point={place:'Duomo di Milano',placeAddress:'Piazza del Duomo, Milano',placeId:'duomo',photoName:'places/duomo/photos/current',photoAttribution:'Author'};
const photo='https://lh3.googleusercontent.com/duomo.jpg';
const globals={crypto:{randomUUID:()=> 'test-session'},Response,AbortSignal};
const ok=value=>({ok:true,status:200,json:async()=>value});
const service=extra=>load('lib/itinerary-place-photos.ts',{...globals,...extra});
const flush=()=>new Promise(r=>setImmediate(r));
test('selected point requests only its 240px media and preserves attribution; day return is a cache hit',async()=>{
 const urls=[],api=service({fetch:async url=>{urls.push(url);return ok({photoUri:photo});}});api.setPlacePhotoAccount('alice');
 const a=api.resolvePlacePhoto(point,'Italia','IT'),b=api.resolvePlacePhoto(point,'Italia','IT');assert.equal(a,b);assert.equal((await a).url,photo);assert.equal((await b).attribution,'Author');
 assert.equal((await api.resolvePlacePhoto(point,'Italia','IT')).url,photo);assert.equal(urls.length,1);assert.match(urls[0],/format=json/);assert.match(urls[0],/width=240/);
});
test('failed photo on one card never blocks another visible place',async()=>{
 const api=service({fetch:async url=>url.includes('bad')?{ok:false,status:404}:ok({photoUri:photo})});
 const bad=api.resolvePlacePhoto({...point,placeId:'bad',photoName:'places/bad/photos/x'},'Italia','IT');const good=api.resolvePlacePhoto(point,'Italia','IT');assert.equal(await bad,null);assert.equal((await good).url,photo);
});
test('two simultaneous visible place lookups at most, even when other cards enter rapidly',async()=>{
 let active=0,peak=0;const releases=[];const api=service({fetch:()=>new Promise(resolve=>{active++;peak=Math.max(peak,active);releases.push(()=>{active--;resolve(ok({photoUri:photo}));});})});
 let done=false;const pending=Promise.all(Array.from({length:6},(_,i)=>api.resolvePlacePhoto({...point,placeId:'p'+i,photoName:'places/p'+i+'/photos/x'},'Italia','IT'))).then(()=>done=true);
 while(!done){await flush();for(const finish of releases.splice(0))finish();}await pending;assert.equal(peak,2);
});
test('unknown legacy point requires exactly one name/address match; ambiguous names cannot select the first result',async()=>{
 for(const list of [[{provider:'google',placeId:'wrong',name:point.place,address:'Another city'}],[{provider:'google',placeId:'one',name:point.place,address:point.placeAddress},{provider:'google',placeId:'two',name:point.place,address:point.placeAddress}]]){
 let calls=0;const api=service({fetch:async()=>{calls++;return ok(list);}});assert.equal(await api.resolvePlacePhoto({place:point.place,placeAddress:point.placeAddress},'Italia','IT'),null);assert.equal(calls,1);
 }
});
test('specific legacy query resolves matching details and photo, never a city panorama',async()=>{
 const urls=[];const api=service({fetch:async url=>{urls.push(url);if(url.includes('?q='))return ok([{provider:'google',placeId:'duomo',name:point.place,address:point.placeAddress}]);if(url.includes('?placeId='))return ok({...point,name:point.place,address:point.placeAddress});return ok({photoUri:photo});}});
 assert.equal((await api.resolvePlacePhoto({place:point.place,placeAddress:point.placeAddress},'Italia','IT')).url,photo);assert.equal(urls.length,3);assert(!urls.some(url=>url.includes('city-image')));
});
test('point with no reference or reliable address stays neutral without guessing a city photo',async()=>{
 let calls=0;const api=service({fetch:async()=>{calls++;throw Error();}});assert.equal(await api.resolvePlacePhoto({place:'Museo'},'Italia','IT'),null);assert.equal(calls,0);
});
test('legacy photo reference from a different location is rejected using verified metadata',async()=>{
 const api=service({fetch:async()=>ok({placeId:'duomo',name:'Another place',address:'Another city',photoName:point.photoName})});assert.equal(await api.resolvePlacePhoto({...point,placeId:undefined},'Italia','IT'),null);
});
for(const value of ['https://example.test/Flag_of_Italy.jpg','https://example.test/coat_of_arms.png','https://example.test/map.svg','javascript:alert(1)'])test('symbolic or unsafe source stays neutral: '+value,async()=>{
 const api=service({fetch:async()=>ok({photoUri:value})});assert.equal(await api.resolvePlacePhoto(point,'Italia','IT'),null);
});
test('429 respects Retry-After across points and forced recovery without automatic retries',async()=>{
 let now=100000,calls=0;const api=service({Date:{now:()=>now,parse:Date.parse},fetch:async()=>{calls++;return{ok:false,status:429,headers:{get:()=> '120'}};}});
 assert.equal(await api.resolvePlacePhoto(point,'Italia','IT'),null);assert.equal(await api.resolvePlacePhoto({...point,placeId:'other'},'Italia','IT',true),null);assert.equal(calls,1);now+=120001;await api.resolvePlacePhoto(point,'Italia','IT',true);assert.equal(calls,2);
});
for(const status of [403,404,500])test('HTTP '+status+' is negatively reused briefly and explicit recovery refreshes the place reference',async()=>{
 let calls=0;const api=service({fetch:async url=>{calls++;if(calls===1)return{ok:false,status};return url.includes('?placeId=')?ok({...point,name:point.place,address:point.placeAddress}):ok({photoUri:photo});}});
 assert.equal(await api.resolvePlacePhoto(point,'Italia','IT'),null);assert.equal(await api.resolvePlacePhoto(point,'Italia','IT'),null);assert.equal(calls,1);assert.equal((await api.resolvePlacePhoto(point,'Italia','IT',true)).url,photo);assert.equal(calls,3);
});

test('Oslo-Gardermoen legacy activity validates canonical details rather than autocomplete secondary text',async()=>{
 // Synthetic provider responses: not an observation of the user's activity or live Google results.
 const airport={place:'Aeroporto di Oslo-Gardermoen',placeAddress:'Edvard Munchs veg, 2061 Gardermoen, Norvegia',latitude:60.1939,longitude:11.1004};
 const urls=[],api=service({fetch:async url=>{urls.push(url);
   if(url.includes('?q='))return ok([{provider:'google',placeId:'airport-fixture',name:airport.place,address:'Gardermoen, Norvegia'}]);
   if(url.includes('?placeId='))return ok({placeId:'airport-fixture',name:airport.place,address:airport.placeAddress,latitude:airport.latitude,longitude:airport.longitude,photoName:'places/airport-fixture/photos/fresh'});
   return ok({photoUri:'https://lh3.googleusercontent.com/airport-fixture.jpg'});
 }});
 assert.equal((await api.resolvePlacePhoto(airport,'Norvegia','NO'))?.url,'https://lh3.googleusercontent.com/airport-fixture.jpg');
 assert.equal(urls.length,3);assert(!urls.some(url=>url.includes('city-image')));
});

test('airport translated display name is irrelevant when the selected exact place ID exists',async()=>{
 const urls=[],api=service({fetch:async url=>{urls.push(url);return url.includes('?placeId=')?ok({placeId:'airport-fixture',name:'Oslo Airport',photoName:'places/airport-fixture/photos/fresh'}):ok({photoUri:photo});}});
 assert.equal((await api.resolvePlacePhoto({place:'Aeroporto di Oslo-Gardermoen',placeAddress:'Gardermoen, Norvegia',placeId:'airport-fixture'},'Norvegia','NO')).url,photo);
 assert.equal(urls.length,2);assert(!urls.some(url=>url.includes('?q=')));
});

test('same-name airport suggestion with short address must still pass canonical details and coordinates',async()=>{
 let calls=0;const airport={place:'Aeroporto di Oslo-Gardermoen',placeAddress:'Gardermoen, Norvegia',latitude:60.1939,longitude:11.1004};
 const api=service({fetch:async url=>{calls++;return url.includes('?q=')?ok([{provider:'google',placeId:'wrong-airport',name:airport.place,address:'Norvegia'}]):ok({placeId:'wrong-airport',name:airport.place,address:'Different airport',latitude:59,longitude:10,photoName:'places/wrong-airport/photos/x'});}});
 assert.equal(await api.resolvePlacePhoto(airport,'Norvegia','NO'),null);assert.equal(calls,2);
});

test('multiple same-name airport suggestions remain ambiguous even with stored coordinates',async()=>{
 let calls=0;const airport={place:'Aeroporto di Oslo-Gardermoen',placeAddress:'Gardermoen, Norvegia',latitude:60.1939,longitude:11.1004};
 const api=service({fetch:async()=>{calls++;return ok(['a','b'].map(placeId=>({provider:'google',placeId,name:airport.place,address:'Norvegia'})));}});
 assert.equal(await api.resolvePlacePhoto(airport,'Norvegia','NO'),null);assert.equal(calls,1);
});

test('airport with no provider candidates stays neutral and reuses the failed cache until manual retry',async()=>{
 let calls=0;const airport={place:'Aeroporto di Oslo-Gardermoen',placeAddress:'Gardermoen, Norvegia'};
 const api=service({fetch:async()=>{calls++;return ok([]);}});
 assert.equal(await api.resolvePlacePhoto(airport,'Norvegia','NO'),null);
 assert.equal(await api.resolvePlacePhoto(airport,'Norvegia','NO'),null);assert.equal(calls,1);
 assert.equal(await api.resolvePlacePhoto(airport,'Norvegia','NO',true),null);assert.equal(calls,2);
});

test('exact airport without provider photo never requests a media URL or substitutes a city photograph',async()=>{
 const urls=[],api=service({fetch:async url=>{urls.push(url);return ok({placeId:'airport-fixture'});}});
 assert.equal(await api.resolvePlacePhoto({place:'Aeroporto di Oslo-Gardermoen',placeId:'airport-fixture'},'Norvegia','NO'),null);
 assert.equal(urls.length,1);assert.match(urls[0],/detail=photo/);
});
test('timeout releases pending lookups without blocking the itinerary',async()=>{
 let timeout;const api=service({setTimeout:fn=>{timeout=fn;return 1},clearTimeout(){},fetch:(_,o)=>new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(Error('aborted'))))});const pending=api.resolvePlacePhoto(point,'Italia','IT');timeout();assert.equal(await pending,null);
});
test('late account response cannot populate the next account display state',async()=>{
 let release;const api=service({fetch:()=>new Promise(r=>release=r)});api.setPlacePhotoAccount('alice');const pending=api.resolvePlacePhoto(point,'Italia','IT');api.setPlacePhotoAccount('bob');release(ok({photoUri:photo}));assert.equal(await pending,null);assert.equal(api.cachedPlacePhoto(point,'Italia'),undefined);
});
test('decode or download failure invalidates only that URI and allows controlled recovery',async()=>{
 const api=service({fetch:async()=>ok({photoUri:photo})});await api.resolvePlacePhoto(point,'Italia','IT');api.rejectPlacePhoto(point,'Italia','another');assert(api.cachedPlacePhoto(point,'Italia'));api.rejectPlacePhoto(point,'Italia',photo);assert.equal(api.cachedPlacePhoto(point,'Italia'),null);
});
function responseApi(){return{json:(body,options={})=>({body,status:options.status||200,headers:options.headers||{}}),redirect:(url,options={})=>({url,status:options.status||307,headers:options.headers||{}})}}
test('authenticated photo API keeps default redirect and exposes bounded-size JSON with no-store',async()=>{
 const urls=[];const gate=load('lib/google-place-requests.ts',{...globals,fetch:async url=>{urls.push(url);return ok({photoUri:photo})}});
 const api=load('app/api/places/photo/route.ts',{...globals,process:{env:{GOOGLE_MAPS_API_KEY:'synthetic-key'}}},{'next/server':{NextResponse:responseApi()},'../../../../lib/auth':{currentUser:async()=>({id:'test'})},'../../../../lib/google-place-requests':gate});
 const json=await api.GET(new Request('http://local/api/places/photo?name=places/duomo/photos/current&format=json'));assert.equal(json.status,200);assert.equal(json.body.photoUri,photo);assert.match(json.headers['Cache-Control'],/no-store/);assert.match(urls[0],/maxWidthPx=240/);
 const redirect=await api.GET(new Request('http://local/api/places/photo?name=places/duomo/photos/current'));assert.equal(redirect.status,302);assert.equal(redirect.url,photo);assert.match(urls[1],/maxWidthPx=360/);
});
test('Google gate bounds three upstream requests and propagates cooldown to the authenticated API',async()=>{
 let calls=0;const gate=load('lib/google-place-requests.ts',{...globals,fetch:async()=>{calls++;return{ok:false,status:429,headers:{get:()=> '120'}}}});
 const api=load('app/api/places/photo/route.ts',{...globals,process:{env:{GOOGLE_MAPS_API_KEY:'synthetic-key'}}},{'next/server':{NextResponse:responseApi()},'../../../../lib/auth':{currentUser:async()=>({id:'test'})},'../../../../lib/google-place-requests':gate});
 for(let i=0;i<2;i++){const result=await api.GET(new Request('http://local/api/places/photo?name=places/duomo/photos/current&format=json'));assert.equal(result.status,429);assert.equal(result.headers['Retry-After'],'120');}assert.equal(calls,1);
});
test('unauthenticated or invalid photo request cannot contact Google',async()=>{
 let calls=0;const deps={'next/server':{NextResponse:responseApi()},'../../../../lib/auth':{currentUser:async()=>null},'../../../../lib/google-place-requests':{googlePlaceRequest:()=>{calls++},GooglePlaceLimitError:class extends Error{}}};
 const api=load('app/api/places/photo/route.ts',{...globals,process:{env:{GOOGLE_MAPS_API_KEY:'synthetic-key'}}},deps);assert.equal((await api.GET(new Request('http://local/api/places/photo?name=places/duomo/photos/current'))).status,401);deps['../../../../lib/auth'].currentUser=async()=>({id:'test'});assert.equal((await api.GET(new Request('http://local/api/places/photo?name=bad'))).status,404);assert.equal(calls,0);
});
test('activity save awaits persistence only, not the slow photo job',async()=>{
 let releasePhoto,releaseSave,closed=false;const photos=service({fetch:()=>new Promise(r=>releasePhoto=r)});const pendingPhoto=photos.resolvePlacePhoto(point,'Italia','IT');
 const page=fs.readFileSync('app/trips/[id]/page.tsx','utf8');const start=page.indexOf('  async function saveActivity()');const end=page.indexOf('\n  function dropActivity',start);const fn=ts.transpileModule(page.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 const ctx={savingActivity:{current:false},placeSelecting:false,draft:{...point,title:point.place,day:1,time:''},prepareActivityDraft:x=>x,editingId:null,activities:[],Date,setActivityError(){},persist:()=>new Promise(r=>releaseSave=r),setShowEditor:()=>closed=true};vm.createContext(ctx);vm.runInContext(fn,ctx);const save=ctx.saveActivity();assert.equal(closed,false);releaseSave(true);await save;assert.equal(closed,true);releasePhoto(ok({photoUri:photo}));await pendingPhoto;
});

test('Google upstream gate never exceeds three concurrent requests',async()=>{
 let active=0,peak=0;const releases=[];const gate=load('lib/google-place-requests.ts',globals);
 const jobs=Array.from({length:7},(_,i)=>gate.googlePlaceRequest('https://places.googleapis.com/'+i,{},()=>new Promise(resolve=>{active++;peak=Math.max(peak,active);releases.push(()=>{active--;resolve(ok({}));});})));
 let done=false;const all=Promise.all(jobs).then(()=>done=true);while(!done){await flush();for(const finish of releases.splice(0))finish();}await all;assert.equal(peak,3);
});
test('Google upstream timeout covers the response body and releases the slot',async()=>{
 let timeout;const gate=load('lib/google-place-requests.ts',{...globals,setTimeout:fn=>{timeout=fn;return 1},clearTimeout(){}});
 const job=gate.googlePlaceRequest('https://places.googleapis.com/place',{},async(_,o)=>({status:200,arrayBuffer:()=>new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(Error('aborted'))))}));
 await flush();timeout();await assert.rejects(job,/aborted/);
 assert((await gate.googlePlaceRequest('https://places.googleapis.com/another',{},async()=>ok({}))).ok);
});
function component({target=point,resolve=async()=>({url:photo}),active=true,wait=()=>0}={}){
 const hooks=[],effects=[],timers=new Map(),observers=[],calls=[];let cursor=0,tree,closed=false,lateWrites=0;
 const react={useRef(initial){const at=cursor++;return hooks[at]||=( {current:initial});},useState(initial){const at=cursor++;if(!hooks[at])hooks[at]={value:typeof initial==='function'?initial():initial};return[hooks[at].value,v=>{if(closed)lateWrites++;hooks[at].value=typeof v==='function'?v(hooks[at].value):v;}];},useEffect(fn,deps){const at=cursor++,old=hooks[at];if(!old||deps.some((v,i)=>v!==old.deps[i])){hooks[at]={deps,cleanup:old?.cleanup};effects.push(()=>{hooks[at].cleanup?.();hooks[at].cleanup=fn();});}}};
 class Observer{constructor(callback){observers.push(callback)}observe(){}disconnect(){}}
 const window={setTimeout(fn){const n=timers.size+1;timers.set(n,fn);return n},clearTimeout(n){timers.delete(n)}};
 const deps={react,'./itinerary-place-photo.module.css':{__esModule:true,default:new Proxy({},{get:(_,k)=>k})},'../../lib/itinerary-place-photos':{cachedPlacePhoto:()=>undefined,placePhotoRetryWait:wait,setPlacePhotoAccount(){},rejectPlacePhoto(){},placePhotoKey:t=>JSON.stringify([t.placeId,t.place,t.placeAddress]),resolvePlacePhoto:(...args)=>{calls.push(args);return resolve(...args);}}};
 const ctx={exports:{},require:n=>n in deps?deps[n]:require(n),IntersectionObserver:Observer,window};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/components/itinerary-place-photo.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,ctx);
 const props={target,country:'Italia',countryCode:'IT',userId:'alice',active};
 const render=()=>{cursor=0;const child=ctx.exports.ItineraryPlacePhoto(props);tree=child.type(child.props);tree.props.ref.current={};for(const effect of effects.splice(0))effect();return tree;};
 const img=()=>[tree.props.children].flat().find(n=>n?.type==='img');
 return{render,img,props,calls,timers,enter:()=>observers.forEach(fn=>fn([{isIntersecting:true}])),state:()=>tree.props['data-place-photo-state'],image(extra={}){const value={complete:true,naturalWidth:240,decode:async()=>{},...extra};img().props.ref.current=value;return value;},unmount(){closed=true;for(const h of hooks)h.cleanup?.();if(img())img().props.ref.current=null;},late:()=>lateWrites,api:ctx.exports};
}
test('offscreen and inactive cards do not query photos; visible cards keep the square placeholder while loading',async()=>{
 const h=component();h.render();assert.equal(h.calls.length,0);assert.match(h.render().props.className,/activity-place-photo/);h.enter();h.render();assert.equal(h.calls.length,1);assert.equal(h.state(),'loading');await flush();h.render();assert(h.img());h.unmount();
 const hidden=component({active:false});hidden.render();hidden.enter();hidden.render();assert.equal(hidden.calls.length,0);hidden.unmount();
});
test('changing day during lookup cannot update an unmounted or unrelated card',async()=>{
 let release;const old=component({resolve:()=>new Promise(r=>release=r)});old.render();old.enter();old.render();old.unmount();
 const current=component({target:{...point,placeId:'another',place:'Another point'}});current.render();current.enter();current.render();release({url:photo});await flush();current.render();assert.equal(old.late(),0);assert(current.img());current.unmount();
});
test('native load/decode makes the image visible and decoding errors show neutral recovery',async()=>{
 for(const fails of [false,true]){const h=component();h.render();h.enter();h.render();await flush();h.render();const image=h.image({decode:async()=>{if(fails)throw Error('decode')}});await h.img().props.onLoad({currentTarget:image});await flush();h.render();assert.equal(h.state(),fails?'error':'ready');h.unmount();}
});
test('photo deadline cannot leave an infinite spinner',async()=>{
 const h=component({resolve:()=>new Promise(()=>{})});h.render();h.enter();h.render();for(const timeout of [...h.timers.values()])timeout();h.render();assert.equal(h.state(),'error');h.unmount();
});
test('same place keeps identity across days; changed location cannot reuse old image state',()=>{
 const a=component(),b=component({target:{...point,placeId:'other',place:'Other'}});assert.notEqual(a.api.ItineraryPlacePhoto(a.props).key,b.api.ItineraryPlacePhoto(b.props).key);assert.equal(a.api.ItineraryPlacePhoto(a.props).key,a.api.ItineraryPlacePhoto({...a.props,target:{...point,day:9}}).key);
});


test('Retry-After disables manual recovery without consuming it or making automatic requests',async()=>{
 let wait=120000;const h=component({resolve:async()=>null,wait:()=>wait});const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
 h.render();h.enter();h.render();await flush();h.render();let button=nodes(h.render()).find(n=>n.type==='button');assert.equal(button.props.disabled,true);button.props.onClick();h.render();assert.equal(h.calls.length,1);
 wait=0;for(const timeout of [...h.timers.values()])timeout();h.render();button=nodes(h.render()).find(n=>n.type==='button');assert.equal(button.props.disabled,false);assert.equal(h.calls.length,1);button.props.onClick();h.render();await flush();h.render();assert.equal(h.calls.length,2);h.unmount();
});

for(const [id,name,address]of [['duomo','Duomo di Milano','Piazza del Duomo, Milano'],['colosseo','Colosseo','Piazza del Colosseo, Roma'],['louvre','Museo del Louvre','Rue de Rivoli, Paris'],['mbs','Marina Bay Sands','Bayfront Avenue, Singapore'],['tromso-port','Porto di Tromsø','Tromsø, Norvegia']])test('specific point '+name+' uses its exact resource, never a city lookup',async()=>{
 const urls=[],expected='https://lh3.googleusercontent.com/'+id+'.jpg';const api=service({fetch:async url=>{urls.push(new URL(url,'http://local'));return ok({photoUri:expected});}});
 const value=await api.resolvePlacePhoto({placeId:id,place:name,placeAddress:address,photoName:'places/'+id+'/photos/exact'},'Test','');assert.equal(value.url,expected);assert.equal(urls.length,1);assert.equal(urls[0].searchParams.get('name'),'places/'+id+'/photos/exact');assert.equal(urls[0].pathname,'/api/places/photo');
});
test('checkbox edits and returning from another pane do not re-resolve an already decoded photo',async()=>{
 const h=component();h.render();h.enter();h.render();await flush();h.render();await h.img().props.onLoad({currentTarget:h.image()});await flush();h.render();assert.equal(h.state(),'ready');
 h.props.target={...point,done:true};h.render();assert.equal(h.calls.length,1);h.props.active=false;h.render();h.props.active=true;h.render();assert.equal(h.calls.length,1);assert.equal(h.state(),'ready');h.unmount();
});

test('location selection excludes photos while photo enrichment requests only id and photos',async()=>{
 const masks=[];const gate=load('lib/google-place-requests.ts',{...globals,fetch:async(_,options)=>{masks.push(options.headers['X-Goog-FieldMask']);return ok({id:'duomo',displayName:{text:point.place},formattedAddress:point.placeAddress,location:{latitude:45,longitude:9},photos:[{name:point.photoName,authorAttributions:[{displayName:'Author'}]}]});}});
 const api=load('app/api/places/route.ts',{...globals,process:{env:{GOOGLE_MAPS_API_KEY:'synthetic-key'}}},{'next/server':{NextResponse:responseApi()},'../../../lib/auth':{currentUser:async()=>({id:'test'})},'../../../lib/google-place-requests':gate});
 const selected=await api.GET(new Request('http://local/api/places?placeId=duomo&detail=location'));assert.equal(selected.body.placeId,'duomo');assert.equal(selected.body.latitude,45);assert.equal(selected.body.photoName,undefined);assert(!masks[0].includes('photos'));
 const enriched=await api.GET(new Request('http://local/api/places?placeId=duomo&detail=photo'));assert.equal(enriched.body.photoName,point.photoName);assert.equal(masks[1],'id,photos');
});
test('newly selected point defers photo details until its visible card, with no autocomplete search',async()=>{
 const urls=[];const api=service({fetch:async url=>{urls.push(new URL(url,'http://local'));return url.includes('/api/places?')?ok({placeId:'duomo',photoName:point.photoName}):ok({photoUri:photo});}});
 assert.equal((await api.resolvePlacePhoto({...point,photoName:undefined},'Italia','IT')).url,photo);assert.equal(urls.length,2);assert.equal(urls[0].searchParams.get('detail'),'photo');assert.equal(urls[0].searchParams.get('placeId'),'duomo');assert(!urls.some(url=>url.searchParams.has('q')));
});
