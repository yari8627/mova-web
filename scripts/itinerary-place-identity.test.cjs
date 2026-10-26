const {test}=require('node:test'),assert=require('node:assert/strict');const{load}=require('./home-photo-harness.cjs');
// Public geographic metadata observed through authorized GETs. Resource IDs and
// photo URLs are synthetic; no account, trip, credentials or expiring photo names.
const town={place:'Farsund',placeAddress:'Farsund, Norvegia',latitude:58.09492689999999,longitude:6.8050196};
const predictions=[{provider:'google',placeId:'town',name:'Farsund',address:'Norvegia',type:'political'},{provider:'google',placeId:'otta',name:'Otta',address:'Norvegia',type:'geocode'},{provider:'google',placeId:'shop',name:'Elon Farsund',address:'Torvgaten, Farsund, Norvegia',type:'establishment'},{provider:'google',placeId:'housing',name:'Farsund',address:'Krossnes, Farsund, Norvegia',type:'housing_complex'},{provider:'google',placeId:'camp',name:'Farsund',address:'Ferjeveien, Farsund, Norvegia',type:'campground'}];
const details={town:{placeId:'town',name:'Farsund',address:'Farsund, Norvegia',latitude:town.latitude,longitude:town.longitude,photoName:'places/town/photos/fresh'},housing:{placeId:'housing',name:'Farsund',address:'Krossnes 7A, 4550 Farsund, Norvegia',latitude:58.09709069999999,longitude:6.7784379,photoName:'places/housing/photos/fresh'},camp:{placeId:'camp',name:'Farsund',address:'Ferjeveien 17, 4550 Farsund, Norvegia',latitude:58.09394639999999,longitude:6.8129095}};
const ok=body=>({ok:true,status:200,json:async()=>body});
function fixture({candidates=predictions,records=details,limitedId}={}){const calls=[];const api=load('lib/itinerary-place-photos.ts',{crypto:{randomUUID:()=> 'fixture'},Response,AbortSignal,fetch:async value=>{const url=new URL(value,'https://fixture');calls.push(url);if(url.searchParams.has('q'))return ok(candidates);if(limitedId&&url.searchParams.get('placeId')===limitedId)return{ok:false,status:429,headers:{get:()=> '120'}};if(url.searchParams.has('placeId'))return ok(records[url.searchParams.get('placeId')]||null);return ok({photoUri:'https://lh3.googleusercontent.com/'+url.searchParams.get('name').split('/')[1]+'.jpg'});}});api.setPlacePhotoAccount('fixture');return{api,calls};}
test('Farsund: verify three homonyms, select only the real town by saved coordinates',async()=>{const{api,calls}=fixture();assert.equal((await api.resolvePlacePhoto(town,'Norvegia','NO'))?.url,'https://lh3.googleusercontent.com/town.jpg');assert.equal(calls.length,5);assert.deepEqual(calls.filter(u=>u.searchParams.has('placeId')).map(u=>u.searchParams.get('placeId')),['town','housing','camp']);assert(!calls.some(u=>/otta|shop/.test(u.searchParams.get('placeId')||'')));assert.equal(calls.at(-1).searchParams.get('name'),'places/town/photos/fresh');});
test('Farsund cold page, refresh and day return preserve geo-identity and positive memory reuse',async()=>{for(let opening=0;opening<2;opening++){const{api,calls}=fixture();const a=api.resolvePlacePhoto(town,'Norvegia','NO'),b=api.resolvePlacePhoto({...town,day:2},'Norvegia','NO');assert.equal(a,b);assert.equal((await a)?.url,'https://lh3.googleusercontent.com/town.jpg');const count=calls.length;assert.equal((await api.resolvePlacePhoto(town,'Norvegia','NO'))?.url,'https://lh3.googleusercontent.com/town.jpg');assert.equal(calls.length,count);}});
test('Farsund with selected place ID skips ambiguous autocomplete and still renews photo metadata',async()=>{const{api,calls}=fixture();assert.equal((await api.resolvePlacePhoto({...town,placeId:'town'},'Norvegia','NO'))?.url,'https://lh3.googleusercontent.com/town.jpg');assert.equal(calls.length,2);assert(!calls.some(u=>u.searchParams.has('q')));});
test('correct town without a photo cannot fall back to a photographed housing complex',async()=>{const{api,calls}=fixture({records:{...details,town:{...details.town,photoName:undefined}}});assert.equal(await api.resolvePlacePhoto(town,'Norvegia','NO'),null);assert(!calls.some(u=>u.pathname==='/api/places/photo'));const count=calls.length;assert.equal(await api.resolvePlacePhoto(town,'Norvegia','NO'),null);assert.equal(calls.length,count);});
test('multiple verified identities remain ambiguous; no photo is requested',async()=>{const{api,calls}=fixture({records:{...details,housing:{...details.town,placeId:'housing',photoName:'places/housing/photos/fresh'}}});assert.equal(await api.resolvePlacePhoto(town,'Norvegia','NO'),null);assert(!calls.some(u=>u.pathname==='/api/places/photo'));});
test('ambiguous homonyms without coordinates or more than three eligible IDs stay neutral',async()=>{for(const[place,candidates]of [[{...town,latitude:undefined,longitude:undefined},predictions],[town,[...predictions,{...predictions[0],placeId:'fourth'}]]]){const{api,calls}=fixture({candidates});assert.equal(await api.resolvePlacePhoto(place,'Norvegia','NO'),null);assert.equal(calls.length,1);}});
test('repeated suggestions for the same ID do not duplicate detail requests',async()=>{const{api,calls}=fixture({candidates:[predictions[0],predictions[0]]});assert.equal((await api.resolvePlacePhoto(town,'Norvegia','NO'))?.url,'https://lh3.googleusercontent.com/town.jpg');assert.equal(calls.length,3);});

for(const point of [{place:'Aeroporto di Oslo-Gardermoen',placeAddress:'Edvard Munchs veg, 2061 Gardermoen, Norvegia',latitude:60.1978446,longitude:11.0963701,type:'airport',prediction:'Aeroporto di Oslo-Gardermoen (OSL)'},{place:'Creative Collective Oslo',placeAddress:'Dronning Mauds gate 3, 0250 Oslo, Norvegia',latitude:59.91265959999999,longitude:10.7293681,type:'establishment',prediction:'Creative Collective Oslo'}])test(point.place+': cold open, refresh and attribution stay correct with and without place ID',async()=>{
 for(const withId of [false,true])for(let opening=0;opening<2;opening++){
  const record={placeId:'point',name:point.place,address:point.placeAddress,latitude:point.latitude,longitude:point.longitude,photoName:'places/point/photos/fresh',photoAttribution:'Provider author',photoAttributionUri:'https://maps.google.com/maps/contrib/fixture'};
  const{api,calls}=fixture({candidates:[{provider:'google',placeId:'point',name:point.prediction,address:point.placeAddress,type:point.type}],records:{point:record}});
  const target={...point,...(withId?{placeId:'point'}:{})};const value=await api.resolvePlacePhoto(target,'Norvegia','NO');assert.equal(value?.url,'https://lh3.googleusercontent.com/point.jpg');assert.equal(value.attribution,record.photoAttribution);assert.equal(value.attributionUri,record.photoAttributionUri);
  const count=calls.length;assert.equal((await api.resolvePlacePhoto(target,'Norvegia','NO')).url,value.url);assert.equal(calls.length,count);
 }
});
test('429 while disambiguating keeps fallback and cooldown, never selects a partially verified photo',async()=>{const{api,calls}=fixture({limitedId:'housing'});assert.equal(await api.resolvePlacePhoto(town,'Norvegia','NO'),null);const count=calls.length;assert.equal(await api.resolvePlacePhoto(town,'Norvegia','NO'),null);assert.equal(await api.resolvePlacePhoto(town,'Norvegia','NO',true),null);assert.equal(calls.length,count);assert(!calls.some(u=>u.pathname==='/api/places/photo'));});

test('Farsund: bounded overlap verifies every homonym before requesting media', async()=>{
 const gates=new Map(),started=[];let active=0,peak=0,media=0;
 const api=load('lib/itinerary-place-photos.ts',{crypto:{randomUUID:()=> 'fixture'},fetch:async value=>{
  const url=new URL(value,'https://fixture');
  if(url.searchParams.has('q'))return ok(predictions);
  const id=url.searchParams.get('placeId');
  if(id){started.push(id);active++;peak=Math.max(peak,active);await new Promise(resolve=>gates.set(id,resolve));active--;return ok(details[id]);}
  media++;return ok({photoUri:'https://lh3.googleusercontent.com/town.jpg'});
 }});api.setPlacePhotoAccount('fixture');const result=api.resolvePlacePhoto(town,'Norvegia','NO');
 try {
  await new Promise(setImmediate);assert.deepEqual(started,['town','housing'],'independent identity checks must overlap');assert.equal(media,0);
  gates.get('town')();gates.get('housing')();await new Promise(setImmediate);
  assert.deepEqual(started,['town','housing','camp']);assert.equal(media,0,'do not choose a partial match');
  gates.get('camp')();assert.equal((await result)?.url,'https://lh3.googleusercontent.com/town.jpg');assert.equal(peak,2);assert.equal(media,1);
 } finally {for(let i=0;i<4;i++){for(const release of gates.values())release();await new Promise(setImmediate);}await result;}
});

test('Oslo first load: generic Google prediction type still reaches canonical identity verification',async()=>{
 const point={place:'Aeroporto di Oslo-Gardermoen',placeAddress:'Edvard Munchs veg, 2061 Gardermoen, Norvegia',latitude:60.1978446,longitude:11.0963701};
 for(const type of ['point_of_interest','establishment','international_airport']) {
  const record={placeId:'osl',name:point.place,address:point.placeAddress,latitude:point.latitude,longitude:point.longitude,photoName:'places/osl/photos/fresh'};
  const candidates=[{provider:'google',placeId:'osl',name:point.place+' (OSL)',address:'Edvard Munchs veg, Gardermoen, Norvegia',type}];
  for(let opening=0;opening<2;opening++) {
   const{api,calls}=fixture({candidates,records:{osl:record}});
   assert.equal((await api.resolvePlacePhoto(point,'Norvegia','NO'))?.url,'https://lh3.googleusercontent.com/osl.jpg',type);
   assert.equal(calls.length,3);const count=calls.length;await api.resolvePlacePhoto(point,'Norvegia','NO');assert.equal(calls.length,count);
  }
  for(const wrong of [{...record,address:'Altro indirizzo',latitude:59},{...record,name:'Altro aeroporto'}]) {
   const{api,calls}=fixture({candidates,records:{osl:wrong}});assert.equal(await api.resolvePlacePhoto(point,'Norvegia','NO'),null);assert(!calls.some(u=>u.pathname==='/api/places/photo'));
  }
 }
});
