const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const SSR = require('react-dom/server');
const { load } = require('./home-photo-harness.cjs');
const source = fs.readFileSync('app/trips/[id]/overview/page.tsx', 'utf8');
const tree = ts.createSourceFile('overview.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const page = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'OverviewPage');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX } }).outputText.replaceAll('const jsx_runtime_1', 'var jsx_runtime_1');
const declarations = page.body.statements.filter(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => ['today', 'nextActivity', 'programState'].includes(d.name.getText(tree))));
const effects = page.body.statements.filter(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) && n.expression.expression.getText(tree) === 'useEffect');
const activityEffect = effects.find(n => n.getText(tree).includes('const activityItems'));
const datesEffect = effects.find(n => n.getText(tree).includes('setTripDates'));
let card;
function visit(n) { if (ts.isJsxElement(n) && n.openingElement.getText(tree).includes('overview-next')) card = n; ts.forEachChild(n, visit); }
visit(page);
const realDate = Date, instant = '2026-10-28T12:00:00';
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return new realDate(instant).getTime(); } }
const item = (id, done = false, day = 1) => ({ id, title: id, place: 'Luogo', day, time: '', done });
function harness({ activities = [], dates = { startDate: '2026-10-28', endDate: '2026-10-30' }, ready = true, snapshot = null, request } = {}) {
  const storage = new Map(), listeners = new Map();
  const ctx = { exports: {}, require, Date: FixedDate, Intl, Math, Number, JSON, window: { localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) }, addEventListener: (k, fn) => listeners.set(k, fn), removeEventListener: k => listeners.delete(k) },
    id: 'trip', activities, tripDates: dates, activitiesTripId: ready ? 'trip' : null,
    useMemo: fn => fn(), sortActivities: load('lib/activity-order.ts').sortActivities,
    styles: { nextActivity: 'next' }, router: { push() {} }, ...require('lucide-react'),
    readTripSnapshot: () => snapshot, fetchTripSnapshot: request || (() => Promise.resolve(snapshot)) };
  for (const name of ['Activities', 'ActivitiesTripId', 'Bookings', 'Documents', 'Expenses', 'Participants', 'Budget', 'TripDates']) ctx['set' + name] = value => { const key = name[0].toLowerCase() + name.slice(1); ctx[key] = value; };
  const context = vm.createContext(ctx);
  const helpers = tree.statements.filter(n => (ts.isFunctionDeclaration(n) && ['readSaved', 'tripGroup'].includes(n.name?.text)) || (ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(tree).startsWith('starter'))));
  vm.runInContext(compile(helpers.map(n => n.getText(tree)).join('\n')), context);
  return { ctx, storage, listeners, render() { vm.runInContext(compile('{ ' + declarations.map(n => n.getText(tree)).join('\n') + '\nglobalThis.result = {card: (' + card.getText(tree) + '), nextActivity, today}; }'), context); return { ...ctx.result, html: SSR.renderToStaticMarkup(ctx.result.card) }; },
    mount() { vm.runInContext(compile('var begin = ' + activityEffect.expression.arguments[0].getText(tree)), context); return ctx.begin(); },
    mountDates() { vm.runInContext(compile('var beginDates = ' + datesEffect.expression.arguments[0].getText(tree)), context); return ctx.beginDates(); },
    update(rows, tripId = 'trip') { storage.set('mova-itinerary-' + tripId, JSON.stringify(rows)); listeners.get('mova-itinerary-updated')?.({ detail: { tripId } }); } };
}
const empty = h => { const html = h.render().html; assert.match(html, /Nessuna attività in programma/); assert.doesNotMatch(html, /Programma completato/); };
const complete = h => assert.match(h.render().html, /Programma completato/);
test('zero activities is empty, not completed', () => empty(harness()));
test('one pending activity stays the next activity', () => { const html = harness({ activities: [item('Museo')] }).render().html; assert.match(html, /Museo/); assert.doesNotMatch(html, /Programma completato/); });
test('one completed activity completes the daily program', () => complete(harness({ activities: [item('Museo', true)] })));
test('mixed activities show the first pending activity in existing order', () => { const h = harness({ activities: [item('Primo', true), item('Secondo'), item('Terzo')] }); assert.equal(h.render().nextActivity.id, 'Secondo'); assert.doesNotMatch(h.render().html, /Programma completato/); });
test('all completed activities complete the daily program', () => complete(harness({ activities: [item('Primo', true), item('Secondo', true)] })));
test('empty future first day does not borrow activities from another day', () => empty(harness({ dates: { startDate: '2027-01-01', endDate: '2027-01-03' }, activities: [item('Giorno due', false, 2)] })));
test('ended trip without activities is empty', () => empty(harness({ dates: { startDate: '2026-10-01', endDate: '2026-10-03' } })));
test('ended trip never calls unfinished historical activities completed', () => empty(harness({ dates: { startDate: '2026-10-01', endDate: '2026-10-03' }, activities: [item('Incompiuta')] })));
test('today complete remains complete even with pending activities tomorrow', () => complete(harness({ activities: [item('Oggi', true), item('Domani', false, 2)] })));
test('empty today stays empty despite activities on previous/future days', () => empty(harness({ dates: { startDate: '2026-10-27', endDate: '2026-10-30' }, activities: [item('Ieri', true, 1), item('Domani', false, 3)] })));
test('switching day context recalculates the same program state', () => { const h = harness({ activities: [item('Giorno uno', true)] }); complete(h); h.ctx.tripDates = { startDate: '2026-10-27', endDate: '2026-10-30' }; empty(h); h.ctx.tripDates = { startDate: '2026-10-28', endDate: '2026-10-30' }; complete(h); });
test('initial async load never announces completion, then shows authoritative empty state', async () => { let resolve; const h = harness({ ready: false, dates: null, request: () => new Promise(r => resolve = r) }); const stop = h.mount(); assert.match(h.render().html, /Caricamento/); assert.doesNotMatch(h.render().html, /Programma completato/); resolve({ activities: [], bookings: [], documents: [], expenses: [], participants: [], budget: null }); await new Promise(r => setImmediate(r)); h.ctx.tripDates = { startDate: '2026-10-28', endDate: '2026-10-30' }; empty(h); stop?.(); });
test('mounted overview reacts to saved addition, completion, reopening and deletion without refetch', async () => { let requests = 0; const h = harness({ snapshot: { activities: [], bookings: [], documents: [], expenses: [], participants: [], budget: null }, request: async () => { requests++; return null; } }); const stop = h.mount(); await new Promise(r => setImmediate(r)); empty(h); h.update([item('Nuova')]); assert.match(h.render().html, /Nuova/); h.update([item('Nuova', true)]); complete(h); h.update([item('Nuova')]); assert.doesNotMatch(h.render().html, /Programma completato/); h.update([]); empty(h); assert.equal(requests, 1); stop?.(); assert.equal(h.listeners.size, 0); });
test('another trip event and a late response after cleanup cannot overwrite this program', async () => { let resolve; const h = harness({ request: () => new Promise(r => resolve = r) }); const stop = h.mount(); h.update([item('Altrui', true)], 'other'); assert.doesNotMatch(h.render().html, /Altrui/); stop?.(); resolve({ activities: [item('Tardiva', true)], bookings: [], documents: [], expenses: [], participants: [], budget: null }); await new Promise(r => setImmediate(r)); assert(!h.ctx.activities.some(x => x.id === 'Tardiva')); });
test('failed uncached load never reports completion', async () => { const h = harness({ ready: false }); h.mount(); await new Promise(r => setImmediate(r)); assert.doesNotMatch(h.render().html, /Programma completato/); });
test('a prior trip ready flag cannot complete the current trip during route transition', () => { const h = harness({ activities: [item('Finita', true)] }); h.ctx.activitiesTripId = 'previous-trip'; assert.match(h.render().html, /Caricamento/); assert.doesNotMatch(h.render().html, /Programma completato/); });
test('a settled itinerary update wins over an older in-flight snapshot', async () => { let resolve; const h = harness({ request: () => new Promise(r => resolve = r) }); const stop = h.mount(); h.update([item('Salvata', true)]); resolve({ activities: [], bookings: [], documents: [], expenses: [], participants: [], budget: null }); await new Promise(r => setImmediate(r)); complete(h); assert.equal(JSON.parse(h.storage.get('mova-itinerary-trip'))[0].id, 'Salvata'); stop(); });
test('dates remain loading without a snapshot and ignore late dates after cleanup', async () => { let resolve; const h = harness({ request: () => new Promise(r => resolve = r) }); const stop = h.mountDates(); assert.equal(h.ctx.tripDates, null); assert.match(h.render().html, /Caricamento/); stop(); resolve({ startDate: '2020-01-01', endDate: '2020-01-02' }); await new Promise(r => setImmediate(r)); assert.equal(h.ctx.tripDates, null); });
