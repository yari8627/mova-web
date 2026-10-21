// Explicitly read-only network probe. No credentials, SQL parameters or user data in output.
const { loadEnvConfig } = require('@next/env');
const { PrismaClient } = require('@prisma/client');
const { performance } = require('node:perf_hooks');
let database;
const results = {};
async function sample(name, run) {
  const times = [];
  for (let i=0;i<5;i++) { const start = performance.now(); await run(); times.push(+(performance.now()-start).toFixed(2)); }
  results[name] = { samplesMs: times, medianMs: [...times].sort((a,b)=>a-b)[2] };
}
(async () => {
  loadEnvConfig(process.cwd());
  const connection = new URL(process.env.DATABASE_URL);
  if (connection.port === '6543') {
    if (!connection.searchParams.has('pgbouncer')) connection.searchParams.set('pgbouncer', 'true');
    if (!connection.searchParams.has('connection_limit')) connection.searchParams.set('connection_limit', '1');
    if (!connection.searchParams.has('pool_timeout')) connection.searchParams.set('pool_timeout', '20');
  }
  database = new PrismaClient({ datasources: { db: { url: connection.toString() } } });
  await sample('select1_including_first_connection', () => database.$queryRaw`SELECT 1`);
  await sample('session_lookup_missing_token_not_authenticated', () => database.authSession.findUnique({ where: { tokenHash: 'nami-perf-003-2-nonexistent-readonly-probe' }, include: { user: true } }));
  await sample('trips_nonexistent_test_identity', () => database.trip.findMany({ where: { startDate: { lte: new Date() }, OR: [{ ownerId: 'nami-perf-003-2-nonexistent-readonly-probe' }, { participants: { some: { email: 'nami-perf-003-2@example.invalid', status: 'confirmed' } } }] }, select: { country: true, startDate: true } }));
  await sample('visits_nonexistent_test_identity', () => database.visitedCountry.findMany({ where: { userId: 'nami-perf-003-2-nonexistent-readonly-probe' }, orderBy: { visitedAt: 'desc' } }));
  console.log(JSON.stringify({ conditions: 'Real PostgreSQL, desktop Node, read-only, no authenticated session, synthetic nonexistent identity; not timings for the affected account', results }, null, 2));
})().catch(error => { console.error(JSON.stringify({ error: 'Read-only probe failed', code: error.code || error.errorCode || error.name, reason: /reach database|connect/i.test(error.message) ? 'connection unavailable' : /authentication|credentials/i.test(error.message) ? 'authentication unavailable' : /query engine|binary/i.test(error.message) ? 'engine unavailable' : 'not classified; message withheld to avoid exposing connection details' })); process.exitCode=1; }).finally(() => database?.$disconnect());
