// node test/smoke.test.js — runs app.js against a stub DOM + stub Leaflet with LIVE data, to catch runtime errors.
const assert = require('assert');
global.self = global; global.window = global; global.addEventListener = () => {};
const els = {};
function mkEl(id) {
  const listeners = {};
  const e = { id, value: '', checked: false, hidden: false, innerHTML: '', textContent: '', dataset: {}, style: {}, options: [], clientWidth: 900,
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); }, fire(t, ev) { (listeners[t] || []).forEach((f) => f(ev || { target: e })); },
    appendChild(c) { return c; }, setAttribute() {}, removeAttribute() {}, getBoundingClientRect() { return { left: 0, width: 900 }; }, closest() { return null; },
    classList: { add() {}, remove() {}, toggle() {} } };
  return e;
}
global.document = { getElementById: (id) => els[id] || (els[id] = mkEl(id)), createElement: () => mkEl('x'), documentElement: { setAttribute() {}, removeAttribute() {} }, body: { dataset: {} }, querySelectorAll: () => [] };
const store = {}; global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; }, key: (i) => Object.keys(store)[i], get length() { return Object.keys(store).length; } };
const chain = () => new Proxy(function () {}, { get: (t, p) => (p === 'prototype' ? t.prototype : chain()), apply: () => chain(), construct: () => chain() });
global.L = chain();
const origSI = global.setInterval; global.setInterval = (f, ms) => { const h = origSI(f, ms); h.unref && h.unref(); return h; };
const errs = []; const origErr = console.error; console.error = (...a) => { errs.push(a.join(' ')); origErr(...a); };

require('../js/model.js'); require('../js/routes.js'); require('../js/data.js');
global.SP.model = require('../js/model.js'); global.SP.routes = require('../js/routes.js');
require('../js/app.js');
const app = global.SP.app;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 60 && !(app.S.wx && app.S.alerts && app.S.tides && app.S.cur && app.S.zones.PZZ135 && app.S.zones.PZZ134); i++) await wait(500);
  console.log('sources:', ['wx', 'alerts', 'tides', 'cur'].map((k) => k + '=' + (app.S[k] && app.S[k].ok)).join(' '), 'zone=' + (app.S.zones.PZZ135 && app.S.zones.PZZ135.ok));
  const g = els.gng.innerHTML; assert(/verdict/.test(g), 'go/no-go rendered'); console.log('verdict:', (/big">([^<]+)/.exec(g) || [])[1]);
  assert(els.wxChart.innerHTML.includes('<svg'), 'wx chart'); assert(els.tideChart.innerHTML.includes('<svg'), 'tide chart');
  assert(els.curTbl.innerHTML.includes('Agate'), 'currents table'); assert(els.zoneTxt.textContent.length > 50, 'nws text');
  console.log('pills:', Object.keys(els).filter((k) => k.startsWith('pill-')).map((k) => els[k].textContent).join(' | '));
  // plan every preset through the real UI path
  for (const id of ['kingston', 'poulsbo', 'townsend', 'loop', 'custom']) {
    els.routeSel.value = id; els.routeSel.fire('change', { target: els.routeSel });
    if (id === 'custom') { app.st.custom.push([47.70, -122.44], [47.74, -122.46]); }
    app.calc();
    const r = app.st.result;
    for (let i = 0; i < 80 && r.depthState === 'load'; i++) await wait(250);
    assert.strictEqual(r.depthState, 'ok', id + ' depth state: ' + r.depthState + ' ' + r.depthErr);
    assert(els.resBody.innerHTML.includes('Min depth') && /ft MLLW \//.test(els.resBody.innerHTML), id + ' depth column');
    if (id === 'custom') { assert(r && r.totalNM > 3); } else assert(r && r.elapsedH > 0.5, id + ' result');
    assert(els.resBody.innerHTML.includes('<table'), id + ' results table');
    console.log(id.padEnd(9), r ? r.totalNM.toFixed(1) + ' NM ' + r.elapsedH.toFixed(2) + ' h, best-dep bars: ' + app.st.best.length : '');
  }
  els.routeSel.value = 'poulsbo'; els.routeSel.fire('change', { target: els.routeSel }); app.calc();
  els.btnReturn.fire('click'); assert(app.st.ret && app.st.ret.elapsedH > 0, 'return trip'); assert(els.resBody.innerHTML.includes('Return'), 'return rendered');
  console.log('poulsbo warnings:', app.st.result.warnings.map((w) => w.code + '(' + w.lvl + ')').join(', ') || '-');
  console.log('return:', app.st.ret.totalNM.toFixed(1) + ' NM', app.st.ret.elapsedH.toFixed(2) + ' h');
  // draft / margin re-evaluate from cached samples, synchronously
  els.draft.value = '15'; els.draft.fire('change', { target: els.draft }); assert.strictEqual(app.st.boat.draft, 15);
  assert(app.st.result.depth && app.st.result.depth.legs.some((l) => l.status !== 'ok'), '15 ft draft must be thin or aground somewhere at any tide');
  assert(/aground|thin/.test(els.resBody.innerHTML) && /Warning/.test(els.resBody.innerHTML), 'depth warning rendered');
  els.draft.value = '5.5'; els.draft.fire('change', { target: els.draft });
  // DEM outage: the trip still calculates and says depth was not checked
  const realFetch = global.fetch; global.fetch = (u, o) => (String(u).includes('ngdc.noaa.gov') ? Promise.reject(new Error('boom')) : realFetch(u, o));
  els.routeSel.value = 'custom'; els.routeSel.fire('change', { target: els.routeSel }); app.st.custom.push([47.69, -122.43]); app.calc();
  for (let i = 0; i < 60 && app.st.result.depthState === 'load'; i++) await wait(250);
  assert.strictEqual(app.st.result.depthState, 'err'); assert(/Depth was not checked/.test(els.resBody.innerHTML) && app.st.result.elapsedH > 0, 'outage message');
  console.log('depth pill:', els['pill-depth'].textContent); global.fetch = realFetch;
  assert(els.bestChart.innerHTML.includes('<svg'), 'best chart'); assert(!errs.length, 'console.error calls: ' + errs.join(';'));
  console.log('SMOKE OK');
  process.exit(0);
})().catch((e) => { console.error('SMOKE FAIL', e); process.exit(1); });
