// Read-only, sequential validation. Stop at the first real 429; no retries.
const fs=require('node:fs'),{performance}=require('node:perf_hooks');
const {load}=require('./home-photo-harness.cjs');
(async()=>{
 const only=process.argv[2],suffix=only?'-recheck':'';
 const api=load('lib/home-photo-provider.ts'),report={conditions:'Node desktop; public metadata and photo downloads; four serial destinations, 6s spacing; no login, credentials, proxy rotation or automatic retries',cases:[],requests:[]};
 fs.mkdirSync('home-0042-photos',{recursive:true});let stopped=false;
 for(const [index,[country,city]]of [['Norvegia','Tromsø'],['Italia','Milano'],['Italia','Napoli'],['Stati Uniti','New York']].entries()){
  if(only && city!==only)continue;
  if(stopped){report.cases.push({country,city,status:'NOT_COMPLETED_PROVIDER_429'});continue;}
  if(index)await new Promise(r=>setTimeout(r,6000));
  const outstanding=[];
  const transport=(url,options)=>{const work=(async()=>{
   if(stopped)throw Error('Stopped after rate limit');
   const start=performance.now(),response=await fetch(url,options);
   const record={city,provider:new URL(url).hostname,status:response.status,retryAfter:response.headers.get('retry-after'),elapsedMs:Math.round(performance.now()-start)};
   if(response.status===429){stopped=true;record.errorBody=(await response.clone().text()).slice(0,1800);}
   if(response.ok){const value=await response.clone().json();record.redirects=value.query?.redirects;record.pages=Object.values(value.query?.pages||{}).filter(p=>p.thumbnail||p.imageinfo).map(p=>({title:p.title,pageimage:p.pageimage,coordinates:p.coordinates,description:p.extract,thumbnail:p.thumbnail,imageinfo:p.imageinfo}));}
   report.requests.push(record);return response;
  })();outstanding.push(work);return work;};
  const start=performance.now(),row={country,city};
  try{row.photo=await api.resolveSpecificHomePhoto(country,city,transport);row.status=row.photo?'PHOTO_RESOLVED':'NO_VERIFIED_PHOTO';}
  catch(error){row.status=error.retryAfterSeconds?'NOT_COMPLETED_PROVIDER_429':'RESOLUTION_ERROR';row.retryAfterSeconds=error.retryAfterSeconds;}
  await Promise.allSettled(outstanding);row.lookupMs=Math.round(performance.now()-start);
  if(row.photo){try{const response=await fetch(row.photo.image,{signal:AbortSignal.timeout(15000)});row.downloadStatus=response.status;if(response.status===429){stopped=true;row.downloadRetryAfter=response.headers.get('retry-after');}if(response.ok){const bytes=Buffer.from(await response.arrayBuffer());row.file=`home-0042-photos/${index}${suffix}.jpg`;row.bytes=bytes.length;fs.writeFileSync(row.file,bytes);}}catch{row.downloadStatus='FAILED';}}
  report.cases.push(row);fs.writeFileSync(`home-0042-live-validation${suffix}.json`,JSON.stringify(report,null,2));
 }
 fs.writeFileSync(`home-0042-live-validation${suffix}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({cases:report.cases,requests:report.requests.map(({pages,...rest})=>rest)},null,2));
})().catch(error=>{console.error(error.name);process.exitCode=1;});
