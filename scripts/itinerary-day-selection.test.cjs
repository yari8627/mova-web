const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('app/trips/[id]/page.tsx','utf8');

// Execute the actual page effect with browser geometry/events, not a second
// implementation of day selection. All days remain mounted, including empty days.
function selector({initialLeft=0,paneActive=true}={}){
 let left=initialLeft,selected=1,cleanup,legacy,flushes=0;const events=new Map(),windowEvents=new Map();
 const elements=[1,2,3].map(day=>({id:`itinerary-day-${day}`,getBoundingClientRect:()=>({left:16+(day-1)*330-left,width:320})}));
 const root={clientWidth:320,getBoundingClientRect:()=>({left:16,width:320}),querySelectorAll:()=>elements,
  addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name,fn)=>{if(events.get(name)===fn)events.delete(name);}};
 const effect=source.slice(source.lastIndexOf('  useEffect(() => {',source.indexOf('  function toggleActivity')),source.indexOf('  function toggleActivity'));
 const context={paneActive,trip:{id:'fixture'},activities:[],itineraryDaysRef:{current:root},setActiveDay:value=>selected=value,
  useEffect:fn=>cleanup=fn(),flushSync:fn=>{flushes++;fn();},window:{addEventListener:(name,fn)=>windowEvents.set(name,fn),removeEventListener:name=>windowEvents.delete(name)},
  document:{querySelectorAll:()=>elements},IntersectionObserver:class{constructor(fn){legacy=fn;}observe(){}disconnect(){}}};
 vm.runInNewContext(ts.transpileModule(effect,{compilerOptions:{target:ts.ScriptTarget.ES2021}}).outputText,context);
 return{move(value,changedDay){left=value;if(events.has('scroll'))events.get('scroll')();else legacy?.([{isIntersecting:true,intersectionRatio:.56,target:elements[changedDay-1]}]);},
  resize(){windowEvents.get('resize')?.();},read:()=>selected,flushes:()=>flushes,cleanup:()=>cleanup?.(),events};
}

test('partial observer entries cannot select an old day instead of the currently visible day',()=>{
 const s=selector();s.move(330,2);assert.equal(s.read(),2);
 // An outgoing tall/short section may cross an IO area threshold while day 2
 // remains the visible horizontal page. Legacy code selects that outgoing day.
 s.move(330,1);assert.equal(s.read(),2);s.cleanup();
});
test('1 → 2 (empty) → 1 follows the visible page, independent of section heights',()=>{
 const s=selector();for(const day of [1,2,1]){s.move((day-1)*330,day);assert.equal(s.read(),day);}s.cleanup();
});
test('rapid interrupted scrolls always select exactly the nearest visible day',()=>{
 const s=selector();for(const [offset,day] of [[80,1],[190,2],[550,3],[350,2],[0,1],[660,3],[330,2]]){
  s.move(offset,1);assert.equal(s.read(),day);
 }s.cleanup();assert.equal(s.events.size,0);
});
test('resizing and remount initialization synchronize the current geometry',()=>{
 const s=selector({initialLeft:660});assert.equal(s.read(),3);s.resize();assert.equal(s.read(),3);s.cleanup();
});
test('native scroll commits a changed selection synchronously, without repeated commits within the same day',()=>{
 const s=selector();assert.equal(s.flushes(),0);s.move(330,2);assert.equal(s.read(),2);assert.equal(s.flushes(),1);
 s.move(331,2);s.move(332,2);assert.equal(s.flushes(),1);s.move(0,1);assert.equal(s.flushes(),2);s.cleanup();
});
test('inactive panes do not listen to another section scroll or change their selection',()=>{
 const s=selector({paneActive:false});assert.equal(s.events.size,0);s.move(660,3);assert.equal(s.read(),1);s.cleanup();
});
test('tap and automatic positioning do not optimistically select a page before it is visible',()=>{
 assert.equal((source.match(/setActiveDay\(/g)||[]).length,1);
 assert.match(source,/aria-pressed=\{activeDay === day\}/);
 assert.match(source,/aria-controls=\{`itinerary-day-\$\{day\}`\}/);
});
test('day buttons opt out of global color interpolation and touch flash, preserving keyboard focus',()=>{
 const css=fs.readFileSync('app/trips/[id]/itinerary.module.css','utf8');
 const rule=css.match(/\.itinerary :global\(\.itinerary-day-nav button\) \{([^}]+)\}/)[1];
 assert.match(rule,/transition:\s*none/);assert.match(rule,/-webkit-tap-highlight-color:\s*transparent/);
 assert.match(css,/:focus-visible\).*outline: 2px solid/);
});
