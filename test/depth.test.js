// node test/depth.test.js — offline checks for the depth model (datum math, sampling, clearance logic, getSamples parsing)
const assert = require('assert');
global.self = global;
const M = require('../js/model.js'); global.SP = { model: M }; require('../js/data.js'); global.SP.model = M;
const D = global.SP.data;
const FT = M.FT_PER_M, near = (a, b, tol, msg) => assert(Math.abs(a - b) <= (tol || 1e-6), (msg || '') + ' expected ' + b + ' got ' + a);
const H = 3600000, T0 = Date.UTC(2026, 9, 17, 9, 0);

// ---- datum: Seattle 9447130 MLLW 2.419 m, NAVD88 3.134 m above station datum => NAVD88 is 0.715 m above MLLW
near(M.DATUM_ABOVE_MLLW_M['NAVD 88'], 0.715, 1e-9, 'NAVD88 above MLLW');
near(M.depthBelowMllwFt(-0.715, 'NAVD 88'), 0, 1e-9, 'elevation at the MLLW plane is 0 ft');
near(M.depthBelowMllwFt(0, 'NAVD 88'), -0.715 * FT, 1e-9, 'NAVD88 0 m is 2.35 ft ABOVE MLLW (dries)');
near(M.depthBelowMllwFt(-10, 'NAVD 88'), (10 - 0.715) * FT, 1e-9, '-10 m NAVD88 = 9.285 m = 30.46 ft of water');
near(M.depthBelowMllwFt(-199.115, 'NAVD 88'), (199.115 - 0.715) * FT, 1e-9, 'identify sample at -122.45,47.70');
near(M.depthBelowMllwFt(-(5.618 - 2.419), 'MHW'), 0, 1e-9, 'MHW-referenced DEM: elevation at the MLLW plane is 0 ft');
assert.strictEqual(M.depthBelowMllwFt(null, 'NAVD 88'), null); assert.strictEqual(M.depthBelowMllwFt(-5, 'Weird datum'), null);
near(M.depthBelowMllwFt(-3), M.depthBelowMllwFt(-3, 'NAVD 88'), 0, 'datum defaults to NAVD88');
// clearance
let c = M.clearance(7.4, 4.1, 5.5); near(c.depth, 11.5, 1e-9); near(c.ukc, 6.0, 1e-9);
c = M.clearance(-2, 1, 5.5); near(c.depth, -1, 1e-9); near(c.ukc, -6.5, 1e-9);

// ---- sampling
const A = [47.68, -122.40], B2 = M.lerpPt(A, [47.7, -122.40], 1);        // due north, 1.2 NM
const route = [A, B2, [47.72, -122.42]];
const smp = M.sampleRoute(route);
const total = M.totalNM(route);
near(smp[0].s, 0, 1e-12); near(smp[smp.length - 1].s, total, 1e-9, 'last sample at route end');
assert.deepStrictEqual([smp[0].lat, smp[0].lon], A); assert.deepStrictEqual([smp[smp.length - 1].lat, smp[smp.length - 1].lon], route[2]);
for (let i = 1; i < smp.length; i++) { assert(smp[i].s > smp[i - 1].s, 'monotonic'); assert((smp[i].s - smp[i - 1].s) * 1852 <= 50.01, 'spacing <= 50 m'); assert(smp[i].leg >= smp[i - 1].leg); }
assert(smp.some((p) => p.leg === 0 && Math.abs(p.s - M.buildLegs(route)[0].end) < 1e-9), 'waypoint belongs to the leg that ends there');
assert.strictEqual(smp.filter((p) => Math.abs(p.s - M.buildLegs(route)[0].end) < 1e-9).length, 1, 'waypoint sampled once');
const capped = M.sampleRoute([[47.6, -122.4], [48.0, -122.4]], 50, 300); assert(capped.length <= 302, 'cap widens spacing: ' + capped.length);
assert.strictEqual(M.routeHash(route), M.routeHash(route.map((p) => p.slice()))); assert.notStrictEqual(M.routeHash(route), M.routeHash(route.slice().reverse()));
assert.notStrictEqual(M.routeHash(route, 50), M.routeHash(route, 25));

// ---- tide + ETA helpers
const series = []; for (let k = 0; k <= 48; k++) series.push([T0 - 6 * H + k * 0.5 * H, k * 0.25]);       // 0..12 ft ramp over 24 h
near(M.tideHeightAt({ series: series }, T0), 3, 1e-9); near(M.tideHeightAt({ series: series }, T0 + 15 * 60000), 3.125, 1e-9);
assert.strictEqual(M.tideHeightAt({ series: series }, T0 - 7 * H), null); assert.strictEqual(M.tideHeightAt(null, T0), null);
near(M.tideHeightAt({ hilo: [{ t: T0, v: 0 }, { t: T0 + 6 * H, v: 10 }] }, T0 + 3 * H), 5, 1e-9, 'cosine between hi/lo');
const sim = { depart: T0, eta: T0 + 2 * H, totalNM: 4, samples: [{ s: 0, t: T0 }, { s: 2, t: T0 + H }, { s: 3.9, t: T0 + 1.9 * H }] };
near(M.etaAtDist(sim, 1), T0 + 0.5 * H, 1); near(M.etaAtDist(sim, 0), T0); near(M.etaAtDist(sim, 4), T0 + 2 * H);

// ---- evaluateDepth on a synthetic 2-leg route (every ~50 m); elevation function in metres NAVD88
function dem(route, elevFn) {
  const samples = M.sampleRoute(route);
  return { samples, e: samples.map((p) => elevFn(p)), r: samples.map(() => 1), rasters: { 1: { datum: 'NAVD 88' } } };
}
const legs2 = M.buildLegs(route), mid = legs2[0].end;
// deep everywhere (-30 m) except a shoal in leg 2 where the bottom is 2.0 m below MLLW => elev = -(2.0 + 0.715)
const shoalM = -(2.0 + 0.715), shoalAt = mid + 0.3;
const dm = dem(route, (p) => (p.leg === 1 && Math.abs(p.s - shoalAt) < 0.03 ? shoalM : -30));
const opt = (o) => Object.assign({ draft: 5.5, margin: 2, nLegs: 2, etaAt: (s) => T0 + s / 4 * H, tideAt: () => 0 }, o);
let ev = M.evaluateDepth(dm, opt());
const shoalFt = 2.0 * FT;                                                  // 6.56 ft of water at MLLW
assert.strictEqual(ev.legs[0].status, 'ok');
assert.strictEqual(ev.legs[1].status, 'thin', 'at MLLW: 6.56 - 5.5 = 1.06 ft under keel < 2 ft margin');
near(ev.legs[1].mllw.mllw, shoalFt, 1e-6, 'min depth at MLLW'); near(ev.legs[1].mllw.s, shoalAt, 0.03); near(ev.legs[1].atEta.ukc, shoalFt - 5.5, 1e-6);
assert(ev.legs[1].belowDraftMllw === false && ev.legs[1].driesAtMllw === false);   // 6.56 ft > 5.5 ft draft: not tide-dependent
assert(ev.warnings.some((w) => w.lvl === 'warn' && /^Leg 2: 6\.6 ft of water at \d\d:\d\d .*1\.1 ft under keel, below your 2\.0 ft margin/.test(w.text)), ev.warnings.map((w) => w.text).join(' | '));
// tide helps: +4.1 ft of tide there => 10.66 ft, ukc 5.16 => ok
ev = M.evaluateDepth(dm, opt({ tideAt: () => 4.1 })); assert.strictEqual(ev.legs[1].status, 'ok'); near(ev.legs[1].atEta.depth, shoalFt + 4.1, 1e-6); near(ev.legs[1].atEta.tide, 4.1);
// tide at the time the boat passes the shoal (not at departure): ramp 0 at T0 -> falls to -1.5 ft by the time we reach it
ev = M.evaluateDepth(dm, opt({ tideAt: (t) => -1.5 * (t - T0) / H })); assert(ev.legs[1].atEta.tide < 0 && ev.legs[1].atEta.t > T0);
near(ev.legs[1].atEta.tide, -1.5 * (ev.legs[1].atEta.t - T0) / H, 1e-9);
// draft 7 ft at MLLW: 6.56 ft < 7 -> aground (critical) and tide-dependent note
ev = M.evaluateDepth(dm, opt({ draft: 7 })); assert.strictEqual(ev.legs[1].status, 'aground'); assert(ev.legs[1].belowDraftMllw);
assert(ev.warnings.some((w) => w.lvl === 'bad' && /0\.4 ft less than your 7\.0 ft draft/.test(w.text)), ev.warnings.map((w) => w.text).join(' | '));
assert(ev.warnings.some((w) => w.code === 'depth-tide' && /below your 7\.0 ft draft at MLLW/.test(w.text)), 'separate tide-dependence note');
// same shoal with enough tide: passable, still flagged tide-dependent
ev = M.evaluateDepth(dm, opt({ draft: 7, tideAt: () => 5 })); assert.strictEqual(ev.legs[1].status, 'ok');
assert(ev.warnings.some((w) => w.code === 'depth-tide' && /needs about 2\.4 ft of tide for your margin/.test(w.text)), ev.warnings.map((w) => w.text).join(' | '));
// drying bank: bottom 1 m above MLLW (elev = +0.285 m -> land by the grid's rule); bottom 0.3 m ABOVE MLLW but below NAVD88 0 (elev -0.415) dries at MLLW only
ev = M.evaluateDepth(dem(route, (p) => (p.leg === 1 && Math.abs(p.s - shoalAt) < 0.03 ? -0.415 : -30)), opt({ tideAt: () => 9 }));
near(ev.legs[1].mllw.mllw, -0.3 * FT, 1e-6, 'dries 0.98 ft at MLLW'); assert(ev.legs[1].driesAtMllw && ev.legs[1].status === 'ok', 'passable at +9 ft tide');
assert(ev.warnings.some((w) => w.code === 'depth-tide' && /dries at low water/.test(w.text)));
ev = M.evaluateDepth(dem(route, (p) => (p.leg === 1 && Math.abs(p.s - shoalAt) < 0.03 ? -0.415 : -30)), opt({ tideAt: () => 0 })); assert.strictEqual(ev.legs[1].status, 'aground');
// land: positive elevation is a hard hit whatever the tide
ev = M.evaluateDepth(dem(route, (p) => (p.leg === 0 && Math.abs(p.s - 0.5) < 0.01 ? 3.2 : -30)), opt({ tideAt: () => 12 }));
assert.strictEqual(ev.legs[0].status, 'aground'); assert(ev.legs[0].land && ev.nLand >= 1 && ev.legs[0].land.kind === 'land');
assert(ev.warnings.some((w) => w.lvl === 'bad' && /Leg 1: the depth grid shows land/.test(w.text) && /10\.5 ft above NAVD88/.test(w.text)), ev.warnings.map((w) => w.text).join(' | '));
// NoData: reported, never silently passed
ev = M.evaluateDepth(dem(route, (p) => (p.leg === 1 && p.s > mid + 0.2 && p.s < mid + 0.4 ? null : -30)), opt());
assert(ev.legs[1].nNoData > 3 && ev.legs[1].status === 'ok' && ev.nNoData === ev.legs[1].nNoData); assert(ev.warnings.some((w) => w.code === 'depth-nodata' && /^Leg 2: no depth data for \d+ of \d+ sample points/.test(w.text)));
ev = M.evaluateDepth(dem(route, (p) => (p.leg === 1 ? null : -30)), opt()); assert.strictEqual(ev.legs[1].status, 'nodata'); assert.strictEqual(ev.legs[1].mllw, null);
// unknown datum behaves as no data
const dU = dem(route, () => -30); dU.rasters = { 1: { datum: 'Unknown' } }; assert.strictEqual(M.evaluateDepth(dU, opt()).legs[0].status, 'nodata');
// tide unavailable -> MLLW worst case, flagged
ev = M.evaluateDepth(dm, opt({ tideAt: () => null })); assert(ev.tideMissing && ev.warnings.some((w) => w.code === 'depth-notide')); near(ev.legs[1].atEta.tide, 0);
// marina zone: hits within 150 m of the start are evaluated and labelled, not suppressed
const dmar = dem(route, (p) => (p.s < 0.03 ? -0.5 : -30));
ev = M.evaluateDepth(dmar, opt()); assert.strictEqual(ev.legs[0].status, 'aground'); assert(ev.legs[0].atEta.marina);
assert(ev.warnings.some((w) => /^Leg 1 \(marina basin — check the chart\)/.test(w.text)), ev.warnings.map((w) => w.text).join(' | '));
assert.strictEqual(M.MARINA_NM, 150 / 1852);
// mixed rasters: per-sample datum (MHW grid must not be read as NAVD88)
const dmix = dem(route, () => -1.0); dmix.r = dmix.samples.map((p) => (p.leg === 0 ? 1 : 2)); dmix.rasters = { 1: { datum: 'NAVD 88' }, 2: { datum: 'MHW' } };
ev = M.evaluateDepth(dmix, opt()); near(ev.legs[0].mllw.mllw, (1 - 0.715) * FT, 1e-6); near(ev.legs[1].mllw.mllw, -(-1 + 3.199) * FT, 1e-6);
// route-line runs
const runs = M.depthRuns(dm, M.evaluateDepth(dm, opt()), opt()); assert(runs.length === 1 && runs[0].status === 'thin' && runs[0].pts.length >= 2, JSON.stringify(runs.map((r) => r.status)));

// ---- getSamples response parsing: order is by raster, ids by locationId, unsampled points are simply absent, values are strings
const resp = { samples: [{ locationId: 2, value: '-5.674687386', rasterId: 3805 }, { locationId: 0, value: '-199.115493774', rasterId: 3805 }, { locationId: 3, value: 'NoData', rasterId: 3805 }, { locationId: 5, value: '72.625', rasterId: 172 }] };
const ps = D.parseSamples(resp, 6);
assert.deepStrictEqual(ps.e, [-199.12, null, -5.67, null, null, 72.63]); assert.deepStrictEqual(ps.r, [3805, null, 3805, null, null, 172]);
assert.deepStrictEqual(D.parseSamples({}, 2), { e: [null, null], r: [null, null] }); assert.deepStrictEqual(D.parseSamples({ samples: [{ locationId: 9, value: '1' }] }, 2).e, [null, null]);
console.log('DEPTH TESTS OK');
