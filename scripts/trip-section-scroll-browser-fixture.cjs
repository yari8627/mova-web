// Extends the existing isolated routing fixture; never reads .env or real data.
const fs = require('node:fs'), path = require('node:path');
require('./trip-entry-browser-fixture.cjs');
const root = path.resolve('../nami-bug012-browser');
const write = (file, text) => { const dest = path.join(root, file); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, text); };
write('app/entry-diagnostics.tsx', fs.readFileSync('scripts/trip-section-scroll-diagnostics.fixture.tsx', 'utf8'));
write('app/layout.tsx', fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8').replace('NAMI BUG-012', 'NAMI BUG-016'));
for (const file of ['app/api/trips/route.ts', 'app/api/trips/[id]/route.ts']) write(file, fs.readFileSync(path.join(root, file), 'utf8').replace("owner:{id:'entry-fixture'}", "owner:{id:'entry-fixture',name:'Fixture',email:'fixture@example.test'}"));
write('app/api/travel-apps/route.ts', `export async function POST(){return Response.json({checkedAt:'2026-10-28T12:00:00Z',checks:[],pendingCandidates:0})}`);
write('app/api/travel-app-icons/route.ts', `export async function GET(){return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="36" height="36" rx="6" fill="#eee7d9"/></svg>',{headers:{'Content-Type':'image/svg+xml'}})}`);
write('app/api/trips/[id]/access/route.ts', `export async function GET(){return Response.json({allowed:true,role:'owner',canEditItinerary:true})}`);
const wallet = 'public/icons/wallet-travel-ticket.png';
if (fs.existsSync(wallet)) { fs.mkdirSync(path.join(root, 'public/icons'), { recursive: true }); fs.copyFileSync(wallet, path.join(root, wallet)); }
console.log('BUG-016 fixture on 127.0.0.1:3195 — actual sections, synthetic photos/catalog only');
