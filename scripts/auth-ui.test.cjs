const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),SSR=require('react-dom/server');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
function harness(file='app/auth/page.tsx',{search='',token='fixture',reply,initialUser=null}={}){
 let cursor=0;const state=[],effects=[],calls=[],cache=new Map();
 const react={...require('react'),useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useEffect:fn=>effects.push(fn)};
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);
  const ctx={exports,URLSearchParams,window:{location:{search}},FormData:class{constructor(data){this.data=data;}get(key){return this.data[key]??null;}},
   fetch:async(url,options)=>{calls.push({url,options});return url==='/api/auth/me'?{json:async()=>({user:initialUser})}:reply?reply(url,options):{ok:true,json:async()=>({})};},
   require:name=>{
    if(name==='react')return react;
    if(name==='next/navigation')return{useRouter:()=>({push:url=>calls.push({push:url}),refresh:()=>calls.push({refresh:true})}),useParams:()=>({token})};
    if(name.endsWith('/progress-memory'))return{resetProgressMemory:()=>calls.push({reset:true})};
    if(name.endsWith('.module.css'))return{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
    if(name.startsWith('.')){const base=path.resolve(path.dirname(file),name);return load(fs.existsSync(base+'.tsx')?base+'.tsx':base+'.ts');}
    return require(name);
   }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,ctx);return exports;
 }
 const page=load(file),render=()=>{cursor=0;return page.default();};
 const find=predicate=>nodes(render()).find(predicate);
 return{render,find,state,calls,effects,html:()=>SSR.renderToStaticMarkup(render()),submit:data=>find(n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:data})};
}
test('login and registration keep Google next, autocomplete, required fields and password visibility',()=>{
 const h=harness(undefined,{search:'?next=%2Ftrips%2Ffixture'});
 assert.equal(h.find(n=>n.type==='a').props.href,'/api/auth/google?next=%2Ftrips%2Ffixture');
 const password=()=>h.find(n=>n.type==='input'&&n.props.name==='password');
 assert.equal(password().props.autoComplete,'current-password');assert.equal(password().props.minLength,8);assert(password().props.required);
 h.find(n=>n.props?.['aria-label']==='Mostra password').props.onClick();assert.equal(password().props.type,'text');
 h.find(n=>n.type==='button'&&n.props.children==='Registrati').props.onClick();
 assert.equal(password().props.autoComplete,'new-password');assert(h.find(n=>n.type==='input'&&n.props.name==='name').props.required);
 assert(!h.find(n=>n.props?.className==='forgot-password-link'));
 const html=h.html();assert(html.includes('NAMI'));assert(html.includes('TRAVEL'));assert(html.includes('/brand/google-g.png'));
});
for(const register of [false,true])test((register?'registration':'login')+' preserves request payload, loading and redirect',async()=>{
 let finish;const h=harness(undefined,{search:'?next=%2Ftrips%2Ffixture',reply:()=>new Promise(r=>finish=r)});
 if(register)h.find(n=>n.type==='button'&&n.props.children==='Registrati').props.onClick();
 const data={email:'guest@example.test',password:'synthetic-password',...(register?{name:'Test Guest'}:{})};
 const pending=h.submit(data);assert.equal(h.find(n=>n.type==='form').props['aria-busy'],true);assert(h.find(n=>n.props?.className==='primary-button auth-submit').props.disabled);
 const call=h.calls.find(c=>c.options);assert.equal(call.url,register?'/api/auth/register':'/api/auth/login');assert.deepEqual(JSON.parse(call.options.body),{name:register?'Test Guest':null,email:data.email,password:data.password});
 finish({ok:true,json:async()=>({})});await pending;
 assert(h.calls.some(c=>c.push==='/trips/fixture'));assert(h.calls.some(c=>c.refresh));assert.equal(h.find(n=>n.type==='form').props['aria-busy'],false);
});
test('login rejection and network failure retain the form and announce errors',async()=>{
 for(const reply of [async()=>({ok:false,json:async()=>({error:'Email o password non corretti.'})}),async()=>{throw Error('offline');}]){
  const h=harness(undefined,{reply});await h.submit({email:'guest@example.test',password:'synthetic-password'});
  assert(h.find(n=>n.props?.role==='alert'));assert(!h.find(n=>n.props?.className==='primary-button auth-submit').props.disabled);assert(!h.calls.some(c=>c.push));
 }
});
test('Google callback errors and an expired/absent session use the same accessible login shell',async()=>{
 const h=harness(undefined,{search:'?error=google_not_configured'});h.render();h.effects[0]();await tick();
 assert.match(h.find(n=>n.props?.role==='alert').props.children,/Google/);assert(h.find(n=>n.type==='form'));
 assert.equal(h.calls.filter(c=>c.url==='/api/auth/me').length,1);
});
test('signed-in auth page retains profile, verification, settings and logout actions',async()=>{
 const h=harness(undefined,{initialUser:{name:'Test Guest',email:'guest@example.test',emailVerified:false},reply:async()=>({ok:true,json:async()=>({previewUrl:'/verify-email/fixture'})})});h.render();h.effects[0]();await tick();
 for(const label of ['Verifica indirizzo email','Modifica profilo','Accesso e sicurezza','Preferenze notifiche','Gestione account'])assert(h.find(n=>n.type==='button'&&n.props.children===label));
 await h.find(n=>n.type==='button'&&n.props.children==='Verifica indirizzo email').props.onClick();assert(h.find(n=>n.props?.className==='security-preview-link'));
 await h.find(n=>n.type==='button'&&n.props.children==='Esci dall’account').props.onClick();assert(h.calls.some(c=>c.url==='/api/auth/logout'&&c.options.method==='POST'));assert(h.find(n=>n.type==='form'));
});
test('forgot password preserves generic response and development link without exposing account existence',async()=>{
 const message='Se l’email è registrata, riceverai le istruzioni per reimpostare la password.';
 const h=harness('app/forgot-password/page.tsx',{reply:async()=>({ok:true,json:async()=>({message,previewUrl:'/reset-password/fixture'})})});
 await h.submit({email:'guest@example.test'});assert.equal(h.calls[0].url,'/api/auth/forgot-password');assert.deepEqual(JSON.parse(h.calls[0].options.body),{email:'guest@example.test'});
 assert(h.find(n=>n.props?.role==='status').props.children.includes(message));h.find(n=>n.type==='button'&&n.props.children==='Apri link di sviluppo').props.onClick();assert.equal(h.calls.at(-1).push,'/reset-password/fixture');
});
for(const file of ['app/forgot-password/page.tsx','app/reset-password/[token]/page.tsx'])test(file+' loading/error feedback recovers from server and network errors',async()=>{
 for(const reply of [async()=>({ok:false,json:async()=>({error:'Link non valido o scaduto'})}),async()=>{throw Error('offline');}]){
  const h=harness(file,{reply});await h.submit({email:'guest@example.test',password:'synthetic-password'});
  assert(h.find(n=>n.props?.role==='alert'));assert(!h.find(n=>n.props?.className==='primary-button auth-submit').props.disabled);assert(!h.calls.some(c=>c.push));
 }
});
for(const file of ['app/forgot-password/page.tsx','app/reset-password/[token]/page.tsx'])test(file+' announces pending and disables the submit until the response',async()=>{
 let finish;const h=harness(file,{reply:()=>new Promise(r=>finish=r)});
 const pending=h.submit({email:'guest@example.test',password:'synthetic-password'});
 assert.equal(h.find(n=>n.type==='form').props['aria-busy'],true);assert(h.find(n=>n.props?.className==='primary-button auth-submit').props.disabled);assert(h.find(n=>n.props?.role==='status'));
 finish({ok:true,json:async()=>({message:'Istruzioni inviate'})});await pending;assert.equal(h.find(n=>n.type==='form').props['aria-busy'],false);
});
test('reset retains token, password validation, payload and return to auth',async()=>{
 const h=harness('app/reset-password/[token]/page.tsx');const field=h.find(n=>n.type==='input');assert.equal(field.props.autoComplete,'new-password');assert.equal(field.props.minLength,8);
 await h.submit({password:'synthetic-password'});assert.equal(h.calls[0].url,'/api/auth/reset-password');assert.deepEqual(JSON.parse(h.calls[0].options.body),{token:'fixture',password:'synthetic-password'});assert.equal(h.calls.at(-1).push,'/auth');
});
test('email verification preserves request, pending, success, expired-link and network feedback',async()=>{
 for(const mode of ['ok','expired','offline']){
  const h=harness('app/verify-email/[token]/page.tsx',{reply:async()=>{if(mode==='offline')throw Error('offline');return{ok:mode==='ok',json:async()=>({error:'Link non valido o scaduto'})};}});
  assert(h.find(n=>n.props?.['aria-busy']===true));h.effects[0]();await tick();
  assert.equal(h.calls[0].url,'/api/auth/verify-email');assert.deepEqual(JSON.parse(h.calls[0].options.body),{token:'fixture'});
  assert(h.find(n=>n.props?.role===(mode==='ok'?'status':'alert')));h.find(n=>n.type==='button').props.onClick();assert.equal(h.calls.at(-1).push,mode==='ok'?'/':'/auth');
 }
});
test('local shell keeps official wordmark, safe areas, 16px fields and visible focus without splash styling',()=>{
 const shell=fs.readFileSync('app/components/auth-shell.tsx','utf8'),css=fs.readFileSync('app/components/auth-shell.module.css','utf8');
 assert(shell.includes('<NamiWordmark />'));assert(!shell.includes('auth-brand'));assert.match(css,/min-height: 100dvh/);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/font-size: 16px/);assert.match(css,/:focus-visible/);assert(!css.includes('nami-animated-splash'));
});
