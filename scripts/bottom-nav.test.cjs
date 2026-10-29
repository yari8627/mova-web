const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),SSR=require('react-dom/server');
const src=fs.readFileSync('app/components/app-bottom-nav.tsx','utf8'),css=fs.readFileSync('app/components/app-bottom-nav.module.css','utf8');
function harness(pathname='/') {
  const calls=[],ctx={exports:{},require:name=>name==='next/navigation'?{usePathname:()=>pathname,useRouter:()=>({push:p=>calls.push(p)})}:name.endsWith('.module.css')?{default:{nav:'fixture-nav'}}:require(name)};
  vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,ctx);
  return {calls,render:()=>ctx.exports.AppBottomNav(),setPath:p=>pathname=p};
}
const destinations=[['I Miei Viaggi','/'],['Progressi','/progress'],['Chi Siamo','/about'],['Profilo','/settings/profile']];
for(const [label,path]of destinations)test('one current destination on '+path,()=>{
  const h=harness(path),nav=h.render(),buttons=nav.props.children;
  assert.deepEqual(Array.from(buttons,b=>b.props.children[1].props.children),destinations.map(d=>d[0]));
  assert.equal(buttons.filter(b=>b.props['aria-current']==='page').length,1);
  assert.equal(buttons.find(b=>b.props['aria-current']==='page').props.children[1].props.children,label);
  for(let i=0;i<4;i++){buttons[i].props.onClick();assert.equal(h.calls.at(-1),destinations[i][1]);assert.equal(buttons[i].props.type,'button');}
});
test('trip details stay under My Trips; settings stay under Profile',()=>{
  for(const [path,label]of [['/trips/test/overview','I Miei Viaggi'],['/trips/test','I Miei Viaggi'],['/settings/security','Profilo']]){
    const nav=harness(path).render();assert.equal(nav.props.children.find(b=>b.props['aria-current']==='page').props.children[1].props.children,label);
  }
});
test('repeated taps and history-derived pathname never create two selections',()=>{
  const h=harness();for(const p of ['/progress','/about','/settings/profile','/about','/progress','/']){h.setPath(p);const b=h.render().props.children;assert.equal(b.filter(x=>x.props['aria-current']==='page').length,1);b[0].props.onClick();b[0].props.onClick();assert.equal(h.calls.at(-1),'/');}
});
for(const path of ['/auth','/auth/register','/forgot-password','/reset-password','/verify-email','/invite/test'])test('public route remains without nav: '+path,()=>assert.equal(harness(path).render(),null));
test('native keyboard buttons retain names; decorative icons are hidden',()=>{
  const nav=harness().render();assert.equal(nav.props['aria-label'],'Navigazione principale');
  for(const b of nav.props.children){assert.equal(b.props.children[0].props['aria-hidden'],'true');assert.equal(b.props.children[0].props.focusable,'false');assert.equal(b.props.tabIndex,undefined);}
  assert.match(SSR.renderToStaticMarkup(nav),/aria-current="page"/);
});
test('scoped styles reserve touch targets, focus, safe insets and no motion',()=>{
  assert.match(css,/min-height: 44px/);assert.match(css,/min-width: 44px/);assert.match(css,/:focus-visible/);
  for(const side of ['left','right','bottom'])assert.ok(css.includes('env(safe-area-inset-'+side+')'));
  assert.match(css,/transition: none/);assert.doesNotMatch(css,/animation\s*:|padding-bottom:\s*100/);
});
test('Boutique text and focus colors exceed WCAG AA on the light surface',()=>{
  const luminance=hex=>{const c=hex.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
  const surface=luminance('fffcf7');
  for(const ink of ['102538','56616a']){assert.ok(css.includes('#'+ink));assert.ok((surface+.05)/(luminance(ink)+.05)>=4.5);}
});
