const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./home-photo-harness.cjs');
const pure=load('lib/home-photo-destination.ts');
const image=name=>`https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${encodeURIComponent(name)}.jpg/1280px-${encodeURIComponent(name)}.jpg`;
const wiki=(city,country,name=city)=>({title:city,extract:`${city} is a city in ${country}.`,coordinates:[{lat:1,lon:1}],pageimage:`${name}.jpg`,thumbnail:{source:image(name)}});
const response=pages=>({ok:true,json:async()=>({query:{pages:Object.fromEntries(pages.map((p,i)=>[i+1,p]))}})});
const photoModule=()=>load('lib/home-photo-provider.ts');
for(const [country,city] of [['Norvegia','Tromsø'],['Italia','Milano'],['Italia','Napoli'],['USA','New York']])test(`explicit locality ${city} wins over ${country} and national imagery`,async()=>{
  const calls=[],api=photoModule();const result=await api.resolveSpecificHomePhoto(country,city,async url=>{calls.push(new URL(url));return response([wiki(city,country)]);});
  assert.equal(result.image,image(city));assert(calls.every(url=>url.searchParams.get('titles').split('|')[0]===city));assert(calls.every(url=>url.searchParams.get('pithumbsize')==='1280'));
});
for(const city of ['', 'Italia', ' Italia / Italia '])test(`country alone (${city}) uses neutral without querying a country image`,async()=>{
  let calls=0;assert.equal(await photoModule().resolveSpecificHomePhoto('Italia',city,async()=>{calls++;return response([]);}),null);assert.equal(calls,0);
});
test('normalization preserves a location, removes redundant country and uses first explicit stop only',()=>{
  assert.equal(pure.primaryHomeDestination('USA','USA / New York · Boston').locality,'New York');
  assert.equal(pure.primaryHomeDestination('Italia','Milano, Italia').locality,'Milano');
  assert.equal(pure.photoText('Tromsø'),pure.photoText('Tromso'));
});
test('ISO country alias in locality is not treated as a city',async()=>{
  let calls=0;assert.equal(await photoModule().resolveSpecificHomePhoto('United States of America','USA',async()=>{calls++;return response([]);}),null);assert.equal(calls,0);
});
for(const name of ['Flag_of_Norway','Coat_of_arms','Political_map','Locator_map','Country_icon','National_emblem','Patriotic_symbol','Bandiera_italiana'])test(`symbolic file ${name} is excluded even when Wikipedia selects it`,async()=>{
  const result=await photoModule().resolveSpecificHomePhoto('Norvegia','Tromsø',async url=>response(new URL(url).hostname.includes('commons')?[]:[wiki('Tromsø','Norvegia',name)]));assert.equal(result,null);
});
test('Commons metadata rejects a symbol even with a meaningless numeric filename, then chooses a local photograph',async()=>{
  const calls=[];const result=await photoModule().resolveSpecificHomePhoto('USA','New York',async url=>{
    calls.push(url);if(!url.includes('commons.wikimedia'))return response([wiki('New York','USA','Flag_USA')]);
    const item=(title,desc)=>({title,imageinfo:[{mime:'image/jpeg',thumburl:image(title),extmetadata:{ImageDescription:{value:desc}}}]});
    return response([item('File:12345','Flag of New York USA'),item('File:City_view','New York city skyline, United States of America')]);
  });assert.equal(result.image,image('File:City_view'));assert.equal(calls.length,3);
});
test('wrong locality or conflicting country does not fall through to the nation article',async()=>{
  const urls=[];const result=await photoModule().resolveSpecificHomePhoto('Italia','Napoli',async url=>{urls.push(new URL(url));return response(url.includes('commons.wikimedia')?[]:[wiki('Roma','Italia')]);});
  assert.equal(result,null);assert(urls.every(url=>!(url.searchParams.get('titles')||'').split('|').includes('Italia')));
  assert.equal(await photoModule().resolveSpecificHomePhoto('USA','Paris',async url=>response(url.includes('commons.wikimedia')?[]:[wiki('Paris','France')])),null);
});
test('ambiguous state article is rejected in favor of a verified city page from the same batched query',async()=>{
  const state={...wiki('New York','USA'),extract:'New York is a state in the USA.'};
  const result=await photoModule().resolveSpecificHomePhoto('USA','New York',async()=>response([state,wiki('New York City','United States of America')]));
  assert.equal(result.title,'New York City');
});
test('fast valid language is returned without waiting for the other language',async()=>{
  const result=await photoModule().resolveSpecificHomePhoto('Italia','Milano',async url=>url.includes('en.wikipedia')?new Promise(()=>{}):response([wiki('Milano','Italia')]));assert.equal(result.title,'Milano');
});
test('HTTP errors and empty providers return a bounded neutral result',async()=>{
  assert.equal(await photoModule().resolveSpecificHomePhoto('Italia','Milano',async()=>({ok:false,status:403})),null);
  assert.equal(await photoModule().resolveSpecificHomePhoto('Italia','Milano',async()=>{throw Error('offline')}),null);
});
test('only raster HTTPS URLs from existing Wikimedia image hosts are used',()=>{
  for(const value of ['javascript:alert(1)','https://upload.wikimedia.org.evil.test/a.jpg',image('Flag_of_Italy'),'https://upload.wikimedia.org/a.svg'])assert.equal(pure.safeHomePhotoUrl(value),'');
  assert.equal(pure.safeHomePhotoUrl(image('Milano_city')),image('Milano_city'));
});
test('Home API scope uses the new resolver and cache without changing legacy consumers',async()=>{
  const next={NextResponse:{json:(body,options)=>({body,status:options?.status||200,headers:options?.headers})}};
  const calls=[];const route=load('app/api/city-image/route.ts',{fetch:async()=>response([wiki('Milano','Italia')])},{'next/server':next,'../../../lib/home-photo-provider':{resolveSpecificHomePhoto:async(...args)=>{calls.push(args);return{image:image('Milano'),title:'Milano'}}}});
  const home=await route.GET(new Request('http://local/api/city-image?city=Milano&country=Italia&scope=home-v2'));
  assert.equal(home.body.image,image('Milano'));assert.equal(calls.length,1);assert.match(home.headers['Cache-Control'],/max-age=86400/);
  const legacy=await route.GET(new Request('http://local/api/city-image?city=Milano&country=Italia'));assert.equal(legacy.body.image,image('Milano'));assert.equal(calls.length,1);
});
test('country aliases embedded in destination text are removed without guessing another city',async()=>{
  const urls=[];const result=await photoModule().resolveSpecificHomePhoto('Stati Uniti','USA / New York',async url=>{urls.push(new URL(url));return response([wiki('New York City','United States')]);});
  assert.equal(result.title,'New York City');assert(urls.every(u=>u.searchParams.get('titles').split('|')[0]==='New York'));
});
test('Commons recovery searches only the same locality and skips a broken Wikipedia photo',async()=>{
  const calls=[];const result=await photoModule().resolveSpecificHomePhoto('Italia','Napoli',async url=>{calls.push(new URL(url));return response([{title:'File:Napoli waterfront',imageinfo:[{mime:'image/jpeg',thumburl:image('Napoli_waterfront'),extmetadata:{ImageDescription:{value:'Napoli, Italia'}}}]}]);},true);
  assert.equal(result.image,image('Napoli_waterfront'));assert.equal(calls.length,1);assert.equal(calls[0].hostname,'commons.wikimedia.org');assert.match(calls[0].searchParams.get('gsrsearch'),/Napoli/);
});
test('legacy country-thumbnail path can select a flag; Home-specific country-only path cannot',async()=>{
  const next={NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};
  const flag=wiki('USA','USA','Flag_of_USA');
  const route=load('app/api/city-image/route.ts',{fetch:async()=>response([flag])},{'next/server':next});
  assert.equal((await route.GET(new Request('http://local/api/city-image?country=USA'))).body.image,image('Flag_of_USA'));
  assert.equal((await route.GET(new Request('http://local/api/city-image?country=USA&scope=home-v2'))).body.image,null);
});
test('Retry-After supports seconds, HTTP dates and safe defaults without shortening waits',()=>{
  const now=Date.parse('2026-10-25T20:00:00Z');
  assert.equal(pure.photoRetryDelay('120',now),120000);
  assert.equal(pure.photoRetryDelay('Sun, 25 Oct 2026 20:03:00 GMT',now),180000);
  assert.equal(pure.photoRetryDelay(null,now),60000);assert.equal(pure.photoRetryDelay('invalid',now),60000);
});
test('429 blocks all Wikimedia hosts, fallback and queued work until Retry-After, with no automatic retry',async()=>{
  let now=100000,calls=0;const api=load('lib/home-photo-provider.ts',{Date:{now:()=>now,parse:Date.parse}});
  const transport=async()=>{calls++;return{ok:false,status:429,headers:{get:()=> '120'}}};
  await assert.rejects(api.resolveSpecificHomePhoto('Italia','Milano',transport),e=>e.retryAfterSeconds===120);
  assert.equal(calls,2,'only the two already-started languages are in flight; no Commons bypass');
  await assert.rejects(api.resolveSpecificHomePhoto('Italia','Napoli',transport),e=>e.retryAfterSeconds===120);
  await assert.rejects(api.resolveSpecificHomePhoto('Italia','Milano',transport,true));assert.equal(calls,2);
  now+=120001;
  const recovered=await api.resolveSpecificHomePhoto('Italia','Milano',async()=>response([wiki('Milano','Italia')]));assert.equal(recovered.title,'Milano');
});
test('server deduplicates equivalent concurrent destination resolutions',async()=>{
  const api=photoModule();let calls=0,resolve;
  const gate=new Promise(done=>resolve=done),transport=async()=>{calls++;await gate;return response([wiki('Milano','Italia')]);};
  const first=api.resolveSpecificHomePhoto('Italia','Milano',transport),same=api.resolveSpecificHomePhoto('italia','MILANO',transport);
  assert.equal(first,same);await Promise.resolve();assert.equal(calls,2);resolve();await Promise.all([first,same]);assert.equal(calls,2);
});
test('provider has at most three active requests across different destinations',async()=>{
  const api=photoModule();let active=0,peak=0;const releases=[];
  const transport=()=>new Promise(resolve=>{active++;peak=Math.max(peak,active);releases.push(()=>{active--;resolve(response([]));});});
  let complete=false;const all=Promise.all(['Milano','Napoli','Torino'].map(city=>api.resolveSpecificHomePhoto('Italia',city,transport))).then(()=>{complete=true;});
  while(!complete){await new Promise(r=>setImmediate(r));for(const release of releases.splice(0))release();}
  await all;assert.equal(peak,3);
});
test('Home API propagates 429 and Retry-After instead of caching it as a missing photograph',async()=>{
  const next={NextResponse:{json:(body,options)=>({body,status:options?.status||200,headers:options?.headers})}};
  const route=load('app/api/city-image/route.ts',{fetch:async()=>({ok:false,status:429,headers:{get:()=> '90'}})},{'next/server':next});
  const result=await route.GET(new Request('http://local/api/city-image?city=Milano&country=Italia&scope=home-v2'));
  assert.equal(result.status,429);assert.equal(result.headers['Retry-After'],'90');assert.equal(result.headers['Cache-Control'],'no-store');
});
test('multiple stops always use the first explicit locality, never the trip name or country',()=>{
  assert.equal(pure.primaryHomeDestination('Italia','Milano · Napoli · Roma').locality,'Milano');
  assert.equal(pure.primaryHomeDestination('Italia','Napoli · Milano').locality,'Napoli');
  assert.equal(pure.primaryHomeDestination('Italia',' · Milano'),null);
  assert.equal(pure.primaryHomeDestination('Italia','Italia · Milano'),null);
});
test('unscaled original PNG is not downloaded for a card; a sized same-city photo is selected',async()=>{
  const api=photoModule(),original={...wiki('Milano','Italia'),thumbnail:{source:'https://upload.wikimedia.org/wikipedia/commons/5/58/Milan.Proper.Wikipedia.Image.png'}};
  const result=await api.resolveSpecificHomePhoto('Italia','Milano',async url=>response(url.includes('commons.wikimedia')?[{title:'File:Milano skyline',imageinfo:[{mime:'image/jpeg',thumburl:image('Milano_skyline'),extmetadata:{ImageDescription:{value:'Milano, Italia'}}}]}]:[original]));
  assert.equal(result.image,image('Milano_skyline'));assert.equal(result.source,'Wikimedia Commons');
});
test('authoritative Wikipedia redirect allows a localized city name without accepting an unrelated title',async()=>{
  const api=photoModule();const result=await api.resolveSpecificHomePhoto('Italia','Milano',async url=>{
    if(url.includes('it.wikipedia'))return response([]);
    return{ok:true,json:async()=>({query:{redirects:[{from:'Milano',to:'Milan'}],pages:{1:wiki('Milan','Italy')}}})};
  });
  assert.equal(result.title,'Milan');assert.equal(result.image,image('Milan'));
});
