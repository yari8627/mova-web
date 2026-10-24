// Local simulation only. No database, email provider or production requests.
const fs = require('node:fs'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const source = fs.readFileSync('scripts/participants-ui.test.cjs', 'utf8');
const utilities = { exports: {}, require, setTimeout, clearTimeout, AbortController };
vm.runInNewContext(source.slice(0, source.indexOf('\ntest(')) + '\nexports.harness=harness;exports.find=find;', utilities);
async function run(label, pageSource) {
  const h = utilities.exports.harness({ source: pageSource, lagMs: 60 });
  utilities.exports.find(h, node => node.props?.onClick?.name === 'openNew').props.onClick();
  h.state[1] = { ...h.state[1], email: 'guest@example.test' };
  const submit = utilities.exports.find(h, node => node.type === 'form').props.onSubmit;
  const click = performance.now();
  for (let i = 0; i < 5; i++) submit({ preventDefault() {} });
  const feedbackPresent = h.html().includes('Invio in corso…');
  const feedbackMs = feedbackPresent ? +(performance.now() - click).toFixed(2) : null;
  while (h.state[3] && performance.now() - click < 3000) await new Promise(resolve => setTimeout(resolve, 5));
  return { label, simulated: true, artificialNetworkMs: 60, requestsFromFiveSubmissions: h.calls.filter(row => row.url).length, feedbackMs, confirmationMs: +(performance.now() - click).toFixed(2), explicitSuccess: h.html().includes('Invito inviato') };
}
(async () => {
  const baseline = execFileSync('git', ['show', '3b6525d:app/trips/[id]/participants/page.tsx'], { encoding: 'utf8' });
  const rows = [];
  for (let sample = 1; sample <= 5; sample++) {
    rows.push({ sample, ...await run('before-3b6525d', baseline) });
    rows.push({ sample, ...await run('after-working-tree') });
  }
  console.log(JSON.stringify({ note: 'VM/SSR simulation, not browser paint, mobile or real network/database measurements', samples: rows }, null, 2));
})().catch(() => { console.error('Local invitation profiling failed'); process.exitCode = 1; });
