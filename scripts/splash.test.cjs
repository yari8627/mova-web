const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('app/components/nami-animated-splash.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function harness(reduced = false) {
  let slots = [], index = 0, effects = [], dirty = true, now = 0, id = 0, ready = false, completed = 0, tree;
  const timers = new Map();
  const react = {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; dirty = true; }]; },
    useEffect(fn, deps) { const i = index++; const old = slots[i]; if (!old || deps.some((d, j) => d !== old.deps[j])) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); }
  };
  const context = { exports: {}, require(name) { if (name === 'react') return react; if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }; return { default: new Proxy({}, { get: (_, k) => k }) }; }, window: { matchMedia: () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }), setTimeout(fn, ms) { timers.set(++id, { at: now + ms, fn }); return id; }, clearTimeout(i) { timers.delete(i); } } };
  vm.runInNewContext(source, context);
  const onComplete = () => completed++;
  function render() { do { dirty = false; index = 0; tree = context.exports.NamiAnimatedSplash({ ready, onComplete }); const pending = effects; effects = []; pending.forEach(fn => fn()); } while (dirty); }
  function advance(ms) { const end = now + ms; while (true) { const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; now = next[1].at; timers.delete(next[0]); next[1].fn(); render(); } now = end; }
  function find(node, type) { if (!node) return; if (node.type === type) return node; for (const child of [node.props?.children].flat()) { const result = find(child, type); if (result) return result; } }
  render();
  return { advance, load() { find(tree, 'img').props.onLoad(); render(); }, ready() { ready = true; render(); }, completed: () => completed };
}
test('fast initialization waits for intro and crossfade', () => { const h = harness(); h.load(); h.ready(); h.advance(4499); assert.equal(h.completed(), 0); h.advance(351); assert.equal(h.completed(), 1); });
test('slow initialization waits without replaying entrance', () => { const h = harness(); h.load(); h.advance(8000); assert.equal(h.completed(), 0); h.ready(); h.advance(350); assert.equal(h.completed(), 1); });
test('reduced motion shortens the intro', () => { const h = harness(true); h.load(); h.ready(); h.advance(650); assert.equal(h.completed(), 1); });
test('unavailable image cannot block startup forever', () => { const h = harness(); h.ready(); h.advance(8850); assert.equal(h.completed(), 1); });
