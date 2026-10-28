const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const SSR = require('react-dom/server');
const source = process.env.NAMI_COUNTDOWN_BASELINE ? require('node:child_process').execFileSync('git', ['show', '69381aa:app/page.tsx'], { encoding: 'utf8' }) : fs.readFileSync('app/page.tsx', 'utf8');
const tree = ts.createSourceFile('home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helpers = tree.statements.filter(n => ts.isFunctionDeclaration(n) && ['daysUntil', 'localDateKey', 'closestCurrentTrip', 'tripCountdown'].includes(n.name?.text));
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText.replaceAll('const jsx_runtime_1', 'var jsx_runtime_1');
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [new Date(2026,9,28,8).getTime()])); } }
const ctx = vm.createContext({ exports: {}, require, Date: FixedDate, Math, String, Number, ...require('lucide-react') });
vm.runInContext(compile(helpers.map(n => n.getText(tree)).join('\n')), ctx);
const trip = (startDate, endDate) => ({ startDate, endDate });
function render(item, today = '2026-10-28') {
  let box; function visit(n) { if (ts.isJsxElement(n) && n.openingElement.getText(tree).includes('className="countdown"')) box = n; ts.forEachChild(n, visit); } visit(tree);
  ctx.selectedTrip = item; ctx.today = today;
  ctx.countdown = typeof ctx.tripCountdown === 'function' ? ctx.tripCountdown(item, today) : null;
  vm.runInContext(compile('globalThis.output = (' + box.getText(tree) + ')'), ctx);
  return SSR.renderToStaticMarkup(ctx.output);
}
test('ended yesterday: check only, accessible completion label', () => {
  const html = render(trip('2026-10-20', '2026-10-27'));
  assert.match(html, /aria-label="Viaggio completato"/); assert.match(html, /<svg/);
  assert.doesNotMatch(html, />Oggi<|>Tra<|Viaggio concluso/);
  assert.equal(html.replace(/<[^>]+>/g, ''), '');
});
test('ended months ago also uses the completion check', () => assert.match(render(trip('2026-01-01', '2026-01-10')), /aria-label="Viaggio completato"/));
for (const [name, start, end] of [['starts today','2026-10-28','2026-10-30'],['ongoing','2026-10-20','2026-10-30'],['last day','2026-10-20','2026-10-28']]) {
  test(name + ' shows Oggi', () => assert.match(render(trip(start, end)), />Oggi</));
}
test('future trip uses calendar days; tomorrow is one day', () => {
  assert.equal(ctx.daysUntil('2026-10-29', '2026-10-28'), 1);
  assert.equal(ctx.daysUntil('2027-01-01', '2026-10-28'), 65);
  assert.match(render(trip('2026-10-29', '2026-10-30')), /Partenza tra 1 giorno/);
});
test('no upcoming trips: latest completed trip remains the hero candidate', () => {
  const older = trip('2026-01-01','2026-01-03'), latest = trip('2026-10-01','2026-10-03');
  assert.equal(ctx.closestCurrentTrip([older, latest], '2026-10-28'), undefined);
  const selected = [older, latest].sort((a,b)=>b.endDate.localeCompare(a.endDate))[0];
  assert.match(render(selected), /aria-label="Viaggio completato"/);
});
test('active trip selection still precedes future trips', () => {
  const active = trip('2026-10-27','2026-10-30'), future = trip('2026-11-01','2026-11-02');
  assert.equal(ctx.closestCurrentTrip([future,active], '2026-10-28'), active);
});
test('local midnight changes last-day Oggi to completed', () => {
  const item = trip('2026-10-20','2026-10-28');
  assert.match(render(item, '2026-10-28'), />Oggi</);
  assert.match(render(item, '2026-10-29'), /aria-label="Viaggio completato"/);
});
for (const zone of ['Europe/Rome','America/New_York','Pacific/Kiritimati','Pacific/Honolulu']) test('date-only and DST calendar arithmetic in ' + zone, () => {
  const saved = process.env.TZ; process.env.TZ = zone;
  try {
    assert.equal(ctx.localDateKey(new Date(2026,9,28,23,59,59)), '2026-10-28');
    assert.equal(ctx.localDateKey(new Date(2026,9,29,0,0,0)), '2026-10-29');
    assert.equal(ctx.daysUntil('2026-03-30','2026-03-28'), 2);
    assert.equal(ctx.daysUntil('2026-10-26','2026-10-24'), 2);
    assert.equal(ctx.daysUntil('2026-10-28','2026-10-28'), 0);
  } finally { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; }
});
test('completed carousel keeps its existing status and no countdown', () => {
  const carousel = source.slice(source.indexOf('{completedTrips.map'));
  assert.match(carousel, /Viaggio completato/); assert.doesNotMatch(carousel, /daysUntil|tripCountdown|className="countdown"/);
});
test('midnight timer and return from background refresh the single calendar state, with cleanup', () => {
  let effect;
  function visit(n) { if (ts.isCallExpression(n) && n.expression.getText(tree) === 'useEffect' && n.arguments[0]?.getText(tree).includes('setToday')) effect = n.arguments[0]; ts.forEachChild(n, visit); } visit(tree);
  assert.ok(effect, 'Home must refresh the date without a manual reload');
  let instant = new Date(2026,9,28,23,59,59).getTime(), timer, nextId = 0, date;
  const events = new Map(), cleared = [], RealDate = Date;
  class Clock extends RealDate { constructor(...args) { super(...(args.length ? args : [instant])); } }
  const context = vm.createContext({ Date: Clock, setToday: key => { date = key; },
    setTimeout: (fn, ms) => { timer = { fn, ms, id: ++nextId }; return nextId; }, clearTimeout: id => cleared.push(id),
    window: { addEventListener: (key, fn) => events.set(key,fn), removeEventListener: key => events.delete(key) },
    document: { addEventListener: (key, fn) => events.set(key,fn), removeEventListener: key => events.delete(key) } });
  vm.runInContext(compile(helpers.find(n=>n.name.text==='localDateKey').getText(tree) + '\nglobalThis.cleanup = (' + effect.getText(tree) + ')()'), context);
  assert.equal(date, '2026-10-28'); assert.equal(timer.ms, 1000);
  instant += 1000; timer.fn(); assert.equal(date,'2026-10-29');
  instant += 86400000; events.get('visibilitychange')(); assert.equal(date,'2026-10-30');
  assert.ok(events.has('focus')); context.cleanup(); assert.equal(events.size,0); assert.ok(cleared.includes(timer.id));
});
