const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const transpile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function setup(){
 const nav={exports:{}};vm.runInNewContext(transpile('lib/trip-navigation.ts'),nav);
 const events={},slider={style:{setProperty(k,v){this[k]=v;}},setAttribute(){},removeAttribute(){}},root={clientWidth:375,addEventListener:(n,f)=>events[n]=f,removeEventListener(){}},timers=[],frames=[];let clock=0,refs=0,url=null;
 class Element{closest(){return null;}}const target=new Element();target.parentElement=root;
 const ctx={exports:{},Element,performance:{now:()=>clock},getComputedStyle:()=>({touchAction:'auto',overflowX:'visible'}),document:{querySelector:()=>null},requestAnimationFrame:f=>(frames.push(f),frames.length),cancelAnimationFrame(){},setTimeout:f=>(timers.push(f),timers.length),clearTimeout(){},window:{innerWidth:375,matchMedia:()=>({matches:false}),getSelection:()=>null,addEventListener(){},removeEventListener(){},history:{pushState:(_,__,u)=>url=u}},require(n){if(n==='react')return {useRef:()=>({current:refs++===0?root:slider}),useEffect:f=>f(),useLayoutEffect:f=>f()};if(n==='next/dynamic')return {default:()=>()=>null};if(n==='next/navigation')return {usePathname:()=>'/trips/abc/packing'};if(n.includes('trip-navigation'))return nav.exports;if(n.includes('trip-pane-path'))return {TripPanePath:{Provider:'provider'}};if(n==='react/jsx-runtime')return {jsx:()=>null,jsxs:()=>null};return {default:{}};}};
 vm.runInNewContext(transpile('app/components/trip-swipe-navigation.tsx'),ctx);ctx.exports.TripSwipeNavigation({tripId:'abc',children:null});
 function send(name,x,y,time){clock=time;events[name]({target,touches:name==='touchend'?[]:[{clientX:x,clientY:y}],changedTouches:[{clientX:x,clientY:y}],cancelable:true,preventDefault(){}});while(frames.length)frames.shift()();}
 return {send,slider,finish:()=>{while(timers.length)timers.shift()();},url:()=>url};
}
test('panel follows finger before release and changes URL only after settling',()=>{const h=setup();h.send('touchstart',250,200,0);h.send('touchmove',120,205,200);assert.equal(h.slider.style['--swipe-x'],'-130px');assert.equal(h.url(),null);h.send('touchend',120,205,220);assert.equal(h.slider.style['--swipe-x'],'-375px');assert.equal(h.url(),null);h.finish();assert.equal(h.url(),'/trips/abc');});
test('short drag returns to origin without navigation',()=>{const h=setup();h.send('touchstart',200,200,0);h.send('touchmove',175,201,200);h.send('touchend',175,201,400);h.finish();assert.equal(h.slider.style['--swipe-x'],'0px');assert.equal(h.url(),null);});
test('vertical scrolling never moves the panel',()=>{const h=setup();h.send('touchstart',200,200,0);h.send('touchmove',205,280,200);h.send('touchend',205,280,250);assert.equal(h.slider.style['--swipe-x'],'0px');assert.equal(h.url(),null);});
