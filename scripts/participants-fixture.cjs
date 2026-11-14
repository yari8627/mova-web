const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), SSR = require('react-dom/server');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const people = [
  { id: 'owner-alice', name: 'Alice', email: 'alice@example.test', role: 'owner', status: 'confirmed' },
  { id: 'bob', name: 'Bob', email: 'bob@example.test', role: 'co-organizer', status: 'confirmed' },
  { id: 'carol', name: 'Carol', email: 'carol@example.test', role: 'participant', status: 'pending' }
];
function harness({ role = 'owner', members = people, syncOK = true, inviteOK = true, deferred = false, source, lagMs = 0 } = {}) {
  const state = [members, undefined, null, false, false, '', ''], calls = [], storage = new Map();
  let cursor = 0, refCursor = 0, release;
  const refs = [];
  const context = { exports: {}, console, AbortController, setTimeout, clearTimeout, crypto: require('node:crypto'), CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } };
  const localStorage = { setItem: (k,v) => storage.set(k,v), getItem: k => storage.get(k) || null };
  context.localStorage = localStorage;
  context.window = { localStorage, location: { origin: 'https://nami.example.test' }, dispatchEvent: e => calls.push({ event: e.type }), setTimeout() {} };
  context.navigator = { clipboard: { writeText: async value => calls.push({ copied: value }) } };
  context.fetch = async (url, options) => {
    calls.push({ url, options });
    if (deferred) await new Promise(resolve => { release = resolve; });
    if (lagMs) await new Promise(resolve => setTimeout(resolve, lagMs));
    const body = JSON.parse(options.body);
    return { ok: inviteOK, status: inviteOK ? 201 : 400, json: async () => inviteOK ? { userId: 'alice', participant: { id: 'invited', name: 'Invitato', email: body.email, role: body.role, status: 'pending' }, code: 'NAMI-TEST', link: '/invite/NAMI-TEST' } : { error: 'Invito non valido' } };
  };
  context.require = name => {
    if (name === 'react') return { useEffect() {}, useRef: initial => { const i = refCursor++; return refs[i] || (refs[i] = { current: initial }); }, useState: initial => { const i = cursor++; if (state[i] === undefined) state[i] = initial; return [state[i], value => state[i] = value]; } };
    if (name.endsWith('/invite-submission')) { const helper = { ...context, exports: {} }; vm.runInNewContext(compile(fs.readFileSync('lib/invite-submission.ts', 'utf8')), helper); return helper.exports; }
    if (name.endsWith('/progress-cache-contract')) return { PROGRESS_SCOPE_COOKIE: 'nami_progress_scope' };
    if (name === 'next/navigation') return { useParams: () => ({ id: 'trip' }), useRouter: () => ({ push() {} }) };
    if (name.endsWith('/use-trip-permissions')) return { useTripPermissions: () => ({ canInvite: role === 'owner' || role === 'co-organizer', canAssignRoles: role === 'owner' }) };
    if (name.endsWith('/trip-session')) return { useTripUserId: () => 'alice' };
    if (name.endsWith('/trip-client-cache')) return { removeTripSnapshot() {}, fetchTripSnapshot: async () => null };
    if (name.endsWith('/page-cache')) return { readPageCache: () => null, writePageCache: (...args) => calls.push({ cache: args }) };
    if (name.endsWith('/trip-sync')) return { syncTripResource: async (...args) => { calls.push({ sync: args }); return syncOK; } };
    if (name.endsWith('/trip-header')) return { TripHeader: () => null };
    if (name.endsWith('/trip-cover')) return { TripCover: () => null };
    if (name.endsWith('/trip-tabs')) return { TripTabs: () => null };
    // The field has its own hook/DOM regressions; retain page submission tests.
    if (name === './invite-contact-field') return { InviteContactField: props => require('react/jsx-runtime').jsx('input', { type: 'email', required: true, disabled: props.disabled || !props.enabled, value: props.value, onChange: event => props.onChange(event.target.value) }) };
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    return require(name);
  };
  vm.runInNewContext(compile(source || fs.readFileSync('app/trips/[id]/participants/page.tsx', 'utf8')), context);
  const render = () => { cursor = 0; refCursor = 0; return context.exports.default(); };
  return { state, calls, render, release: () => release(), html: () => SSR.renderToStaticMarkup(render()) };
}
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...(typeof n.type === 'function' ? nodes(n.type(n.props)) : []), ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const find = (h, predicate) => nodes(h.render()).find(predicate);
const flush = () => new Promise(resolve => setImmediate(resolve));
module.exports = { harness, people, nodes, find, flush };
