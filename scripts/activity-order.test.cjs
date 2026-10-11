const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/activity-order.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText, context);
const { sortActivities, numberActivities, moveActivity } = context.exports;
const plain = value => JSON.parse(JSON.stringify(value));
const ids = items => plain(items.map(item => item.id));
const a = { id: 'a', day: 1, time: '18:00' };
const b = { id: 'b', day: 1, time: '08:00' };
test('insertion order survives reminder changes and reload from unordered rows', () => {
  let rows = numberActivities([a, b, { id: 'c', day: 1, time: '' }]);
  assert.deepEqual(ids(rows), ['a', 'b', 'c']);
  rows[0].time = '23:00'; rows[2].time = '06:00';
  assert.deepEqual(ids(sortActivities([rows[2], rows[0], rows[1]])), ['a', 'b', 'c']);
});
test('dragging changes position without changing any times', () => {
  const rows = numberActivities([a, b]);
  const moved = moveActivity(rows, 'b', 1, 'a');
  assert.deepEqual(ids(sortActivities(moved)), ['b', 'a']);
  assert.deepEqual(plain(moved.map(item => item.time)), ['08:00', '18:00']);
  assert.deepEqual(ids(moveActivity(moved, 'b', 1)), ['a', 'b']);
  assert.deepEqual(ids(moveActivity(moved, 'b', 1, 'b')), ['b', 'a']);
});
test('cross-day moves and new items append to destination day', () => {
  const c = { id: 'c', day: 2, time: '' };
  const rows = numberActivities([a, b, c]);
  const moved = moveActivity(rows, 'a', 2);
  assert.deepEqual(ids(moved), ['b', 'c', 'a']);
  assert.equal(moved[2].time, '18:00');
  assert.equal(moved[2].day, 2);
  assert.deepEqual(ids(numberActivities([...rows, { id: 'new', day: 1, time: '' }])), ['a', 'b', 'new', 'c']);
});
