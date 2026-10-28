const { test } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs');
// Reuse the actual-component hook harness, without registering its original tests.
const harness = new Function('require', fs.readFileSync('scripts/trip-entry-scroll.test.cjs', 'utf8') + '\nreturn harness;')(n => n === 'node:test' ? { test() {} } : require(n));
for (const [name, from, to, y] of [
  ['apps bottom to overview', '/apps', '/overview', 950],
  ['apps middle to overview', '/apps', '/overview', 430],
  ['itinerary bottom to overview', '', '/overview', 800],
  ['overview bottom to apps', '/overview', '/apps', 620],
]) test(name + ' resets before destination paint', () => { const h = harness('trip', '/trips/trip' + from); h.render(); h.commit(); h.scroll(y); h.render('trip', '/trips/trip' + to); assert.equal(h.y(), y); h.commit(); assert.equal(h.y(), 0); assert.equal(h.calls.at(-1).behavior, 'instant'); });
test('repeated committed section changes each reset exactly once; current-section updates never reset', () => { const h = harness('trip'); h.render(); h.commit(); const start = h.calls.length; for (const suffix of ['/apps', '/overview', '', '/overview']) { h.scroll(300); h.render('trip', '/trips/trip' + suffix); h.commit(); assert.equal(h.y(), 0); h.scroll(180); for (let i = 0; i < 3; i++) { h.render(); h.commit(); } assert.equal(h.y(), 180); } assert.equal(h.calls.length, start + 4); });
test('selection prepared before URL commit does not reset the outgoing section', () => { const h = harness('trip', '/trips/trip/apps'); h.render(); h.commit(); h.scroll(700); h.render(); h.commit(); assert.equal(h.y(), 700); h.render('trip', '/trips/trip/overview'); h.commit(); assert.equal(h.y(), 0); });
test('late images, normal vertical scroll and content-height renders do not reset', () => { const h = harness('trip'); h.render(); h.commit(); h.render('trip', '/trips/trip/apps'); h.commit(); h.scroll(240); const count = h.calls.length; for (let i = 0; i < 10; i++) { h.render(); h.commit(); } assert.equal(h.y(), 240); assert.equal(h.calls.length, count); });
test('Home and settings are outside the section-reset policy; native restoration remains untouched', () => { const h = harness('trip'); h.render(); h.commit(); for (const path of ['/', '/trips/trip/settings']) { h.scroll(510); const count = h.calls.length; h.render('trip', path); h.commit(); assert.equal(h.y(), 510); assert.equal(h.calls.length, count); } assert.equal(h.history.scrollRestoration, 'auto'); });
