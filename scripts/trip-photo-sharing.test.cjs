const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {load}=require('./home-photo-harness.cjs');
const {primaryHomeDestination}=load('lib/home-photo-destination.ts');
const canonical='https://thumb.wikimedia.org/wikipedia/commons/thumb/7/70/Milan_Cathedral_from_Piazza_del_Duomo.jpg/1280px-Milan_Cathedral_from_Piazza_del_Duomo.jpg';
const flush=()=>new Promise(r=>setImmediate(r));
function cover(trip){
 const hooks=[],effects=[];let cursor=0,tree;const requested=[];
 const photo=()=>null;
 const react={useState(initial){const n=cursor++;if(!hooks[n])hooks[n]={value:initial};return[hooks[n].value,v=>hooks[n].value=v];},useEffect(effect,deps){const n=cursor++;if(!hooks[n]||deps.some((v,i)=>v!==hooks[n].deps[i])){hooks[n]={deps};effects.push(effect);}}};
 const dependencies={react,'./home-trip-photo':{HomeTripPhoto:photo},'./trip-cover.module.css':{__esModule:true,default:new Proxy({},{get:(_,k)=>k})},'./use-destination-image':{useDestinationImage:()=>'/destinations/italy.webp'},'../../lib/trip-client-cache':{readTripSnapshot:()=>trip,fetchTripSnapshot:async id=>{requested.push(id);return trip;}}};
 const context={exports:{},require:name=>name in dependencies?dependencies[name]:require(name),localStorage:{getItem:()=>null},window:{addEventListener(){},removeEventListener(){}}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/components/trip-cover.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
 const render=()=>{cursor=0;tree=context.exports.TripCover({tripId:trip.id});for(const effect of effects.splice(0))effect();return tree;};
 return{render,photo,requested};
}
for(const [country,city]of [['Norvegia','Tromsø'],['Italia','Milano'],['Italia','Napoli'],['Stati Uniti','New York'],['Italia','Milano · Napoli']])test('shared TripCover delegates the exact destination '+city+' without national substitution',async()=>{
 const h=cover({id:'synthetic-trip',name:'Test',country,city,startDate:'2026-10-30',endDate:'2026-10-31',people:2});h.render();await flush();const tree=h.render();
 const photo=tree.props.children[0];assert.equal(photo.type,h.photo);assert.equal(photo.props.country,country);assert.equal(photo.props.city,city);assert.equal(photo.props.kind,'trip');assert.equal(tree.props.style,undefined);
 assert.equal(h.requested.length,1);assert.equal(h.requested[0],'synthetic-trip');
});
for(const [country,city,expected]of [['Norvegia','Tromsø','Tromsø'],['Italia','Milano','Milano'],['Italia','Napoli','Napoli'],['Stati Uniti','New York','New York'],['Italia','Milano · Napoli','Milano']])test('Home → Trip → Home reuses one canonical photo lookup for '+city,async()=>{
 const calls=[];const api=load('lib/home-trip-images.ts',{fetch:async url=>{calls.push(new URL(url,'http://local'));return{ok:true,json:async()=>({image:canonical})};}});
 const home=api.resolveHomePhoto(country,city),trip=api.resolveHomePhoto(country,city);assert.equal(home,trip);
 assert.equal(await home,canonical);assert.equal(await trip,canonical);assert.equal(await api.resolveHomePhoto(country,city),canonical);assert.equal(calls.length,1);
 assert.equal(calls[0].searchParams.get('city'),expected);assert.equal(calls[0].searchParams.get('scope'),'home-v2');assert.equal(api.cachedHomePhoto(country,city),canonical);
 const sources=api.homePhotoSrcSet(canonical).split(', ');assert(sources.every(s=>s.includes('Milan_Cathedral_from_Piazza_del_Duomo.jpg')));
});
test('direct Trip refresh resolves the same explicit locality through the shared API',async()=>{
 const calls=[];const fresh=load('lib/home-trip-images.ts',{fetch:async url=>{calls.push(url);return{ok:true,json:async()=>({image:canonical})};}});
 assert.equal(fresh.cachedHomePhoto('Italia','Milano'),'');assert.equal(await fresh.resolveHomePhoto('Italia','Milano'),canonical);assert.equal(calls.length,1);
});
for(const status of [404,500,429])test('shared Home/Trip requests handle HTTP '+status+' without duplicate in-flight requests',async()=>{
 let count=0;const api=load('lib/home-trip-images.ts',{fetch:async()=>{count++;return{ok:false,status,headers:{get:()=> '120'}};}});
 const a=api.resolveHomePhoto('Italia','Milano'),b=api.resolveHomePhoto('Italia','Milano');assert.equal(a,b);assert.equal(await a,'');assert.equal(await b,'');assert.equal(count,1);
 if(status===429){assert.equal(await api.resolveHomePhoto('Italia','Napoli'), '');assert.equal(count,1);}
});
test('missing explicit city shares the approved neutral fallback without national lookup',async()=>{
 let count=0;const api=load('lib/home-trip-images.ts',{fetch:async()=>{count++;throw Error('must not query');}});
 assert.equal(primaryHomeDestination('Italia','Italia'),null);assert.equal(await api.resolveHomePhoto('Italia',''), '');assert.equal(count,0);
});
