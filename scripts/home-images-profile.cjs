// Public-photo HTTP diagnostics only, not an authenticated login/iPhone benchmark.
const { performance } = require('node:perf_hooks');
const sharp = require('sharp');
const base = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/Aerial-Sal-Reis-Cape-Verde-2012.JPG/1920px-Aerial-Sal-Reis-Cape-Verde-2012.JPG';
(async () => {
  const samples = [];
  for (let run = 0; run < 5; run++) for (const width of [1920, 1280, 500]) {
    const start = performance.now();
    const response = await fetch(base.replace('/1920px-', `/${width}px-`), { signal: AbortSignal.timeout(20000) });
    const headers = performance.now(), bytes = Buffer.from(await response.arrayBuffer()), downloaded = performance.now();
    const metadata = await sharp(bytes).metadata();
    // Decode via Sharp is a separate Node measurement, never browser image.decode().
    await sharp(bytes).raw().toBuffer();
    samples.push({ run, requestedWidth: width, status: response.status, bytes: bytes.length, width: metadata.width, height: metadata.height,
      ttfbMs: +(headers - start).toFixed(2), downloadMs: +(downloaded - headers).toFixed(2), nodeDecodeMs: +(performance.now() - downloaded).toFixed(2) });
  }
  const median = (width, key) => samples.filter(row => row.requestedWidth === width).map(row => row[key]).sort((a,b) => a-b)[2];
  console.log(JSON.stringify({ conditions: 'Node desktop; public Sal Rei photo; 5 alternating requests per size; no network throttling; no real account or Safari', samples,
    median: [1920, 1280, 500].map(width => ({ width, bytes: median(width, 'bytes'), ttfbMs: median(width, 'ttfbMs'), downloadMs: median(width, 'downloadMs'), nodeDecodeMs: median(width, 'nodeDecodeMs') })) }, null, 2));
})().catch(() => { console.error('Photo profiling failed; no response body or credentials logged.'); process.exitCode = 1; });
