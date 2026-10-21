// Local read-only browser fixture, never used by the application or a deploy.
// Start a production build on 127.0.0.1:3134, then this proxy on localhost:3135.
// No real sessions/database: 35 synthetic visits. Later GETs are held to test SWR.
const http=require('node:http');
const {countries}=require('countries-list');
const scope='11111111-1111-4111-8111-111111111111';
const visits=Object.keys(countries).slice(0,35).map((countryCode,i)=>({id:countryCode,countryCode,visitedAt:'2026-10-01T00:00:00.000Z',source:['manual','position','trip'][i%3]}));
let gets=0,completed=0,releaseFuture=false;const held=new Set();
function send(response){if(response.destroyed)return;response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Nami-Progress-Scope':scope,'X-Nami-Progress-Owner':'a'.repeat(64),'X-Nami-Progress-Expiry':new Date(Date.now()+600000).toISOString()});response.end(JSON.stringify(visits));completed++;}
http.createServer((request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  if(pathname==='/_nami_test/status'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({gets,completed,held:held.size}));return;}
  if(pathname==='/_nami_test/cleanup'){response.setHeader('Set-Cookie','nami_progress_scope=; Path=/; Max-Age=0; SameSite=Lax');response.end('Fixture marker removed');return;}
  if(pathname==='/_nami_test/release'){releaseFuture=true;for(const pending of held)send(pending);held.clear();response.end('released');return;}
  if(request.method!=='GET'&&request.method!=='HEAD'){response.writeHead(405);response.end('Read-only fixture');return;}
  if(pathname==='/api/progress'){
    gets++;if(releaseFuture)send(response);else if(gets===1)setTimeout(()=>send(response),350);else{held.add(response);response.on('close',()=>held.delete(response));}return;
  }
  if(pathname==='/api/auth/me'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({user:null}));return;}
  const upstream=http.request({hostname:'127.0.0.1',port:3134,path:request.url,method:request.method,headers:{...request.headers,host:'localhost:3135'}},result=>{response.writeHead(result.statusCode,result.headers);result.pipe(response);});
  upstream.on('error',()=>{response.writeHead(502);response.end('Local build unavailable');});request.pipe(upstream);
}).listen(3135,'localhost',()=>console.log('Read-only fixture: http://localhost:3135/progress'));
