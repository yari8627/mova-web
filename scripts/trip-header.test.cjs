const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), SSR = require('react-dom/server');
function harness(route = '/trips/trip/overview', pane = null) {
  const destinations = [];
  const context = { exports: {}, require: name => {
    if (name === 'react') return { useContext: () => pane };
    if (name === 'next/navigation') return { usePathname: () => route, useRouter: () => ({ push: path => destinations.push(path) }) };
    if (name === './trip-pane-path') return { TripPanePath: {} };
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    return require(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/components/trip-header.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const render = () => context.exports.TripHeader({ tripId: 'trip' });
  return { destinations, render, html: () => SSR.renderToStaticMarkup(render()) };
}
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
test('all eight sections share the Home logo and only Overview exposes Manage', () => {
  for (const section of ['overview','packing','','bookings','documents','expenses','participants','apps']) {
    const h = harness('/trips/trip' + (section ? '/' + section : ''));
    const buttons = nodes(h.render()).filter(n => n.type === 'button');
    assert.equal(buttons.length, section === 'overview' ? 2 : 1);
    assert.equal(buttons[0].props['aria-label'], 'Torna alla Home');
    buttons[0].props.onClick(); assert.equal(h.destinations[0], '/');
    assert(h.html().includes('<span>NAMI</span><small>TRAVEL</small>'));
    if (section === 'overview') {
      assert.equal(buttons[1].props['aria-label'], 'Gestisci viaggio');
      buttons[1].props.onClick(); assert.equal(h.destinations[1], '/trips/trip/settings');
    }
  }
});
test('preloaded swipe panes use their own existing path instead of the active URL', () => {
  assert(!harness('/trips/trip/overview', '/trips/trip/packing').html().includes('Gestisci viaggio'));
  assert(harness('/trips/trip/apps', '/trips/trip/overview').html().includes('Gestisci viaggio'));
});
test('every main trip section uses the shared header exactly once above its unchanged cover', () => {
  for (const section of ['overview','packing','','bookings','documents','expenses','participants','apps']) {
    const source = fs.readFileSync('app/trips/[id]/' + (section ? section + '/' : '') + 'page.tsx', 'utf8');
    assert.equal((source.match(/<TripHeader tripId=\{id\} \/>/g) || []).length, 1);
    assert(source.indexOf('<TripHeader') < source.indexOf('<TripCover'));
    assert(!source.includes('<header className="detail-topbar">'));
  }
});
