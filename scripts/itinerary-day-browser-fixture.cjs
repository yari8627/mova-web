// Local-only browser regression using the actual Itinerary React page/styles.
// Reuses existing isolated API mocks. No production database or writes.
// Run from the app root, then run Next dev in the printed fixture directory.
const fs=require('node:fs'),path=require('node:path');
require('./itinerary-first-load-fixture.cjs');
const root=path.resolve('../nami-perf0056-browser');
const write=(file,text)=>fs.writeFileSync(path.join(root,file),text);
const trip='app/api/trips/[id]/route.ts';
write(trip,fs.readFileSync(path.join(root,trip),'utf8').replace('2027-01-02T12:00:00Z','2027-01-03T12:00:00Z'));
write('app/day-check.tsx',`"use client";
import {useState} from 'react';
export default function DayCheck(){
 const [result,setResult]=useState('Not run');
 async function run(){
  setResult('Running');
  const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('.itinerary-day-nav button'));
  const container=document.querySelector<HTMLElement>('.itinerary-days')!;
  const sections=Array.from(container.querySelectorAll<HTMLElement>('.itinerary-day'));
  const failures:Array<unknown>=[],settled:Array<unknown>=[];let frames=0,running=true;
  const checkSettled=()=>{
   const left=container.getBoundingClientRect().left;
   const visible=sections.reduce((a,b)=>Math.abs(a.getBoundingClientRect().left-left)<=Math.abs(b.getBoundingClientRect().left-left)?a:b);
   const selected=buttons.find(b=>b.classList.contains('active'));
   const matches=selected?.getAttribute('aria-controls')===visible.id;
   settled.push({visible:visible.id,matches});if(!matches)failures.push({settled:visible.id});
  };
  const sample=()=>{
   frames++;const selected=buttons.filter(b=>b.classList.contains('active'));
   const left=container.getBoundingClientRect().left;
   const visible=sections.reduce((a,b)=>Math.abs(a.getBoundingClientRect().left-left)<=Math.abs(b.getBoundingClientRect().left-left)?a:b);
   const colors=buttons.map(b=>getComputedStyle(b).backgroundColor);
   // During native compositor scrolling, two days can straddle the viewport;
   // assert settled alignment separately, and single selection/colors each frame.
   if(selected.length!==1||colors.some(c=>!['rgb(16, 37, 56)','rgb(255, 252, 247)'].includes(c)))failures.push({frame:frames,selected:selected.map(b=>b.textContent),visible:visible.id,colors});
   if(running)requestAnimationFrame(sample);
  };
  const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
  buttons[0].click();await wait(700);requestAnimationFrame(sample);
  for(const index of [1,0,2,0,1,2,0]){buttons[index].click();await wait(45);}
  await wait(800);checkSettled();
  for(const index of [1,0]){buttons[index].click();await wait(700);checkSettled();}
  running=false;
  const styles=getComputedStyle(buttons[0]);
  setResult(JSON.stringify({viewport:innerWidth,frames,failures,settled,transition:styles.transitionDuration,selected:buttons.findIndex(b=>b.classList.contains('active'))+1,overflow:document.documentElement.scrollWidth>innerWidth,photos:document.querySelectorAll('[data-place-photo-state="ready"]').length},null,2));
 }
 return <section style={{padding:8,background:'#fff'}}><button onClick={run}>Run day regression</button><pre id="day-result" style={{whiteSpace:'pre-wrap',fontSize:11}}>{result}</pre></section>;
}`);
const layout='app/layout.tsx';
write(layout,fs.readFileSync(path.join(root,layout),'utf8').replace("import Harness from './fixture-harness';","import Harness from './fixture-harness';import DayCheck from './day-check';").replace('<body><Harness>','<body><DayCheck/><Harness>'));
console.log('Day selector fixture: 3 days, day 1 populated, days 2/3 empty. Browser action: Run day regression.');
