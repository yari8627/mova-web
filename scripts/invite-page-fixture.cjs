const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const React = require('react');
const SSR = require('react-dom/server');
// Synthetic data only; no network, sessions or database. Render the real page.
function renderInvite(variant = 'valid') {
  const trip = { id: 'fixture-trip', name: 'Viaggio di prova con un titolo lungo', city: 'Destinazione di prova', country: 'Italia', startDate: '2099-10-01', endDate: '2099-10-07' };
  const invite = { code: 'NAMI-FIXTURE', email: 'guest@example.invalid', role: 'co-organizer', status: 'pending', expired: false, user: { id: 'guest', email: 'guest@example.invalid' }, trip };
  if (variant === 'expired') invite.expired = true;
  if (variant === 'accepted') { invite.status = 'accepted'; invite.canAccess = true; }
  if (variant === 'used') invite.status = 'accepted';
  if (variant === 'unauthorized') invite.user.email = 'other@example.invalid';
  if (variant === 'anonymous') invite.user = null;
  const phases = { accepting: ['accepting', 'Accettazione in corso…'], checking: ['checking', 'Verifica dell’accettazione in corso…'], uncertain: ['uncertain', 'Esito non ancora verificato. Controlla lo stato prima di riprovare.'], success: ['success', 'Invito accettato!'], error: ['error', 'Operazione non disponibile. Riprova.'] };
  const feedback = phases[variant] || ['idle', ''];
  const state = [variant === 'invalid' || variant === 'loading' ? null : invite, variant === 'invalid' ? 'Invito non trovato' : variant === 'error' ? feedback[1] : '', variant === 'loading', { phase: feedback[0], message: feedback[1] }, variant === 'success' ? { accepted: true, userId: 'guest', tripId: trip.id } : null];
  let index = 0; const sheets = new Map();
  function read(file) {
    if (!fs.existsSync(file) && fs.existsSync(file + 'x')) file += 'x';
    const module = { exports: {} };
    const requireMock = name => {
      if (name === 'react') return { ...React, useEffect() {}, useRef: value => ({ current: value }), useState: () => [state[index++], () => {}] };
      if (name === 'next/navigation') return { useParams: () => ({ code: invite.code }), useRouter: () => ({ push() {}, refresh() {} }) };
      if (name.endsWith('.css')) {
        const target = path.resolve(path.dirname(file), name), prefix = path.basename(target).replaceAll('.', '_') + '_';
        const css = fs.readFileSync(target, 'utf8').replace(/(?<![\w-])\.([a-zA-Z][\w-]*)/g, (_, key) => '.' + prefix + key);
        sheets.set(target, css);
        return new Proxy({}, { get: (_, key) => key === '__esModule' ? false : prefix + String(key) });
      }
      if (name.startsWith('.')) return read(path.resolve(path.dirname(file), name + '.ts'));
      return require(name);
    };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { exports: module.exports, require: requireMock });
    return module.exports;
  }
  const Page = read(path.resolve('app/invite/[code]/page.tsx'));
  const markup = SSR.renderToStaticMarkup(React.createElement(Page.default));
  return { markup, css: [...sheets.values()].join('\n') };
}
function previewHtml(variant) {
  const { markup, css } = renderInvite(variant);
  return `<!doctype html><html lang="it"><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{--font-ui:Inter,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;font:15px/1.5 var(--font-ui)}${css}</style></head><body>${markup}</body></html>`;
}
module.exports = { renderInvite, previewHtml };
if (require.main === module) {
  const http = require('node:http');
  http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1'); const variant = url.searchParams.get('state') || 'valid';
    if (url.pathname === '/frame') { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(previewHtml(variant)); return; }
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(`<!doctype html><html><head><title>NAMI — anteprima invito (dati sintetici)</title><style>body{font:14px system-ui;margin:16px;background:#e8e0d4}main{display:flex;gap:16px;align-items:flex-start}iframe{height:870px;border:1px solid #ccc;flex-shrink:0}nav{margin-bottom:16px}</style></head><body><h1>Anteprima locale — dati sintetici</h1><nav>${['valid','accepting','checking','success','accepted','expired','unauthorized','uncertain','invalid'].map(s=>`<a href="/?state=${s}">${s}</a>`).join(' · ')}</nav><main>${[320,375,390,430].map(width=>`<section><h2>${width} px</h2><iframe title="${width} px" width="${width}" src="/frame?state=${encodeURIComponent(variant)}"></iframe></section>`).join('')}</main></body></html>`);
  }).listen(3178, '127.0.0.1', () => console.log('Synthetic invite preview: http://127.0.0.1:3178'));
}
