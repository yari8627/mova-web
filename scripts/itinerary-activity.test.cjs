const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,deps={},extras={}) { const context={exports:{},require:n=>deps[n],AbortController,URLSearchParams,...extras}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,context);return context.exports; }
const order=load('lib/activity-order.ts');
const helper=load('lib/itinerary-activity.ts',{'./activity-order':order});
const place={name:'Nuovo museo',address:'Via nuova',latitude:41,longitude:12};
test('blank or cleared title uses the current place and validates whitespace',()=>{
 assert.equal(helper.prepareActivityDraft({title:' ',place:' Museo '}).title,'Museo');
 assert.equal(helper.applyActivityPlace({title:'',place:''},place).title,'Nuovo museo');
 assert.throws(()=>helper.prepareActivityDraft({title:'',place:' '}),/luogo/);
});
test('valid new selection always replaces automatic, custom and legacy titles',()=>{
 for(const titleSource of ['place','custom',undefined])assert.equal(helper.applyActivityPlace({title:'Vecchio museo',titleSource,place:'Vecchio museo'},place).title,'Nuovo museo');
 assert.equal(helper.prepareActivityDraft({title:'',titleSource:'custom',place:place.name}).titleSource,'place');
});
test('typing without selection and editing other fields preserve the existing title',()=>{
 for(const titleSource of ['place','custom',undefined])assert.equal(helper.editActivityPlace({title:'Titolo precedente',titleSource,place:'Old'},'New query').title,'Titolo precedente');
 assert.equal(helper.prepareActivityDraft({title:'Personalizzato',place:'Luogo',time:'18:00'}).title,'Personalizzato');
});
test('changing a place clears every previous coordinate and photo reference',()=>{
 const old={title:'Visita',titleSource:'custom',place:'Old',latitude:99,longitude:99,photoName:'old',photoUrl:'old',photoAttribution:'old',photoAttributionUri:'old',placeAddress:'old'};
 const next=helper.applyActivityPlace(old,place);
 assert.equal(next.title,'Nuovo museo');assert.equal(next.placeAddress,'Via nuova');assert.equal(next.latitude,41);
 for(const key of ['photoName','photoUrl','photoAttribution','photoAttributionUri'])assert.equal(next[key],undefined);
 const typed=helper.editActivityPlace(old,'Other');for(const key of ['latitude','longitude','photoName','photoUrl','photoAttribution','photoAttributionUri','placeAddress'])assert.equal(typed[key],undefined);
});
test('local provenance survives a matching server snapshot but never overwrites a remote edit',()=>{
 const cached={id:'1',title:'A',titleSource:'place',place:'A',photoName:'p'};
 assert.equal(helper.restoreActivityMetadata({id:'1',title:'A',place:'A'},cached).titleSource,'place');
 assert.equal(helper.restoreActivityMetadata({id:'1',title:'Custom',place:'A'},cached).titleSource,undefined);
 assert.equal(helper.restoreActivityMetadata({id:'1',title:'A',place:'B'},cached).photoName,undefined);
});
const activity=(id,sortOrder,done=false)=>({id,sortOrder,day:1,done,place:id});
test('Maps excludes completed stops, keeps manual order and includes reopened stops',()=>{
 const items=[activity('third',2),activity('first',0),activity('second',1,true)];
 let url=new URL(helper.activityRoute(items).url);assert.equal(url.searchParams.get('origin'),'first');assert.equal(url.searchParams.get('destination'),'third');assert.equal(url.searchParams.get('waypoints'),null);
 items[2].done=false;url=new URL(helper.activityRoute(items).url);assert.equal(url.searchParams.get('waypoints'),'second');assert.equal(items.length,3);
});
test('Maps handles completed days, a single stop and invalid coordinates safely',()=>{
 assert.equal(helper.activityRoute([activity('a',0,true)]).message,'Hai completato tutte le tappe di oggi!');
 const item={...activity('a',0),latitude:NaN,longitude:12,placeAddress:'Via A'};
 assert.equal(new URL(helper.activityRoute([item]).url).searchParams.get('query'),'a, Via A');
 assert.equal(new URL(helper.activityRoute([{...item,latitude:0,longitude:0}]).url).searchParams.get('query'),'0,0');
 assert.ok(helper.activityRoute([{...item,place:'',placeAddress:''}]).message);
});
test('obsolete searches and selections cannot apply after replacement or close',()=>{
 const gate=helper.latestActivityRequest(),old=gate.begin(),newer=gate.begin();assert.equal(old.signal.aborted,true);assert.equal(old.isCurrent(),false);assert.equal(newer.isCurrent(),true);gate.cancel();assert.equal(newer.isCurrent(),false);
});
test('known-trip saves need exactly one POST, invalidate only after success and keep other callers compatible',async()=>{
 const calls=[],invalidations=[];let ok=true;
 const sync=load('lib/trip-sync.ts',{'./trip-client-cache':{removeTripSnapshot:id=>invalidations.push(id)}},{window:{localStorage:{getItem:()=>null}},fetch:async(url,options)=>{calls.push([url,options?.method]);return{ok,json:async()=>({id:'trip',startDate:'2026-10-12',endDate:'2026-10-13'})}}});
 await sync.syncTripResource('trip','activities',[],{id:'trip'});assert.deepEqual(calls,[['/api/trips/trip/sync','POST']]);assert.equal(invalidations.length,1);
 calls.length=0;ok=false;assert.equal(await sync.syncTripResource('trip','activities',[],{id:'trip'}),false);assert.equal(invalidations.length,1);
 calls.length=0;ok=true;await sync.syncTripResource('trip','activities',[]);assert.deepEqual(calls,[['/api/trips/trip',undefined],['/api/trips/trip/sync','POST']]);
});

function pageFunction(name) {
  const source=fs.readFileSync('app/trips/[id]/page.tsx','utf8');
  const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let found;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);
  return ts.transpileModule(found,{compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS}}).outputText;
}
function persistHarness(sync) {
  const changes=[],errors=[],events=[];
  const initial=[{id:'old',day:1,place:'A',title:'A',time:'',done:false}];
  const context={canEditItinerary:true,savingActivity:{current:false},activities:initial,id:'trip',trip:{id:'trip'},numberActivities:order.numberActivities,syncTripResource:sync,setActivitySaving(){},setActivityError:x=>errors.push(x),setActivities:x=>changes.push(x),window:{localStorage:{setItem(){}},dispatchEvent:x=>events.push(x)},CustomEvent:class{constructor(type){this.type=type}}};
  context.activitiesRef={current:initial};context.pendingCompletions={current:new Map()};context.updateActivities=value=>{const next=typeof value==='function'?value(context.activitiesRef.current):value;context.activitiesRef.current=next;changes.push(next);};
  vm.createContext(context);vm.runInContext(pageFunction('persist'),context);
  return {context,changes,errors,events};
}
test('persist blocks duplicate taps and publishes UI only after positive server confirmation',async()=>{
 let release,calls=0;const pending=new Promise(resolve=>release=resolve),h=persistHarness(async()=>{calls++;return pending;});
 const next=[{id:'new',day:1,title:'B',place:'B',done:false,time:''}];
 const first=h.context.persist(next);assert.equal(await h.context.persist(next),false);assert.equal(calls,1);assert.equal(h.changes.length,0);release(true);assert.equal(await first,true);assert.equal(h.changes[0][0].id,'new');assert.equal(h.events.length,1);assert.equal(h.context.savingActivity.current,false);
});
test('failed persist retains existing activities, reports error and releases the save guard',async()=>{
 const h=persistHarness(async()=>false);assert.equal(await h.context.persist([]),false);assert.equal(h.changes.length,0);assert.equal(h.context.activitiesRef.current,h.context.activities);assert.match(h.errors.at(-1),/non salvata/);assert.equal(h.events.length,0);assert.equal(h.context.savingActivity.current,false);
});
test('failed form save keeps draft and editor open; valid blank title is filled only in the save payload',async()=>{
 const draft={title:'',place:'Museo',day:1,time:''};let payload,closed=false;
 const context={draft,editingId:null,activities:[],savingActivity:{current:false},placeSelecting:false,prepareActivityDraft:helper.prepareActivityDraft,persist:async items=>{payload=items;return false;},setShowEditor:()=>closed=true,setActivityError(){},Date};
 vm.createContext(context);vm.runInContext(pageFunction('saveActivity'),context);await context.saveActivity();assert.equal(closed,false);assert.equal(context.draft,draft);assert.equal(draft.title,'');assert.equal(payload[0].title,'Museo');
});
test('Google details preserve photo references and attribution without blocking on photo resolution; auth is required',async()=>{
 const urls=[];const deps={'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},'../../../lib/auth':{currentUser:async()=>({id:'test'})}};
 deps['../../../lib/google-place-requests']={googlePlaceRequest:(...args)=>extrasFetch(...args),GooglePlaceLimitError:class extends Error{}};
 const extrasFetch=async url=>{urls.push(url);return{ok:true,json:async()=>({id:'test-place',displayName:{text:'Museo'},formattedAddress:'Via Museo',location:{latitude:1,longitude:2},photos:[{name:'places/test/photos/p',authorAttributions:[{displayName:'Autore',uri:'https://example.test'}]}]})}};
 const api=load('app/api/places/route.ts',deps,{URL,process:{env:{GOOGLE_MAPS_API_KEY:'test-only'}},fetch:async url=>{urls.push(url);return{ok:true,json:async()=>({id:'test-place',displayName:{text:'Museo'},formattedAddress:'Via Museo',location:{latitude:1,longitude:2},photos:[{name:'places/test/photos/p',authorAttributions:[{displayName:'Autore',uri:'https://example.test'}]}]})}}});
 const result=await api.GET({url:'https://example.test/api/places?placeId=test-place&sessionToken=test'});assert.equal(urls.length,1);assert.equal(result.body.photoName,'places/test/photos/p');assert.equal(result.body.photoAttribution,'Autore');assert.equal(result.body.latitude,1);
 deps['../../../lib/auth'].currentUser=async()=>null;assert.equal((await api.GET({url:'https://example.test/api/places?placeId=test'})).status,401);assert.equal(urls.length,1);
});

test('late Google selection cannot overwrite a newer selected place or reopen a closed editor', async()=>{
  let release;
  const pending=new Promise(resolve=>release=resolve);
  let draft={title:'',place:''},applied=0;
  const selection=helper.latestActivityRequest();
  const context={placeMatches:[{id:'old',provider:'google',placeId:'old',name:'Old'},{id:'new',provider:'openstreetmap',name:'New',address:'New street',latitude:4,longitude:5}],searchRequests:{current:helper.latestActivityRequest()},selectionRequests:{current:selection},placeSessionToken:'test',setPlaceSearchOpen(){},setPlaceSelecting(){},setActivityError(){},fetch:async()=>pending,applyActivityPlace:helper.applyActivityPlace,setDraft:fn=>{draft=fn(draft);applied++;},setEditorStep(){}};
  vm.createContext(context);vm.runInContext(pageFunction('selectPlace'),context);
  const first=context.selectPlace(0);await context.selectPlace(1);release({ok:true,json:async()=>({name:'Old details',latitude:99,longitude:99})});await first;
  assert.equal(draft.place,'New');assert.equal(draft.latitude,4);assert.equal(applied,1);
  const closing=context.selectPlace(0);selection.cancel();await closing;assert.equal(applied,1);
});

function toggleHarness(sync) {
 const h=persistHarness(async()=>{throw Error('unexpected whole-list write');});
 h.context.syncActivityCompletion=sync;
 h.context.setCompletionSaving=value=>h.pending=value;
 h.context.activitiesRef.current=[{id:'a',day:1,title:'A',place:'A',sortOrder:8,time:'',done:false},{id:'b',day:1,title:'B',place:'B',sortOrder:12,time:'09:00',done:false}];
 vm.runInContext(pageFunction('toggleActivity'),h.context);
 return h;
}
test('toggle reacts before API response without activating global saving or disabling other records',async()=>{
 let release,calls=0;const h=toggleHarness(async()=>{calls++;return new Promise(resolve=>release=resolve);});
 const initial=h.context.activitiesRef.current,old={...initial[0]};
 const saving=h.context.toggleActivity('a');assert.equal(h.context.activitiesRef.current[0].done,true);assert.equal(h.pending.has('a'),true);assert.equal(h.pending.has('b'),false);assert.equal(h.context.savingActivity.current,false);
 assert.equal(await h.context.toggleActivity('a'),false);assert.equal(calls,1);assert.equal(h.context.activitiesRef.current[1],initial[1]);
 release(true);assert.equal(await saving,true);assert.equal(h.pending.size,0);
 for(const key of Object.keys(old).filter(k=>k!=='done'))assert.equal(h.context.activitiesRef.current[0][key],old[key]);
});
test('two distinct activities save concurrently and an error rolls back only its own record',async()=>{
 const releases=new Map(),h=toggleHarness(async(_,id)=>new Promise(resolve=>releases.set(id,resolve)));
 const a=h.context.toggleActivity('a'),b=h.context.toggleActivity('b');assert.equal(releases.size,2);assert.equal(h.pending.size,2);
 releases.get('b')(true);assert.equal(await b,true);assert.equal(h.context.activitiesRef.current[1].done,true);assert.equal(h.context.activitiesRef.current[0].done,true);
 releases.get('a')(false);assert.equal(await a,false);assert.equal(h.context.activitiesRef.current[0].done,false);assert.equal(h.context.activitiesRef.current[1].done,true);assert.match(h.errors.at(-1),/Stato non salvato/);assert.equal(h.events.length,1);
});
test('reopening remains immediate and repeated taps cannot overlap',async()=>{
 let release;const h=toggleHarness(async()=>new Promise(resolve=>release=resolve));h.context.activitiesRef.current[0].done=true;
 const job=h.context.toggleActivity('a');assert.equal(h.context.activitiesRef.current[0].done,false);assert.equal(await h.context.toggleActivity('a'),false);release(true);assert.equal(await job,true);assert.equal(h.context.activitiesRef.current[0].done,false);
});
test('whole-list writes wait for toggles and preserve settled completion or rollback',async()=>{
 for(const confirmed of [true,false]){
  let release,payload;const h=toggleHarness(async()=>new Promise(resolve=>release=resolve));h.context.syncTripResource=async(_,__,items)=>{payload=items;return true;};
  const toggle=h.context.toggleActivity('a');const edited=h.context.activitiesRef.current.map(item=>({...item,title:item.id==='b'?'Edited':item.title}));
  const bulk=h.context.persist(edited);assert.equal(payload,undefined);release(confirmed);await toggle;assert.equal(await bulk,true);assert.equal(payload[0].done,confirmed);assert.equal(payload[1].title,'Edited');
 }
});
test('late incoming snapshot cannot remove an in-flight optimistic completion',async()=>{
 let release;const h=toggleHarness(async()=>new Promise(resolve=>release=resolve));vm.runInContext(pageFunction('applyIncomingActivities'),h.context);
 const job=h.context.toggleActivity('a');h.context.applyIncomingActivities([{id:'a',done:false,title:'Remote edit',day:1,place:'A'}]);assert.equal(h.context.activitiesRef.current[0].done,true);assert.equal(h.context.activitiesRef.current[0].title,'Remote edit');release(true);await job;
});
test('completion transport sends one field-level PATCH and invalidates only confirmed writes',async()=>{
 const calls=[],invalidations=[];let ok=true;
 const sync=load('lib/trip-sync.ts',{'./trip-client-cache':{removeTripSnapshot:id=>invalidations.push(id)}},{fetch:async(url,options)=>{calls.push({url,...options});return{ok};}});
 assert.equal(await sync.syncActivityCompletion('trip','a',true),true);assert.equal(calls.length,1);assert.equal(calls[0].method,'PATCH');assert.deepEqual(JSON.parse(calls[0].body),{activityId:'a',done:true});assert.equal(invalidations.length,1);
 ok=false;assert.equal(await sync.syncActivityCompletion('trip','a',false),false);assert.equal(invalidations.length,1);
});
test('invalid place selection preserves the old title and location',async()=>{
 let draft={title:'Personalizzato',place:'Old'},error;
 const context={placeMatches:[{id:'new',provider:'google',placeId:'new',name:'New'}],searchRequests:{current:helper.latestActivityRequest()},selectionRequests:{current:helper.latestActivityRequest()},placeSessionToken:'test',setPlaceSearchOpen(){},setPlaceSelecting(){},setActivityError:e=>error=e,fetch:async()=>({ok:false}),applyActivityPlace:helper.applyActivityPlace,setDraft:fn=>draft=fn(draft),setEditorStep(){throw Error('must not advance');}};
 vm.createContext(context);vm.runInContext(pageFunction('selectPlace'),context);await context.selectPlace(0);assert.equal(draft.title,'Personalizzato');assert.equal(draft.place,'Old');assert.match(error,/Riprova/);
});

test('editing another activity remains available while a checkbox request is pending', async()=>{
 let release,opened=false,draft;
 const h=toggleHarness(async()=>new Promise(resolve=>release=resolve));
 Object.assign(h.context,{selectionRequests:{current:helper.latestActivityRequest()},setPlaceSelecting(){},setEditingId(){},setDraft:value=>draft=value,setEditorStep(){},setShowEditor:value=>opened=value});
 vm.runInContext(pageFunction('openEdit'),h.context);
 const toggle=h.context.toggleActivity('a');h.context.openEdit(h.context.activitiesRef.current[1]);assert.equal(opened,true);assert.equal(draft.title,'B');assert.equal(h.context.savingActivity.current,false);release(true);await toggle;
});


test('selected Google place ID survives only matching metadata and is cleared when the place changes',()=>{
 const chosen=helper.applyActivityPlace({title:'',place:''},{...place,provider:'google',placeId:'exact-point'});assert.equal(chosen.placeId,'exact-point');assert.equal(helper.editActivityPlace(chosen,'Other').placeId,undefined);
 assert.equal(helper.restoreActivityMetadata({id:'one',...chosen},{id:'one',...chosen}).placeId,'exact-point');assert.equal(helper.restoreActivityMetadata({id:'one',title:'A',place:'Other'},{id:'one',...chosen}).placeId,undefined);
});
