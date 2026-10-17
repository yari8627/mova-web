const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), SSR = require('react-dom/server');

function aboutHarness() {
  const routes = [];
  const context = { exports: {}, require: name => {
    if (name === 'next/navigation') return { useRouter: () => ({ push: path => routes.push(path) }) };
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    return require(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/about/page.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
  return { routes, render: () => context.exports.default(), html: () => SSR.renderToStaticMarkup(context.exports.default()) };
}
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];

test('editorial reading order retains all three pillars and descriptive headings', () => {
  const h = aboutHarness(), tree = nodes(h.render()), html = h.html();
  assert.equal(tree.filter(n => n.type === 'h1').length, 1);
  assert.deepEqual(tree.filter(n => n.type === 'h3').map(n => n.props.children), ['Organizza', 'Collabora', 'Vivi']);
  assert.equal(tree.filter(n => n.type === 'article').length, 3);
  const ordered = ['LA FILOSOFIA NAMI', 'Viaggiare insieme, con semplicità.', 'Il viaggio comincia molto prima della partenza.', 'alt="Le case di Atrani', 'IL NOSTRO MODO DI VIAGGIARE', 'Organizza', 'Collabora', 'Vivi', 'IL NOSTRO SPIRITO', 'Il viaggio è più bello quando lo condividi.'];
  let position = -1;
  for (const text of ordered) { const next = html.indexOf(text, position + 1); assert(next > position, text); position = next; }
  assert(html.includes('itinerari') || html.includes('Itinerari'));
  assert(html.includes('prenotazioni, documenti e spese'));
  for (const n of tree.filter(n => n.type === 'article')) assert.equal(n.props.onClick, undefined);
});

test('original Home action is preserved without extra controls or requests', () => {
  const h = aboutHarness(), tree = nodes(h.render());
  const buttons = tree.filter(n => n.type === 'button');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].props['aria-label'], 'NAMI Travel, torna alla Home');
  buttons[0].props.onClick(); assert.deepEqual(h.routes, ['/']);
  assert(!tree.some(n => n.type === 'form' || n.type === 'a'));
});

test('local licensed photograph has reserved dimensions and Next Image responsive optimization', async () => {
  const metadata = await require('sharp')('public/images/about/amalfi-coast.webp').metadata();
  assert.equal(metadata.width, 1280); assert.equal(metadata.height, 720); assert.equal(metadata.format, 'webp');
  assert(fs.statSync('public/images/about/amalfi-coast.webp').size < 200000);
  assert(fs.readFileSync('public/images/about/PHOTO-CREDITS.md', 'utf8').includes('CC0 1.0'));
  const html = aboutHarness().html();
  assert(html.includes('loading="lazy"')); assert(html.includes('srcSet='));
  assert(html.includes('width="1280"')); assert(html.includes('height="720"'));
  assert(html.includes('alt="Le case di Atrani'));
});
