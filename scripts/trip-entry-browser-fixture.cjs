// Isolated localhost fixture: actual Home, trip panes and routing; synthetic GETs.
// No .env, database, authentication credentials or external photographic provider.
const fs = require('node:fs'), path = require('node:path');
const source = process.cwd(), target = path.resolve('../nami-bug012-browser');
const write = (file, text) => { const dest = path.join(target, file); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, text); };
const copied = new Set();
function copy(file) {
  if (copied.has(file)) return; copied.add(file);
  const text = fs.readFileSync(file, 'utf8'); write(file, text);
  for (const m of text.matchAll(/(?:from\s*|import\s*\(?)['"](\.[^'"]+)['"]/g)) {
    const base = path.resolve(source, path.dirname(file), m[1]);
    const found = [base, ...['.ts', '.tsx', '.css', '.json'].map(ext => base + ext)].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
    if (found && found.startsWith(source + path.sep)) copy(path.relative(source, found).replaceAll('\\', '/'));
  }
}
for (const file of ['package.json', 'tsconfig.json', 'app/globals.css', 'app/page.tsx', 'app/components/app-bottom-nav.tsx', 'app/components/trip-swipe-navigation.tsx']) copy(file);
if (!fs.existsSync(path.join(target, 'node_modules'))) fs.symlinkSync(fs.realpathSync('node_modules'), path.join(target, 'node_modules'), 'junction');
write('app/layout.tsx', `import './globals.css';import {AppBottomNav} from './components/app-bottom-nav';import Diagnostics from './entry-diagnostics';export const metadata={title:'NAMI BUG-012 — SYNTHETIC LOCAL'};export const viewport={width:'device-width',initialScale:1,viewportFit:'cover'};export default function Layout({children}:{children:React.ReactNode}){return <html lang="it"><body>{children}<AppBottomNav/><Diagnostics/></body></html>}`);
write('app/trips/[id]/layout.tsx', `import{TripSessionProvider}from'../../components/trip-session';import{TripSwipeNavigation}from'../../components/trip-swipe-navigation';export default async function Layout({children,params}:{children:React.ReactNode;params:Promise<{id:string}>}){const{id}=await params;return <TripSessionProvider userId="entry-fixture"><TripSwipeNavigation tripId={id}>{children}</TripSwipeNavigation></TripSessionProvider>}`);
write('app/components/nami-animated-splash.tsx', `"use client";import{useEffect,type ReactNode}from'react';export function NamiAnimatedSplash({ready,children,onComplete}:{ready:boolean;children?:ReactNode;onComplete?:()=>void}){useEffect(()=>{if(ready)onComplete?.();},[ready,onComplete]);return children}`);
write('app/components/home-trip-photo.tsx', `"use client";import{useEffect,useState}from'react';import styles from'./home-trip-photo.module.css';export function HomeTripPhoto({kind}:{country:string;city:string;kind:'hero'|'trip'|'upcoming'|'completed'}){const[ready,setReady]=useState(false);useEffect(()=>{const timer=setTimeout(()=>setReady(true),2200);return()=>clearTimeout(timer)},[]);return <div className={styles.photo+' '+styles[kind]}>{ready&&<img className={styles.image} src="/fixture-photo" alt="FOTO SINTETICA"/>}</div>}`);
write('app/fixture-photo/route.ts', `export async function GET(){return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300"><rect width="500" height="300" fill="#c5a369"/><text x="30" y="150" fill="#102538" font-size="24">FOTO SINTETICA</text></svg>',{headers:{'Content-Type':'image/svg+xml'}})}`);
const tripFactory = `const date=(offset:number)=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);const make=(id:string)=>{const active=id==='fixture-1',future=id==='fixture-0',n=Number(id.split('-')[1])||0;return{id,name:(active?'In corso':future?'Futuro':'Concluso')+' sintetico '+n,country:'Italia',countryCode:'🇮🇹',city:'Milano',theme:'sand',people:2,startDate:date(active?-1:future?20:-n-20),endDate:date(active?2:future?23:-n-17),budget:null,owner:{id:'entry-fixture'},accessRole:'owner',activities:[],bookings:[],documents:[],expenses:[],participants:[]}};`;
write('app/api/auth/me/route.ts', `export async function GET(){return Response.json({user:{id:'entry-fixture',name:'Fixture',email:'fixture@example.test'}})}`);
write('app/api/trips/route.ts', tripFactory + `export async function GET(){return Response.json(Array.from({length:10},(_,i)=>make('fixture-'+i)))}`);
write('app/api/trips/[id]/route.ts', tripFactory + `export async function GET(_r:Request,{params}:{params:Promise<{id:string}>}){return Response.json(make((await params).id))}`);
write('app/api/notifications/route.ts', `export async function GET(){return Response.json({notifications:[]})}`);
for (const endpoint of ['packing', 'check-in']) write('app/api/trips/[id]/' + endpoint + '/route.ts', `export async function GET(){return Response.json(${endpoint === 'packing' ? '[]' : '{completed:false,returnCompleted:false}'})}`);
write('app/api/packing-template/route.ts', `export async function GET(){return Response.json([])}`);
write('app/api/weather/route.ts', `export async function GET(){return Response.json({days:[]})}`);
write('app/api/places/route.ts', `export async function GET(){return Response.json([])}`);
write('app/entry-diagnostics.tsx', fs.readFileSync('scripts/trip-entry-diagnostics.fixture.tsx', 'utf8'));
console.log(target + ' — serve Next dev on 127.0.0.1:3194; synthetic only');
