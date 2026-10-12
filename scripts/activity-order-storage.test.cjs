const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(prisma) {
  const context = { exports: {}, require: () => ({ prisma }) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/activity-order-storage.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText, context);
  return context.exports.ensureActivityOrder;
}
test('already migrated databases require no writes and share the cold-start check', async () => {
  let checks = 0;
  const ensure = load({ $queryRaw: async () => { checks++; return [{ is_nullable: 'NO' }]; }, $transaction: () => { throw Error('unexpected write'); } });
  await Promise.all([ensure(), ensure(), ensure()]);
  await ensure();
  assert.equal(checks, 1);
});
test('missing column is initialized transactionally without deleting activities', async () => {
  const statements = [];
  const ensure = load({ $queryRaw: async () => [], $transaction: async fn => fn({ $executeRaw: async strings => statements.push(strings.join('')) }) });
  await ensure();
  assert.equal(statements.length, 5);
  assert.match(statements[0], /pg_advisory_xact_lock/);
  assert.match(statements[1], /ADD COLUMN IF NOT EXISTS/);
  assert.match(statements[2], /sortOrder" IS NULL/);
  assert.match(statements[4], /SET NOT NULL/);
  assert.ok(statements.every(sql => !/DELETE|DROP/i.test(sql)));
});
test('failed initialization can be retried', async () => {
  let attempts = 0;
  const ensure = load({ $queryRaw: async () => { if (++attempts === 1) throw Error('offline'); return [{ is_nullable: 'NO' }]; } });
  await assert.rejects(ensure(), /offline/);
  await ensure();
  assert.equal(attempts, 2);
});
