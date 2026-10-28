// Actual Home and CSS; isolated synthetic account/GETs. No .env or real provider.
// node scripts/home-countdown-browser-fixture.cjs; serve generated app on 3196.
const fs = require('node:fs'), path = require('node:path');
const root = process.cwd(), target = path.resolve('../nami-countdown010-browser');
const write = (file, text) => { const dest = path.join(target,file); fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(dest,text); };
const copied = new Set();
function copy(file) {
  if (copied.has(file)) return; copied.add(file);
  const text = fs.readFileSync(file,'utf8'); write(file,text);
  for (const match of text.matchAll(/(?:from\s*|import\s*\(?)['"](\.[^'"]+)['"]/g)) {
    const base = path.resolve(root,path.dirname(file),match[1]);
    const found = [base,...['.ts','.tsx','.css','.json'].map(ext=>base+ext)].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
    if (found && found.startsWith(root+path.sep)) copy(path.relative(root,found));
  }
}
for (const file of ['package.json','tsconfig.json','app/page.tsx','app/globals.css','app/components/app-bottom-nav.tsx']) copy(file);
if (!fs.existsSync(path.join(target,'node_modules'))) fs.symlinkSync(fs.realpathSync('node_modules'),path.join(target,'node_modules'),'junction');
write('app/layout.tsx', `import './globals.css';import{AppBottomNav}from'./components/app-bottom-nav';export const metadata={title:'NAMI countdown — SYNTHETIC LOCAL'};export const viewport={width:'device-width',initialScale:1,viewportFit:'cover'};export default function Layout({children}:{children:React.ReactNode}){return <html lang="it"><body>{children}<AppBottomNav/></body></html>}`);
write('app/components/nami-animated-splash.tsx', `"use client";import{useEffect,type ReactNode}from'react';export function NamiAnimatedSplash({ready,children,onComplete}:{ready:boolean;children?:ReactNode;onComplete?:()=>void}){useEffect(()=>{if(ready)onComplete?.()},[ready,onComplete]);return children}`);
write('app/components/home-trip-photo.tsx', `import styles from'./home-trip-photo.module.css';export function HomeTripPhoto({kind}:{country:string;city:string;kind:'hero'|'trip'|'upcoming'|'completed'}){return <div className={styles.photo+' '+styles[kind]} style={{background:'#c5a369'}}/>}`);
write('app/api/auth/me/route.ts', `export async function GET(){return Response.json({user:{id:'countdown-fixture',name:'Fixture',email:'fixture@example.test'}})}`);
write('app/api/notifications/route.ts', `export async function GET(){return Response.json({notifications:[]})}`);
write('app/api/trips/route.ts', `export async function GET(request:Request){const scenario=new URL(request.headers.get('referer')||'http://localhost').searchParams.get('scenario')||'completed';const date=(offset:number)=>{const n=new Date();n.setDate(n.getDate()+offset);return [n.getFullYear(),String(n.getMonth()+1).padStart(2,'0'),String(n.getDate()).padStart(2,'0')].join('-')};const offsets:Record<string,number[]>={completed:[-8,-1],future:[5,8],tomorrow:[1,3],today:[0,2],active:[-2,2],last:[-2,0]};const [start,end]=offsets[scenario]||offsets.completed;return Response.json([{id:'countdown-trip',name:'Viaggio sintetico '+scenario,country:'Italia',countryCode:'🇮🇹',city:'Milano',startDate:date(start),endDate:date(end),people:2,theme:'sand'}])}`);
write('app/api/trips/[id]/route.ts', `export async function GET(){return Response.json({id:'countdown-trip',owner:{id:'countdown-fixture'},startDate:'2020-01-01',endDate:'2020-01-02',activities:[],participants:[],bookings:[],documents:[],expenses:[]})}`);
for (const name of ['packing','check-in']) write('app/api/trips/[id]/'+name+'/route.ts', `export async function GET(){return Response.json(${name==='packing'?'[]':'{completed:false,returnCompleted:false}'})}`);
console.log(target+' — 127.0.0.1:3196, ?scenario=completed|future|tomorrow|today|active|last');
