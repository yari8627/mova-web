const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = fs.readFileSync('app/trips/[id]/packing/page.tsx', 'utf8');
const tree = ts.createSourceFile('packing.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const page = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'PackingPage');
const functions = tree.statements.filter(ts.isFunctionDeclaration).filter(n => n.name?.text !== 'PackingPage').concat(page.body.statements.filter(ts.isFunctionDeclaration)).map(n => n.getText(tree)).join('\n');
const compile = s => ts.transpileModule(s, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX}}).outputText.replace("const jsx_runtime_1", "var jsx_runtime_1");
const returnCode = compile('var rendered = ' + page.body.statements.find(ts.isReturnStatement).expression.getText(tree)).replace('const jsx_runtime_1', 'var jsx_runtime_1');
function harness(scope = 'personal') {
  const calls = [], cache = [];
  const ctx = { ...require('lucide-react'), require, exports: {}, id: 'trip', userId: 'user', scope, cacheKey: scope === 'template' ? 'packing-template' : `packing-trip-${scope}`, items: [], itemsRef: {current: []}, pendingRef: {current: new Set()}, pendingIds: new Set(), revision: {current: 0}, resourceRef: {current: `user:${scope}`}, saving: false, loading: false, draft: '  Adattatore  ', error: '', titleCaseItalian: s => s, router: {push() {}}, styles: new Proxy({}, {get: (_, key) => key}), boutique: {itinerary: 'itinerary'}, TripCover: () => null, TripTabs: () => null, setItems: rows => ctx.items = rows, setPendingIds: ids => ctx.pendingIds = ids, setSaving: value => ctx.saving = value, setError: value => ctx.error = value, setDraft: value => ctx.draft = value, setScope: value => ctx.scope = value, writePageCache: (user, key, rows) => cache.push({user, key, rows}), fetch: (url, options = {}) => new Promise(resolve => calls.push({url, options, resolve})) };
  ctx.setLoading = value => ctx.loading = value;
  ctx.readPageCache = () => ctx.cachedRows;
  ctx.fetchPageCache = () => new Promise(resolve => ctx.resolveLoad = resolve);
  vm.runInNewContext(compile(functions), ctx);
  const effect = page.body.statements.find(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) && n.expression.expression.getText(tree) === "useEffect");
  vm.runInNewContext(compile("var startLoad = " + effect.expression.arguments[0].getText(tree)), ctx);
  function seed(rows) { ctx.updateItems(rows); }
  function render() { ctx.packedCount = ctx.items.filter(row => row.packed).length; ctx.busy = ctx.saving || ctx.pendingIds.size > 0; vm.runInNewContext(returnCode, ctx); return ctx.rendered; }
  return {ctx, calls, cache, seed, render};
}
const row = (id, packed = false) => ({id, label: id, packed, scope: 'personal'});
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
test('two checkboxes save independently; duplicate taps send one PATCH and unrelated rows remain enabled', async () => {
  const h = harness(); h.seed([row('a'), row('b'), row('c')]);
  const a = h.ctx.toggleItem(row('a')); await h.ctx.toggleItem(row('a'));
  assert.equal(h.calls.length, 1); assert.equal(h.ctx.items.find(r => r.id === 'a').packed, true);
  const controls = nodes(h.render()).filter(n => n.props?.className === 'packing-toggle');
  assert.equal(controls.filter(n => n.props.disabled).length, 1);
  const b = h.ctx.toggleItem(row('b')); assert.equal(h.calls.length, 2);
  assert(h.ctx.items.find(r => r.id === 'a').packed && h.ctx.items.find(r => r.id === 'b').packed);
  h.calls[1].resolve({ok: true}); await b; h.calls[0].resolve({ok: true}); await a;
  assert.equal(h.ctx.pendingIds.size, 0); assert.equal(h.ctx.saving, false);
  assert(h.calls.every(c => c.options.method === 'PATCH')); assert.equal(h.cache.at(-1).user, 'user');
});
test('a failed concurrent toggle rolls back only that object and preserves a successful completion', async () => {
  const h = harness(); h.seed([row('a'), row('b')]); const a = h.ctx.toggleItem(row('a')), b = h.ctx.toggleItem(row('b'));
  h.calls[1].resolve({ok: true}); await b; h.calls[0].resolve({ok: false}); await a;
  assert.equal(h.ctx.items.find(r => r.id === 'a').packed, false); assert.equal(h.ctx.items.find(r => r.id === 'b').packed, true);
  assert.equal(h.ctx.error, 'Modifica non salvata. Riprova.'); assert.equal(h.ctx.pendingIds.size, 0);
  const reopen = h.ctx.toggleItem(row('b')); assert.equal(h.ctx.items.find(r => r.id === 'b').packed, false);
  assert.equal(JSON.parse(h.calls[2].options.body).packed, false); h.calls[2].resolve({ok: true}); await reopen;
});
test('late failed saves cannot restore another account or checklist; bulk mutations wait for pending toggles', async () => {
  const h = harness(); h.seed([row('a')]); const a = h.ctx.toggleItem(row('a'));
  await h.ctx.addItem({preventDefault() {}}); await h.ctx.removeItem('a'); await h.ctx.applyStandardList(); assert.equal(h.calls.length, 1);
  h.ctx.resourceRef.current = 'other:shared'; h.seed([row('other')]); h.calls[0].resolve({ok: false}); await a;
  assert.equal(h.ctx.items.length, 1); assert.equal(h.ctx.items[0].id, 'other'); assert.equal(h.ctx.error, '');
});
test('personal/shared/template keep their create and delete endpoints, scopes and validation', async () => {
  for (const scope of ['personal', 'shared', 'template']) {
    const h = harness(scope); h.ctx.draft = ' '; await h.ctx.addItem({preventDefault() {}}); assert.equal(h.calls.length, 0);
    h.ctx.draft = ' Adattatore '; const add = h.ctx.addItem({preventDefault() {}}); const req = h.calls[0];
    assert.equal(req.url, scope === 'template' ? '/api/packing-template' : '/api/trips/trip/packing');
    assert.equal(JSON.parse(req.options.body).scope, scope); assert.equal(JSON.parse(req.options.body).label, 'Adattatore');
    req.resolve({ok: true, json: async () => ({...row('new'), scope})}); await add; assert.equal(h.ctx.draft, '');
    const remove = h.ctx.removeItem('new'); assert.equal(h.ctx.items.length, 0);
    assert.equal(h.calls[1].url, scope === 'template' ? '/api/packing-template?itemId=new' : '/api/trips/trip/packing?itemId=new');
    h.calls[1].resolve({ok: false}); await remove; assert.equal(h.ctx.items[0].id, 'new');
  }
});
test('applying standard list uses the existing personal reload, and template has no completion or progress', async () => {
  const h = harness(); const apply = h.ctx.applyStandardList(); assert.equal(JSON.parse(h.calls[0].options.body).action, 'apply-template');
  h.calls[0].resolve({ok: true}); await new Promise(resolve => setImmediate(resolve)); assert.equal(h.calls[1].url, '/api/trips/trip/packing?scope=personal');
  h.calls[1].resolve({ok: true, json: async () => [row('template item')]}); await apply; assert.equal(h.ctx.items.length, 1);
  const standard = harness('template'); standard.seed([row('Standard')]); const html = renderToStaticMarkup(standard.render());
  assert(!html.includes('packing-toggle')); assert(!html.includes('role="progressbar"')); assert(html.includes('1 oggetti'));
});
test('progress uses real completion counts, excludes percentages at zero, and each mode remains selected independently', () => {
  for (const scope of ['personal', 'shared']) {
    const h = harness(scope); h.seed([]); assert(!renderToStaticMarkup(h.render()).includes('%'));
    h.seed([row('a', true), row('b')]); const n = nodes(h.render()).find(n => n.props?.role === 'progressbar'); assert.equal(n.props['aria-valuenow'], 1); assert.equal(n.props['aria-valuemax'], 2);
    const html = renderToStaticMarkup(h.render()); assert(html.includes('50%'));
    const active = nodes(h.render()).filter(n => n.type === 'button' && n.props['aria-pressed'] && n.props.className === 'active'); assert.equal(active.length, 1);
  }
});

test("loaded rows become immediately usable, and a delayed preload cannot overwrite a checkbox edit", async () => {
  const h = harness(); h.ctx.cachedRows = [row("a")]; const cleanup = h.ctx.startLoad();
  const toggle = h.ctx.toggleItem(row("a")); h.ctx.resolveLoad([row("a", false)]);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(h.ctx.itemsRef.current[0].packed, true);
  h.calls[0].resolve({ok: true}); await toggle; cleanup();
  const remote = harness(); const cancel = remote.ctx.startLoad(); remote.ctx.resolveLoad([row("remote")]);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(remote.ctx.itemsRef.current[0].id, "remote");
  const save = remote.ctx.toggleItem(row("remote")); assert.equal(remote.calls.length, 1); remote.calls[0].resolve({ok: true}); await save; cancel();
});
