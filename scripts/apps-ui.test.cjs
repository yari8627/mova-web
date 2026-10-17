const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), SSR = require('react-dom/server');
function harness(country = 'Francia', status = null) {
  const state = [country === null ? null : { id: 'trip', country }, status];
  let cursor = 0;
  const context = { exports: {}, Intl, Date };
  context.require = name => {
    if (name === 'react') return { useEffect() {}, useMemo: fn => fn(), useState: initial => { const i = cursor++; if (state[i] === undefined) state[i] = initial; return [state[i], value => state[i] = value]; } };
    if (name === 'next/navigation') return { useParams: () => ({ id: 'trip' }), useRouter: () => ({ push() {} }) };
    if (name.endsWith('/trip-client-cache')) return {};
    if (name.endsWith('/trip-cover')) return { TripCover: () => null };
    if (name.endsWith('/trip-tabs')) return { TripTabs: () => null };
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    return require(name);
  };
  const source = fs.readFileSync('app/trips/[id]/apps/page.tsx', 'utf8') + '\nexport { AppLogo, international };';
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const render = () => { cursor = 0; return context.exports.default(); };
  return { state, catalog: context.exports.international, render, html: () => SSR.renderToStaticMarkup(render()), logo: app => { cursor = 2; return context.exports.AppLogo({ app }); } };
}
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const cards = h => nodes(h.render()).filter(n => n.props?.className === 'useful-app-card');
const names = h => cards(h).map(n => nodes(n).find(child => child.type === 'h3').props.children);
test('destinations retain their existing catalog, categories and international fallback', () => {
  const expected = {
    Cina: ['DiDi','Alipay','WeChat','MetroMan','Amap','Google Maps','Google Traduttore','XE Currency'],
    Egitto: ['inDrive','Uber','Careem','Google Maps','Google Traduttore','XE Currency'],
    Giappone: ['GO','Japan Travel by NAVITIME','Suica','Google Maps','Google Traduttore','XE Currency'],
    Thailandia: ['Grab','Bolt','Google Maps','Google Traduttore','XE Currency'],
    'Corea del Sud': ['k.ride','NAVER Map','Papago','KorailTalk','KakaoTalk','Google Maps','Google Traduttore','XE Currency'],
    Francia: ['Uber','Google Maps','Google Traduttore','XE Currency']
  };
  for (const [country, apps] of Object.entries(expected)) {
    const h = harness(country);
    assert.deepEqual([...names(h)].sort(), apps.sort());
    assert.equal(names(h)[0], apps.includes('DiDi') ? 'DiDi' : country === 'Egitto' ? 'inDrive' : country === 'Giappone' ? 'GO' : country === 'Thailandia' ? 'Grab' : country === 'Corea del Sud' ? 'k.ride' : 'Uber');
    assert(h.html().includes(`viaggio in ${country}.`));
    assert(h.html().includes('Taxi e ride-hailing'));
  }
  assert.deepEqual(names(harness('South Korea')), names(harness('Corea del Sud')));
});
test('whole cards retain official URLs and checked status without blocking review links', () => {
  const h = harness('Francia', { checkedAt: '2026-10-12T10:00:00Z', pendingCandidates: 2, checks: [{ name: 'Uber', available: false }, { name: 'Google Maps', available: true }] });
  const links = cards(h);
  assert.deepEqual(links.map(n => n.props.href), ['https://www.uber.com/global/en/cities/', 'https://maps.google.com/', 'https://translate.google.com/about/', 'https://www.xe.com/apps/']);
  for (const card of links) {
    assert.equal(card.type, 'a'); assert.equal(card.props.target, '_blank'); assert.equal(card.props.rel, 'noreferrer');
    assert(!nodes(card.props.children).some(n => n.type === 'a' || n.type === 'button'));
  }
  const html = h.html();
  assert(html.includes('Link ufficiale verificato')); assert(html.includes('Da ricontrollare prima della partenza'));
  assert(html.includes('12 ott 2026')); assert(html.includes('2 nuove app candidate'));
  assert.equal((html.match(/>Essenziale</g) || []).length, 2);
});
test('empty catalog never claims verification and creates no placeholder app cards', () => {
  const h = harness(null, { checkedAt: '2026-10-12T10:00:00Z', checks: [], pendingCandidates: 0 });
  assert.equal(cards(h).length, 0);
  assert(h.html().includes('Catalogo non ancora disponibile'));
  assert(!h.html().includes('Catalogo controllato')); assert(!h.html().includes('Consiglio NAMI'));
});
test('logo endpoint is reused and failed logos fall back without more image requests', () => {
  const h = harness(), app = { name: 'Google Maps', url: 'https://maps.google.com/', icon: 'GM' };
  const image = h.logo(app);
  assert.equal(image.type, 'img'); assert.equal(image.props.loading, 'lazy');
  assert.equal(image.props.src, '/api/travel-app-icons?name=Google%20Maps&website=https%3A%2F%2Fmaps.google.com%2F');
  image.props.onError();
  assert.notEqual(h.logo(app).type, 'img');
  assert.notEqual(harness().logo({ ...app, url: '' }).type, 'img');
});
test('missing URL produces a readable non-link card in an isolated test fixture', () => {
  const h = harness();
  // Mutate only this VM's in-memory fixture, never the source catalog.
  h.catalog[0].url = '';
  const missing = cards(h).find(n => nodes(n).some(child => child.type === 'h3' && child.props.children === 'Google Maps'));
  assert.equal(missing.type, 'article'); assert.equal(missing.props.href, undefined);
  assert(SSR.renderToStaticMarkup(missing).includes('Collegamento non disponibile'));
});
