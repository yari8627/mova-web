// Actual Home React page/styles with an isolated account and mock GET routes.
// Photo selection is NOT tested here: delayed synthetic images use the original
// fixed photo-frame CSS. No .env, database, provider or real account is used.
// Run from app root; --baseline uses production 43d14e5. Serve Next on port 3193.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const source=process.cwd(),target=path.resolve('../nami-carousel013-browser'),baseline=process.argv.includes('--baseline');
const write=(file,text)=>{const dest=path.join(target,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);};
const read=file=>baseline?execFileSync('git',['show','43d14e5:'+file],{encoding:'utf8'}):fs.readFileSync(file,'utf8');
const copied=new Set();function copy(file){if(copied.has(file))return;copied.add(file);const text=read(file);write(file,text);for(const match of text.matchAll(/(?:from\s*|import\s*\(?)['"](\.[^'"]+)['"]/g)){const base=path.resolve(source,path.dirname(file),match[1]);const found=[base,...['.ts','.tsx','.css','.json'].map(ext=>base+ext)].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());if(found&&found.startsWith(source+path.sep))copy(path.relative(source,found).replaceAll('\\','/'));}}
for(const file of ['package.json','tsconfig.json','app/globals.css','app/page.tsx','app/components/app-bottom-nav.tsx'])copy(file);
if(!fs.existsSync(path.join(target,'node_modules')))fs.symlinkSync(fs.realpathSync('node_modules'),path.join(target,'node_modules'),'junction');
write('app/layout.tsx',`import './globals.css';import{AppBottomNav}from'./components/app-bottom-nav';import Diagnostics from './diagnostics';export const metadata={title:'NAMI carousel — LOCAL SYNTHETIC'};export const viewport={width:'device-width',initialScale:1,viewportFit:'cover'};export default function Layout({children}:{children:React.ReactNode}){return <html lang="it"><body>{children}<AppBottomNav/><Diagnostics/></body></html>}`);

// The startup callback still has to complete; use the real interface, locally.
const splashPath='app/components/nami-animated-splash.tsx';
write(splashPath,`"use client";import{useEffect,type ReactNode}from'react';export function NamiAnimatedSplash({ready,children,onComplete}:{ready:boolean;children?:ReactNode;onComplete?:()=>void}){useEffect(()=>{if(ready)onComplete?.();},[ready,onComplete]);return children}`);
write('app/components/home-trip-photo.tsx',`"use client";import{useEffect,useState}from'react';import styles from './home-trip-photo.module.css';export function HomeTripPhoto({kind}:{country:string;city:string;kind:'hero'|'trip'|'upcoming'|'completed'}){const[show,setShow]=useState(false);useEffect(()=>{const timer=setTimeout(()=>setShow(true),2400);return()=>clearTimeout(timer);},[]);return <div className={styles.photo+' '+styles[kind]} data-photo-state={show?'ready':'loading'}>{show&&<img className={styles.image} src="/fixture-photo" alt="Immagine sintetica"/>}</div>}`);
write('app/fixture-photo/route.ts',`export async function GET(){await new Promise(r=>setTimeout(r,500));return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="420" height="280"><rect width="420" height="280" fill="#c5a369"/><text x="24" y="140" fill="#102538" font-size="24">FOTO SINTETICA</text></svg>',{headers:{'Content-Type':'image/svg+xml'}})}`);
write('app/diagnostics.tsx',fs.readFileSync('scripts/home-carousel-diagnostics.fixture.tsx','utf8'));
write('app/api/auth/me/route.ts',`export async function GET(){return Response.json({user:{id:'carousel-fixture',name:'Fixture',email:'fixture@example.test'}})}`);
write('app/api/trips/route.ts',`export async function GET(request:Request){const count=Number(request.headers.get('referer')?.match(/cards=(\\d+)/)?.[1]||8);const date=(delta:number)=>new Date(Date.now()+delta*86400000).toISOString().slice(0,10);return Response.json(Array.from({length:count+2},(_,i)=>({id:'fixture-'+i,name:'Viaggio sintetico '+i,country:'Italia',city:'Milano',countryCode:'🇮🇹',startDate:date(i<2?i+20:-i-20),endDate:date(i<2?i+23:-i-17),people:2,theme:'sand'})))}`);
write('app/api/notifications/route.ts',`export async function GET(){return Response.json({notifications:[]})}`);
write('app/api/trips/[id]/route.ts',`export async function GET(_r:Request,{params}:{params:Promise<{id:string}>}){const{id}=await params;return Response.json({id,name:'Viaggio sintetico',country:'Italia',city:'Milano',startDate:'2099-01-01',endDate:'2099-01-02',owner:{id:'carousel-fixture'},accessRole:'owner',activities:[],participants:[],bookings:[],expenses:[],documents:[]})}`);
for(const endpoint of ['packing','overview','check-in'])write('app/api/trips/[id]/'+endpoint+'/route.ts',`export async function GET(){return Response.json({items:[],activities:[],participants:[],bookings:[],expenses:[],documents:[]})}`);
write('app/trips/[id]/overview/page.tsx',`export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;return <h1>Apertura sintetica: {id}</h1>}`);
console.log(target+' — '+(baseline?'BASELINE 43d14e5':'CURRENT')+' — Next dev on 127.0.0.1:3193; no real data.');
