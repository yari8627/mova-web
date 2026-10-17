const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), SSR = require('react-dom/server');
const fixture = { name: 'Ada Viaggi', email: 'ada.viaggi.con.indirizzo.lungo@example.test', passportCountry: 'ITA', avatarUrl: '/fixture-avatar.png' };
function load(path, resolve, extras = {}) {
  const context = { exports: {}, require: resolve, ...extras };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
  return context.exports;
}
function profileHarness({ saved = fixture, uploadOK = true, saveOK = true, emailChanged = false } = {}) {
  let persisted = { ...saved }, cursor = 0;
  const state = [null, '', '', '', false], calls = [], effects = [];
  const page = load('app/settings/profile/page.tsx', name => {
    if (name === 'react') return { useEffect: fn => effects.push(fn), useState: initial => { const i = cursor++; return [state[i] === undefined ? initial : state[i], value => state[i] = typeof value === 'function' ? value(state[i]) : value]; } };
    if (name === 'next/navigation') return { useRouter: () => ({ push: path => calls.push({ push: path }), replace: path => calls.push({ replace: path }), refresh: () => calls.push({ refresh: true }) }) };
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    return require(name);
  }, { FormData, fetch: async (url, options) => {
    calls.push({ url, options });
    if (url === '/api/auth/me') return { json: async () => ({ user: { ...persisted } }) };
    if (options?.method === 'PATCH') {
      if (saveOK) persisted = JSON.parse(options.body);
      return { ok: saveOK, json: async () => saveOK ? { emailChanged, previewUrl: emailChanged ? '/verify-email/fixture' : undefined } : { error: 'Inserisci un nome e un indirizzo email validi.' } };
    }
    return { ok: uploadOK, json: async () => uploadOK ? { avatarUrl: '/fixture-new-avatar.webp' } : { error: 'Usa JPG, PNG o WebP fino a 3 MB.' } };
  } });
  const render = () => { cursor = 0; return page.default(); };
  return { state, calls, effects, render, html: () => SSR.renderToStaticMarkup(render()) };
}
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const find = (h, predicate) => nodes(h.render()).find(predicate);
const flush = () => new Promise(resolve => setImmediate(resolve));
async function ready(options) { const h = profileHarness(options); h.render(); h.effects[0](); await flush(); return h; }

test('loads original data once, shows actual avatar or initials and keeps email editable', async () => {
  const h = await ready();
  assert.equal(find(h, n => n.type === 'img').props.src, fixture.avatarUrl);
  const email = find(h, n => n.props?.type === 'email');
  assert.equal(email.props.value, fixture.email); assert(!email.props.readOnly); assert(email.props.required);
  assert.equal(find(h, n => n.type === 'select').props.value, 'ITA');
  assert(nodes(h.render()).filter(n => n.type === 'option').length > 190);
  assert(h.html().includes('JPG, PNG o WebP · massimo 3 MB'));
  const fallback = await ready({ saved: { ...fixture, avatarUrl: null } });
  assert(!find(fallback, n => n.type === 'img')); assert(fallback.html().includes('AV'));
  assert.equal(h.calls.filter(c => c.url === '/api/auth/me').length, 1);
});
test('name and passport edit without fetches per keystroke; save payload and reload retain changes', async () => {
  const h = await ready();
  find(h, n => n.type === 'input' && !n.props.type).props.onChange({ target: { value: 'Ada Esplora' } });
  find(h, n => n.type === 'select').props.onChange({ target: { value: 'JPN' } });
  assert.equal(h.calls.length, 1);
  await find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  const saved = JSON.parse(h.calls.find(c => c.options?.method === 'PATCH').options.body);
  assert.equal(saved.name, 'Ada Esplora'); assert.equal(saved.passportCountry, 'JPN'); assert.equal(saved.email, fixture.email);
  assert(h.html().includes('Profilo aggiornato.')); assert(h.calls.some(c => c.refresh));
  h.state[0] = null; h.effects[0](); await flush();
  assert.equal(h.state[0].name, saved.name); assert.equal(h.state[0].passportCountry, 'JPN');
});
test('pending email, verification feedback and server errors remain available', async () => {
  const h = await ready({ saved: { ...fixture, pendingEmail: 'pending@example.test' }, emailChanged: true });
  assert(h.html().includes('In attesa di verifica:'));
  find(h, n => n.props?.type === 'email').props.onChange({ target: { value: 'new@example.test' } });
  assert.equal(h.state[0].pendingEmail, null);
  await find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert(h.html().includes('Verifica il nuovo indirizzo email'));
  find(h, n => n.props?.className === 'preview').props.onClick();
  assert.equal(h.calls.at(-1).push, '/verify-email/fixture');
  const failure = await ready({ saveOK: false });
  await find(failure, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(find(failure, n => n.props?.role === 'alert').props.children, 'Inserisci un nome e un indirizzo email validi.');
});
test('file chooser retains multipart upload, replacement and server validation feedback', async () => {
  const h = await ready(); const chooser = () => find(h, n => n.props?.type === 'file');
  assert.equal(chooser().props.accept, 'image/png,image/jpeg,image/webp');
  await chooser().props.onChange({ target: { files: [new File(['fixture'], 'avatar.webp', { type: 'image/webp' })] } });
  assert.equal(h.calls.find(c => c.options?.method === 'POST').options.body.get('avatar').name, 'avatar.webp');
  assert.equal(find(h, n => n.type === 'img').props.src, '/fixture-new-avatar.webp');
  const failure = await ready({ uploadOK: false });
  await find(failure, n => n.props?.type === 'file').props.onChange({ target: { files: [new File(['fixture'], 'avatar.gif', { type: 'image/gif' })] } });
  assert(failure.html().includes('Usa JPG, PNG o WebP fino a 3 MB.'));
  assert.equal(find(failure, n => n.type === 'img').props.src, fixture.avatarUrl);
});
test('actual upload route rejects unsupported format and oversized files before any storage mutation', async () => {
  let writes = 0;
  const storage = load('lib/avatar-storage.ts', name => name === './object-storage' ? {} : require(name), { process });
  const route = load('app/api/auth/profile/route.ts', name => {
    if (name.endsWith('/avatar-storage')) return { ...storage, saveAvatar: () => writes++, deleteAvatar: () => writes++ };
    if (name.endsWith('/auth')) return { currentUser: async () => ({ id: 'fixture' }) };
    if (name.endsWith('/prisma')) return { prisma: {} };
    if (name.endsWith('/email') || name.endsWith('/email-tokens')) return {};
    return require(name);
  }, { File });
  for (const file of [new File(['x'], 'bad.gif', { type: 'image/gif' }), new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })]) {
    const form = new FormData(); form.set('avatar', file);
    const response = await route.POST({ formData: async () => form });
    assert.equal(response.status, 400); assert((await response.json()).error.includes('3 MB'));
  }
  assert.equal(writes, 0);
});
test('logout posts once, disables the action and preserves auth redirect and refresh', async () => {
  const h = await ready(); await find(h, n => n.props?.className === 'logout').props.onClick();
  assert.equal(h.calls.filter(c => c.url === '/api/auth/logout' && c.options.method === 'POST').length, 1);
  assert.equal(find(h, n => n.props?.className === 'logout').props.disabled, true);
  assert(h.calls.some(c => c.replace === '/auth')); assert(h.calls.some(c => c.refresh));
});
