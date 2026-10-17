const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const SSR = require('react-dom/server');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const balanceContext = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync('lib/expense-balances.ts', 'utf8')), balanceContext);
function harness({ expenses = [], participants = ['A', 'B', 'C', 'D'], budget = null, role = 'owner', userName = 'A', userId = 'alice' } = {}) {
  const state = [expenses, participants, budget, false, null, null, false, ''], requests = [], storage = new Map();
  let cursor = 0;
  const context = { exports: {}, Intl, Date, console };
  context.window = { localStorage: { setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) } };
  context.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ id: 'saved', ...JSON.parse(options.body || '{}'), createdById: userId }) };
  };
  context.require = name => {
    if (name === 'react') return { useEffect() {}, useMemo: fn => fn(), useState: initial => { const i = cursor++; if (state[i] === undefined) state[i] = initial; return [state[i], v => state[i] = typeof v === 'function' ? v(state[i]) : v]; } };
    if (name === 'next/navigation') return { useParams: () => ({ id: 'trip' }), useRouter: () => ({ push() {} }) };
    if (name.endsWith('/expense-balances')) return balanceContext.exports;
    if (name.endsWith('/use-trip-permissions')) return { useTripPermissions: () => ({ canManage: role === 'owner' || role === 'co-organizer', role, userId, userName }) };
    if (name.endsWith('/trip-sync')) return { syncTripSnapshot: (id, body) => requests.push({ url: 'snapshot', body }) };
    if (name.endsWith('/trip-client-cache')) return { removeTripSnapshot() {} };
    if (name.endsWith('/trip-cover')) return { TripCover: () => null };
    if (name.endsWith('/trip-tabs')) return { TripTabs: () => null };
    if (name.endsWith('/travel-category-icon')) return { travelCategoryFromText: () => 'place', TravelCategoryIcon: () => null };
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    return require(name);
  };
  vm.runInNewContext(compile(fs.readFileSync('app/trips/[id]/expenses/page.tsx', 'utf8')), context);
  const render = () => { cursor = 0; return context.exports.default(); };
  return { state, requests, storage, render, html: () => SSR.renderToStaticMarkup(render()) };
}
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const find = (h, predicate) => nodes(h.render()).find(predicate);
const fixture = [
  { id: 'hotel', description: 'Hotel', amount: 240, category: 'Alloggio', paidBy: 'A', date: '2026-10-09', sharedWith: ['A','B','C','D'], createdById: 'alice' },
  { id: 'taxi', description: 'Taxi', amount: 170, category: 'Trasporti', paidBy: 'A', date: '2026-10-10', sharedWith: ['A','B'], createdById: 'alice' },
  { id: 'food', description: 'Pranzo', amount: 29, category: 'Ristoranti', paidBy: 'B', date: '2026-10-11', sharedWith: ['A','B','C','D'], createdById: 'bob' }
];
test('budget UI preserves totals, average and negative remainder while excluding settlements', () => {
  const h = harness({ expenses: [...fixture, { ...fixture[0], id: 'settle', description: 'Pagamento', amount: 60, paidBy: 'C', recipient: 'A', kind: 'settlement', date: '2026-10-12' }], budget: 400 });
  const html = h.html();
  for (const amount of ['439,00', '109,75', '-39,00']) assert(html.includes(amount));
  assert(html.includes('Budget superato'));
  assert(html.includes('Regolazione saldo'));
  assert(html.includes('C → A'));
  assert(html.indexOf('Pagamento</strong>') < html.indexOf('Pranzo</strong>'));
  const budget = find(h, n => n.props?.['aria-label'] === 'Budget totale opzionale');
  budget.props.onChange({ target: { value: '600' } });
  assert(h.html().includes('161,00'));
  budget.props.onChange({ target: { value: '' } });
  assert(h.html().includes('Budget non impostato'));
});
test('personal debts and credits retain direct pair amounts and never display unrelated transfers', () => {
  const h = harness({ expenses: fixture, userName: 'B', userId: 'bob', role: 'participant' });
  const html = h.html();
  assert(html.includes('137,75')); assert(html.includes('7,25')); assert(!html.includes('60,00'));
  assert(html.includes('Devi ricevere')); assert(html.includes('Devi pagare'));
  assert(!html.includes('aria-label="Elimina Hotel"'));
  assert(html.includes('aria-label="Elimina Pranzo"'));
  const empty = harness().html();
  assert(empty.includes('Nessuna spesa registrata')); assert(empty.includes('Non hai importi da ricevere')); assert(empty.includes('Non hai importi da pagare'));
});
test('add, edit and delete use the existing endpoints and selected split participants', async () => {
  const h = harness({ expenses: fixture });
  find(h, n => n.props?.onClick?.name === 'openNewExpense').props.onClick();
  h.state[5] = { ...h.state[5], description: 'Cena', amount: '45,50', sharedWith: ['A','B'] };
  find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests[0].options.method, 'POST');
  assert.equal(JSON.parse(h.requests[0].options.body).amount, 45.5);
  assert.deepEqual(JSON.parse(h.requests[0].options.body).sharedWith, ['A','B']);
  find(h, n => n.props?.['aria-label'] === 'Modifica Taxi').props.onClick();
  assert.equal(h.state[5].date, '2026-10-10');
  h.state[5] = { ...h.state[5], amount: '180' };
  find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests[1].url, '/api/trips/trip/expenses/taxi');
  assert.equal(h.requests[1].options.method, 'PATCH');
  find(h, n => n.props?.['aria-label'] === 'Elimina Hotel').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests[2].options.method, 'DELETE');
  assert(!h.state[0].some(e => e.id === 'hotel'));
});
test('settlement form retains sender, recipient and validation against self payment', async () => {
  const h = harness();
  find(h, n => n.props?.onClick?.name === 'openNewExpense').props.onClick();
  h.state[5] = { ...h.state[5], description: 'Regolazione saldo', amount: '60', kind: 'settlement', paidBy: 'C', recipient: 'A' };
  assert(h.html().includes('Chi riceve')); assert(!h.html().includes('Dividi con'));
  find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  const body = JSON.parse(h.requests[0].options.body);
  assert.equal(body.kind, 'settlement'); assert.equal(body.recipient, 'A');
  find(h, n => n.props?.onClick?.name === 'openNewExpense').props.onClick();
  h.state[5] = { ...h.state[5], description: 'Saldo', amount: '10', kind: 'settlement', paidBy: 'A', recipient: 'A' };
  find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests.length, 1);
});
