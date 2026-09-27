const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const vm=require('node:vm');
const fs=require('node:fs');
const ctx={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/trip-navigation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,ctx);
const {swipeDestination:go,tripTabs}=ctx.exports;
const routes=tripTabs.map(t=>'/trips/abc'+(t.path?'/'+t.path:''));
test('all eight pages navigate in both directions without wrapping',()=>{routes.forEach((route,i)=>{assert.equal(go('abc',route,-100,10,250),routes[i+1]??null);assert.equal(go('abc',route,100,10,250),routes[i-1]??null);});});
test('vertical, short, diagonal and slow gestures do not navigate',()=>{for(const [x,y,t] of [[10,100,100],[40,0,100],[80,75,200],[100,0,1000]])assert.equal(go('abc',routes[2],x,y,t),null);});
test('settings and nested routes do not navigate between tabs',()=>{assert.equal(go('abc','/trips/abc/settings',100,0,200),null);assert.equal(go('abc','/trips/abc/documents/123',100,0,200),null);});

const {swipeCommit}=ctx.exports;
test('drag threshold scales with the screen and allows deliberate slow swipes',()=>{assert.equal(swipeCommit(2,8,-100,375,0),3);assert.equal(swipeCommit(2,8,-100,1000,0),null);assert.equal(swipeCommit(2,8,100,375,0),1);});
test('short flick commits only in the direction of release',()=>{assert.equal(swipeCommit(2,8,-45,375,-.8),3);assert.equal(swipeCommit(2,8,-45,375,.8),null);assert.equal(swipeCommit(2,8,-20,375,-2),null);});
test('short drags snap back and boundaries never wrap',()=>{assert.equal(swipeCommit(2,8,35,375,0),null);assert.equal(swipeCommit(0,8,180,375,0),null);assert.equal(swipeCommit(7,8,-180,375,0),null);});
