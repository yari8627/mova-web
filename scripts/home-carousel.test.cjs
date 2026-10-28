const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const{load}=require('./home-photo-harness.cjs');
function fixture({count=8,width=185.45,viewport=343,initial=0}={}){
 let cardWidth=width,clientWidth=viewport,scrollLeft=initial,resize,requested=null;const listeners=new Map(),requests=[],states=[];
 const cards=Array.from({length:count},(_,i)=>({getBoundingClientRect:()=>({left:13+i*(cardWidth+12)-scrollLeft,width:cardWidth})}));
 const element={clientLeft:0,get clientWidth(){return clientWidth;},get scrollWidth(){return Math.ceil(6+count*cardWidth+Math.max(0,count-1)*12);},get scrollLeft(){return scrollLeft;},getBoundingClientRect:()=>({left:10,width:clientWidth}),querySelectorAll:()=>cards,querySelector:()=>cards[0],
  addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),
  scrollTo:options=>{requested=options.left;requests.push(options);if(options.behavior==='instant')scrollLeft=options.left;},scrollBy:options=>{requested=scrollLeft+options.left;requests.push({left:requested,behavior:options.behavior});}};
 const window={matchMedia:()=>({matches:false})},getComputedStyle=()=>({columnGap:'12px',scrollPaddingInlineStart:'3px'});
 const globals={window,getComputedStyle,ResizeObserver:class{constructor(fn){resize=fn;}observe(){}disconnect(){resize=null;}}};
 const controller=fs.existsSync('lib/home-carousel.ts')?load('lib/home-carousel.ts',globals).createHomeCarousel(element,bounds=>states.push({...bounds})):null;
 return{element,controller,globals,requests,states,requested:()=>requested,settle(){if(requested!==null)scrollLeft=Math.min(Math.max(0,requested),Math.max(0,element.scrollWidth-clientWidth));listeners.get('scroll')?.();},
  swipe(value){listeners.get('pointerdown')?.();scrollLeft=value;listeners.get('scroll')?.();},resize(width,viewport,nativeScroll){cardWidth=width;clientWidth=viewport;if(nativeScroll!==undefined){scrollLeft=nativeScroll;listeners.get('scroll')?.();}resize?.();},listeners};
}
function actualHomeStep(h){
 const code=fs.readFileSync('app/page.tsx','utf8'),ast=ts.createSourceFile('page.tsx',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let node;
 function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='scrollCompleted')node=n;ts.forEachChild(n,visit);}visit(ast);assert(node);
 const context={...h.globals,completedCarousel:{current:h.element},completedCarouselController:{current:h.controller}};
 vm.runInNewContext(ts.transpileModule(node.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2021}}).outputText,context);return context.scrollCompleted;
}
test('actual Home: three rapid arrows advance three cards, not one in-flight relative step',()=>{
 const h=fixture(),step=actualHomeStep(h);step(1);step(1);step(1);assert(Math.abs(h.requested()-592.35)<1);h.controller?.destroy();
});
test('actual Home: reverse from the final clamped position does not skip the preceding card',()=>{
 const h=fixture({initial:1231}),step=actualHomeStep(h);step(-1);assert(Math.abs(h.requested()-1184.7)<1);h.controller?.destroy();
});
test('one card and cards fitting desktop cannot scroll beyond their boundaries',()=>{
 for(const options of [{count:1},{count:2,viewport:900}]){const h=fixture(options);h.controller.step(1);h.controller.step(-1);assert.equal(h.requested(),0);assert.deepEqual(h.states.at(-1),{previous:false,next:false});h.controller.destroy();}
});
test('two cards reach their clamped end with the last card fully visible, then return',()=>{
 const h=fixture({count:2});h.controller.step(1);h.settle();assert.equal(h.requested(),Math.max(0,h.element.scrollWidth-h.element.clientWidth));assert.equal(h.states.at(-1).next,false);h.controller.step(-1);h.settle();assert.equal(h.requested(),0);h.controller.destroy();
});
test('repeated forward/backward requests stay inside the first/last boundary',()=>{
 const h=fixture();for(let i=0;i<30;i++)h.controller.step(1);h.settle();assert.equal(h.requested(),1231);assert.equal(h.states.at(-1).next,false);
 for(let i=0;i<30;i++)h.controller.step(-1);h.settle();assert.equal(h.requested(),0);assert.equal(h.states.at(-1).previous,false);h.controller.destroy();
});
test('manual swipe cancels the old pending target; the next arrow uses the current card',()=>{
 const h=fixture();h.controller.step(1);h.controller.step(1);h.swipe(789.8);h.controller.step(1);assert(Math.abs(h.requested()-987.25)<1);h.controller.destroy();
});
test('rapid changes of direction use the requested destination, without losing input',()=>{
 const h=fixture();for(const d of [1,1,1,-1,1,-1])h.controller.step(d);assert(Math.abs(h.requested()-394.9)<1);h.controller.destroy();
});
test('resize preserves the destination using new geometry; image height changes do not reposition it',()=>{
 const h=fixture();h.controller.step(1);h.controller.step(1);h.settle();const before=h.requests.length;h.resize(185.45,343);assert.equal(h.requests.length,before);
 h.resize(210,700);assert(Math.abs(h.requested()-444)<1);assert.equal(h.requests.at(-1).behavior,'instant');h.controller.destroy();assert.equal(h.listeners.size,0);
});
test('Home/End share the same bounds and detach without timers',()=>{
 const h=fixture();h.controller.edge('end');h.settle();assert.equal(h.requested(),1231);h.controller.edge('start');h.settle();assert.equal(h.requested(),0);h.controller.destroy();
 assert(!fs.readFileSync('lib/home-carousel.ts','utf8').includes('setTimeout'));
});
test('reduced motion uses instant native positioning',()=>{
 const h=fixture();h.globals.window.matchMedia=()=>({matches:true});h.controller.step(1);assert.equal(h.requests.at(-1).behavior,'instant');h.controller.destroy();
});
test('Safari-style overscroll still resolves the first/last card without overshooting',()=>{
 const first=fixture({initial:-40});first.controller.step(1);assert(Math.abs(first.requested()-197.45)<1);first.controller.destroy();
 const last=fixture({initial:1271});last.controller.step(-1);assert(Math.abs(last.requested()-1184.7)<1);last.controller.destroy();
});
test('snapshot refresh of the same card identities does not recreate navigation intent',()=>{
 const page=fs.readFileSync('app/page.tsx','utf8');assert.match(page,/completedCarouselKey = JSON.stringify\(completedTrips.map\(trip => trip.id\)\)/);assert.match(page,/\[completedCarouselKey, currentUser\?\.id\]/);
});
test('snap alignment has no duplicate card margin and the arrows expose their boundaries',()=>{
 const css=fs.readFileSync('app/home.module.css','utf8'),page=fs.readFileSync('app/page.tsx','utf8');
 assert.match(css,/scroll-margin-inline:\s*0/);assert.match(page,/disabled=\{!completedBounds.previous\}/);assert.match(page,/disabled=\{!completedBounds.next\}/);
});

test('resize native re-snap before ResizeObserver preserves the previous card anchor',()=>{
 const h=fixture();for(let i=0;i<5;i++)h.controller.step(1);h.settle();h.resize(207.45,383,1316.8);assert(Math.abs(h.requested()-1097.25)<1);h.controller.destroy();
});