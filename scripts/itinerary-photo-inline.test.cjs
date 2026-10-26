const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./home-photo-harness.cjs');
const point={place:'Aeroporto di Oslo-Gardermoen',placeAddress:'Edvard Munchs veg, 2061 Gardermoen, Norvegia',latitude:60.1978446,longitude:11.0963701};
const photoName='places/osl/photos/fresh',uri='https://lh3.googleusercontent.com/osl.jpg';
const detail={id:'osl',displayName:{text:point.place},formattedAddress:point.placeAddress,location:{latitude:point.latitude,longitude:point.longitude},primaryType:'international_airport',photos:[{name:photoName,authorAttributions:[{displayName:'Fixture author',uri:'https://maps.google.com/maps/contrib/fixture'}]}]};
class LimitError extends Error{constructor(retryAfterSeconds){super('Limited');this.retryAfterSeconds=retryAfterSeconds;}}
function server({record=detail,user=true,mediaStatus=200,limit=false,timeout=false}={}){
 const calls=[];let authCalls=0;
 const api=load('app/api/places/route.ts',{Request,Response,process:{env:{GOOGLE_MAPS_API_KEY:'fixture'}},crypto:{randomUUID:()=> 'fixture-session'}},{
  'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
  '../../../lib/auth':{currentUser:async()=>{authCalls++;return user?{id:'fixture'}:null;}},
  '../../../lib/google-place-requests':{GooglePlaceLimitError:LimitError,googlePlaceRequest:async value=>{
   calls.push(value);if(value.includes('/media?')){if(limit)throw new LimitError(120);if(timeout)throw Error('Deadline');return Response.json(mediaStatus===200?{photoUri:uri}:{error:'Fixture'},{status:mediaStatus});}
   return Response.json(record);
  }},
 });
 const request=(target=point,extra={})=>new Request('https://fixture/api/places?'+new URLSearchParams({placeId:'osl',...(target===null?{}:{photoTarget:JSON.stringify(target)}),...extra}));
 return{api,calls,request,authCalls:()=>authCalls};
}
test('inline thumbnail: one authenticated handler resolves fresh details and media with attribution',async()=>{
 const{api,calls,request,authCalls}=server();const r=await api.GET(request());const body=await r.json();
 assert.equal(r.status,200);assert.equal(body.photoResolved,true);assert.equal(body.photoUri,uri);assert.equal(body.photoAttribution,'Fixture author');assert.equal(body.photoAttributionUri,'https://maps.google.com/maps/contrib/fixture');assert.equal(authCalls(),1);assert.equal(calls.length,2);assert.match(calls[1],/maxWidthPx=240&skipHttpRedirect=true/);assert.match(r.headers.get('cache-control'),/no-store/);
});
test('inline client consumes verified URI without a second media HTTP request',async()=>{
 const calls=[];const api=load('lib/itinerary-place-photos.ts',{crypto:{randomUUID:()=> 'fixture'},fetch:async value=>{
  const u=new URL(value,'https://fixture');calls.push(u);if(u.searchParams.has('q'))return Response.json([{provider:'google',placeId:'osl',name:point.place+' (OSL)',address:'Gardermoen',type:'point_of_interest'}]);
  if(u.searchParams.has('placeId'))return Response.json({placeId:'osl',name:point.place,address:point.placeAddress,latitude:point.latitude,longitude:point.longitude,photoName,photoResolved:true,photoUri:uri,photoAttribution:'Fixture author'});
  throw Error('Unexpected second media request');
 }});api.setPlacePhotoAccount('fixture');const result=await api.resolvePlacePhoto(point,'Norvegia','NO');assert.equal(result?.url,uri);assert.equal(result.attribution,'Fixture author');assert.equal(calls.length,2);assert(calls[1].searchParams.has('photoTarget'));
 const count=calls.length;await api.resolvePlacePhoto(point,'Norvegia','NO');assert.equal(calls.length,count);
});
test('inline path does not fetch a photo for a wrong canonical name or geographic identity',async()=>{
 for(const record of [{...detail,displayName:{text:'Another airport'}},{...detail,formattedAddress:'Another address',location:{latitude:59,longitude:10}}]){
  const{api,calls,request}=server({record});const r=await api.GET(request());const body=await r.json();assert.equal(body.photoUri,undefined);assert.equal(calls.length,1);
 }
});
test('inline target validation and authentication precede provider work',async()=>{
 for(const target of [{...point,placeId:'different'},[],{place:42},{...point,latitude:'60'}, {place:point.place,longitude:Infinity}]){
  const{api,calls,request}=server();assert.equal((await api.GET(request(target))).status,400);assert.equal(calls.length,0);
 }
 const{api,calls,request}=server({user:false});assert.equal((await api.GET(request())).status,401);assert.equal(calls.length,0);
});
test('ordinary place details and selected-ID photo projection preserve existing behavior',async()=>{
 const normal=server();const body=await(await normal.api.GET(normal.request(null))).json();assert.equal(body.photoResolved,undefined);assert.equal(normal.calls.length,1);assert.equal(body.name,point.place);
 const selected=server({record:{id:'osl',photos:detail.photos}});const response=await selected.api.GET(selected.request({...point,placeId:'osl'},{detail:'photo'}));assert.equal((await response.json()).photoUri,uri);assert.equal(selected.calls.length,2);
});
test('missing provider photo stays neutral without a media lookup',async()=>{
 const{api,calls,request}=server({record:{...detail,photos:[]}});const body=await(await api.GET(request())).json();assert.equal(body.photoUri,undefined);assert.equal(calls.length,1);
});
for(const status of [403,404,500])test('inline media HTTP '+status+' preserves controlled failure',async()=>{
 const{api,request}=server({mediaStatus:status});const r=await api.GET(request());assert.equal(r.status,status===500?502:status);assert.match(r.headers.get('cache-control'),/no-store/);
});
test('inline media cooldown and timeout propagate without retry',async()=>{
 for(const options of [{limit:true},{timeout:true}]){const{api,calls,request}=server(options);const r=await api.GET(request());assert.equal(r.status,options.limit?429:504);assert.equal(calls.length,2);if(options.limit)assert.equal(r.headers.get('retry-after'),'120');}
});
test('cancelled inline request cannot start another provider media operation',async()=>{
 const{api,calls,request}=server();const controller=new AbortController();controller.abort();
 const response=await api.GET(new Request(request(),{signal:controller.signal}));assert.equal(response.status,504);assert.equal(calls.length,1);
});
test('inline result with an unsafe URI stays neutral and never falls through to another media request',async()=>{
 let count=0;const api=load('lib/itinerary-place-photos.ts',{crypto:{randomUUID:()=> 'fixture'},fetch:async()=>{count++;return Response.json({placeId:'osl',photoName,photoResolved:true,photoUri:'http://unsafe.fixture/photo.jpg'});}});
 api.setPlacePhotoAccount('fixture');assert.equal(await api.resolvePlacePhoto({...point,placeId:'osl'},'Norvegia','NO'),null);assert.equal(count,1);
});
