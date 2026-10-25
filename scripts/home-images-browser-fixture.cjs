// Local synthetic account, no production credentials or writes. Not an app route.
// Run a local production build on 3134; this read-only proxy listens on localhost:3136.
const http = require('node:http');
const { performance } = require('node:perf_hooks');
const origin = performance.now(), events = [];
const upstreamPort = Number(process.env.NAMI_FIXTURE_UPSTREAM || 3134), fixturePort = Number(process.env.NAMI_FIXTURE_PORT || 3136);
const dateKey = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0,10);
const completedCount = Math.max(1, Math.min(30, Number(process.env.NAMI_FIXTURE_COMPLETED_COUNT || 6)));
const trips = Array.from({ length: completedCount + 2 }, (_, index) => ({ id: `fixture-${index}`, name: index ? `Francia ${index}` : 'Capo Verde 2026',
  country: index ? 'Francia' : 'Capo Verde', countryCode: index ? '🇫🇷' : '🇨🇻', city: index ? `Paris ${index}` : 'Sal Rei',
  startDate: dateKey(index < 2 ? index + 2 : -index - 2), endDate: dateKey(index < 2 ? index + 3 : -index - 1), people: 2, theme: 'blue' }));
const photo = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/Aerial-Sal-Reis-Cape-Verde-2012.JPG/1920px-Aerial-Sal-Reis-Cape-Verde-2012.JPG';
const json = (response, value) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); };
http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end('Read-only fixture'); return; }
  if (url.pathname === '/_nami_test/events') { json(response, events); return; }
  if (url.pathname.startsWith('/api/')) events.push({ path: request.url, ms: Math.round(performance.now() - origin) });
  if (url.pathname === '/api/auth/me') { json(response, { user: { id: 'home-image-fixture', name: 'Home Test', email: 'home@example.invalid' } }); return; }
  if (url.pathname === '/api/trips') { setTimeout(() => json(response, trips), 80); return; }
  if (url.pathname === '/api/notifications') { json(response, { notifications: [] }); return; }
  if (url.pathname === '/api/city-image') {
    if (process.env.NAMI_FIXTURE_IMAGE_MODE === '429') {
      response.statusCode = 429; response.setHeader('Retry-After', '120'); response.setHeader('Cache-Control', 'no-store');
      json(response, { image: null }); return;
    }
    if (process.env.NAMI_FIXTURE_IMAGE_MODE === 'missing' || process.env.NAMI_FIXTURE_IMAGE_MODE === '404') {
      response.statusCode = process.env.NAMI_FIXTURE_IMAGE_MODE === '404' ? 404 : 200;
      json(response, { image: null }); return;
    }
    const city = url.searchParams.get('city');
    // Offscreen lookup gates expose whether all history is loaded unnecessarily.
    setTimeout(() => json(response, { image: photo }), city === 'Sal Rei' ? 100 : Number(process.env.NAMI_FIXTURE_IMAGE_DELAY || 1600));
    return;
  }
  if (/^\/api\/trips\/[^/]+$/.test(url.pathname)) {
    const trip = trips.find(item => item.id === url.pathname.split('/').at(-1));
    setTimeout(() => json(response, { ...trip, owner: { id: 'home-image-fixture', name: 'Home Test', email: 'home@example.invalid' },
      accessRole: 'owner', activities: [], participants: [], bookings: [], expenses: [], documents: [] }), 700); return;
  }
  if (url.pathname.startsWith('/api/')) { json(response, []); return; }
  const upstream = http.request({ hostname: '127.0.0.1', port: upstreamPort, path: request.url, method: request.method,
    headers: { ...request.headers, host: `localhost:${fixturePort}` } }, result => { response.writeHead(result.statusCode, result.headers); result.pipe(response); });
  upstream.on('error', () => { response.writeHead(502); response.end('Local build unavailable'); }); request.pipe(upstream);
}).listen(fixturePort, '127.0.0.1', () => console.log(`Synthetic Home fixture: http://127.0.0.1:${fixturePort}`));
