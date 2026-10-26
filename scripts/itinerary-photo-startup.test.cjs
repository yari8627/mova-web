const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./home-photo-harness.cjs');
const airport={place:'Aeroporto di Oslo-Gardermoen',placeAddress:'Edvard Munchs veg, 2061 Gardermoen, Norvegia',latitude:60.1978446,longitude:11.0963701,placeId:'airport-fixture',photoName:'places/airport-fixture/photos/expired'};
const uri='https://lh3.googleusercontent.com/airport-fresh.jpg';
const ok=value=>({ok:true,status:200,json:async()=>value});
function fixture(extra={}){
 const requests=[];let blocked=false;
 const api=load('lib/itinerary-place-photos.ts',{crypto:{randomUUID:()=> 'test-session'},Response,AbortSignal,...extra,fetch:async value=>{
   const url=new URL(value,'https://fixture');requests.push(url);
   if(blocked)return {ok:false,status:429,headers:{get:()=> '120'}};
   if(url.pathname==='/api/places')return ok({placeId:airport.placeId,photoName:'places/airport-fixture/photos/fresh',name:airport.place,address:airport.placeAddress});
   if(url.searchParams.get('name')===airport.photoName)return {ok:false,status:404};
   return ok({photoUri:uri});
 }});
 api.setPlacePhotoAccount('fixture-user');return {api,requests,block:()=>blocked=true};
}
test('cold startup and full page refresh renew a persisted photo reference without a manual retry',async()=>{
 for(let opening=0;opening<2;opening++){
  const {api,requests}=fixture();
  const value=await api.resolvePlacePhoto(airport,'Norvegia','NO');assert.equal(value?.url,uri);
  assert.equal(requests.length,2);assert.equal(requests[0].pathname,'/api/places');assert.equal(requests[0].searchParams.get('detail'),'photo');
  assert.equal(requests[1].searchParams.get('name'),'places/airport-fixture/photos/fresh');
  assert.equal((await api.resolvePlacePhoto(airport,'Norvegia','NO')).url,uri);assert.equal(requests.length,2);
 }
});
test('startup does not render a persisted URI as fresh; same metadata/media requests as manual recovery',async()=>{
 const {api,requests}=fixture();const target={...airport,photoUrl:'https://lh3.googleusercontent.com/expired.jpg'};
 assert.equal((await api.resolvePlacePhoto(target,'Norvegia','NO')).url,uri);
 const first=requests.map(u=>u.pathname+'?'+u.searchParams.toString());requests.length=0;
 assert.equal((await api.resolvePlacePhoto(target,'Norvegia','NO',true)).url,uri);
 assert.deepEqual(requests.map(u=>u.pathname+'?'+u.searchParams.toString()),first);
});
test('fresh-memory reuse and deduplication survive startup renewal; negative cache and Retry-After stay bounded',async()=>{
 let now=100000;const {api,requests,block}=fixture({Date:{now:()=>now,parse:Date.parse}});
 const a=api.resolvePlacePhoto(airport,'Norvegia','NO'),b=api.resolvePlacePhoto(airport,'Norvegia','NO');assert.equal(a,b);assert.equal((await a).url,uri);
 assert.equal(requests.length,2);now+=120001;block();assert.equal(await api.resolvePlacePhoto(airport,'Norvegia','NO'),null);
 const afterFailure=requests.length;assert.equal(await api.resolvePlacePhoto(airport,'Norvegia','NO'),null);assert.equal(await api.resolvePlacePhoto(airport,'Norvegia','NO',true),null);assert.equal(requests.length,afterFailure);
});
