// Local browser fixture: real Participants UI and synthetic routes only.
// No .env, database, external email, or real invitations.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const target = path.resolve(process.argv[2] || '../nami-ux016-browser');
let base = fs.readFileSync('scripts/trip-entry-browser-fixture.cjs', 'utf8');
const marker = "path.resolve('../nami-bug012-browser')";
if (!base.includes(marker)) throw Error('Base fixture target changed');
base = base.replace(marker, JSON.stringify(target));
vm.runInThisContext('(function(require){' + base + '})')(require);
const write = (file, content) => { const dest = path.join(target, file); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, content); };
write('app/components/modal-scroll-lock.tsx', fs.readFileSync('app/components/modal-scroll-lock.tsx', 'utf8'));
write('app/layout.tsx', `import './globals.css';import{AppBottomNav}from'./components/app-bottom-nav';import{ModalScrollLock}from'./components/modal-scroll-lock';export const metadata={title:'NAMI UX016 — LOCAL SYNTHETIC'};export const viewport={width:'device-width',initialScale:1,viewportFit:'cover'};export default function Layout({children}:{children:React.ReactNode}){return <html lang="it"><body><ModalScrollLock/>{children}<AppBottomNav/></body></html>}`);
write('app/api/trips/[id]/access/route.ts', `export async function GET(){return Response.json({role:'owner',userId:'entry-fixture',userName:'Fixture'})}`);
write('app/api/trips/[id]/route.ts', `export async function GET(_r:Request,{params}:{params:Promise<{id:string}>}){const{id}=await params;return Response.json({id,name:'Viaggio sintetico UX016',country:'Italia',countryCode:'🇮🇹',city:'Milano',theme:'sand',startDate:'2099-01-01',endDate:'2099-01-04',people:2,owner:{id:'entry-fixture',name:'Fixture',email:'fixture@example.test'},accessRole:'owner',activities:[],bookings:[],documents:[],expenses:[],participants:[{id:'carol',name:'Carolina',email:'carol@example.test',role:'participant',status:'pending'}]})}`);
write('app/fixture-state.ts', `const root=globalThis as typeof globalThis & {__ux016Events?:{suggestionGets:number;invitePosts:number}};export const events=root.__ux016Events??={suggestionGets:0,invitePosts:0};`);
write('app/api/travel-companions/route.ts', `import{events}from'../../fixture-state';export async function GET(r:Request){events.suggestionGets++;return Response.json({userId:'entry-fixture',tripId:new URL(r.url).searchParams.get('tripId'),contacts:[{name:'Alice Rossi',email:'alice@example.test'},{name:'Alessandro Bianchi',email:'alessandro@example.test'},{name:'',email:'bob@example.test'},{name:'Carolina',email:'carol@example.test'}]})}`);
write('app/api/trips/[id]/invites/route.ts', `import{events}from'../../../../fixture-state';export async function POST(r:Request){events.invitePosts++;const b=await r.json();return Response.json({userId:'entry-fixture',participant:{id:'fake-invited',name:'Persona sintetica',email:b.email,role:b.role,status:'pending'},code:'NAMI-SYNTHETIC',link:'/invite/NAMI-SYNTHETIC'},{status:201})}`);
write('app/fixture-events/route.ts', `import{events}from'../fixture-state';export async function GET(){return Response.json(events)}`);
console.log('UX016 ready: '+target+'; serve next dev --hostname 127.0.0.1 --port 3216.');
