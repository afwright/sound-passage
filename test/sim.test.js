// node test/sim.test.js — sanity checks for the routing/ETA model
const M = require('../js/model.js');
const assert = require('assert');
const T0 = Date.UTC(2026, 9, 17, 10, 0);          // 10:00 wall
const H = 3600000;
function wx(ws, wd, gust) {
  const n = 60, mk = v => Array(n).fill(v);
  return { points: [{ id: 'W', lat: 47.75, lon: -122.45, t0: T0 - 2 * H, stepMs: H, ws: mk(ws), wd: mk(wd), gust: mk(gust || ws * 1.3), vis: mk(20000), pp: mk(0) }] };
}
function cur(vFlood, fd, ed) {
  const n = 200, v = Array(n).fill(vFlood);
  return { stations: [{ id: 'C', lat: 47.75, lon: -122.45, t0: T0 - 2 * H, stepMs: 1800000, v, fd, ed }] };
}
const env = (ws, wd, c) => ({ wx: wx(ws, wd), cur: c, sun: { '2026-10-17': { sunrise: Date.UTC(2026, 9, 17, 7, 31), sunset: Date.UTC(2026, 9, 17, 18, 17) } } });
const boat = Object.assign({}, M.DEFAULT_BOAT);
const route = [[47.6828, -122.4085], [47.6862, -122.4165], [47.7200, -122.4400], [47.7600, -122.4700], [47.7955, -122.4900]];
console.log('route NM', M.totalNM(route).toFixed(2), 'hull speed (LWL 25)', M.hullSpeed(25).toFixed(2));

function show(label, r) {
  console.log(label.padEnd(44), 'elapsed', r.elapsedH.toFixed(2) + ' h', ' avgSOG', r.avgSog.toFixed(2), 'kt  warnings:', r.warnings.map(w => w.code).join(',') || '-');
}
// 10 kt southerly, 1 kt flood (flood flows south, toward 200 deg) -> northbound sailing is a run against a foul tide
const rA = M.simulate(route, env(10, 180, cur(1.0, 200, 20)), boat, T0); show('S 10 kt + 1 kt flood (foul)', rA);
const rB = M.simulate(route, env(10, 180, cur(-1.0, 200, 20)), boat, T0); show('S 10 kt + 1 kt ebb (fair)', rB);
const rC = M.simulate(route, env(10, 180, null), boat, T0); show('S 10 kt, no current', rC);
const rD = M.simulate(route, env(10, 340, cur(0, 200, 20)), boat, T0); show('NNW 10 kt (beat), no tide', rD);
const rE = M.simulate(route, env(3, 340, cur(0, 200, 20)), boat, T0); show('NNW 3 kt (motoring)', rE);
const rF = M.simulate(route, env(10, 250, cur(0, 200, 20)), boat, T0); show('WSW 10 kt (reach)', rF);
console.log('legs (S 10 + 1 kt flood):'); rA.legs.forEach(l => console.log('  ', l.brg.toFixed(0) + '°T', l.nm.toFixed(2) + ' NM', l.pointOfSail, l.mode, 'TWS', l.avgTws.toFixed(1), 'TWA', l.avgTwa.toFixed(0), 'cur', l.curAlong.toFixed(2), 'h', l.hours.toFixed(2)));

// Sanity assertions
assert(rA.elapsedH > 2.0 && rA.elapsedH < 3.9, 'foul-tide run should take 2-3.9 h, got ' + rA.elapsedH);
assert(rB.elapsedH < rA.elapsedH, 'fair tide should be faster');
assert(rC.elapsedH > rB.elapsedH && rC.elapsedH < rA.elapsedH, 'no-tide between fair and foul');
assert(rD.elapsedH > rC.elapsedH, 'beating slower than running');
assert(rD.legs.some(l => l.tacks > 0), 'beat should report tacks');
assert(rE.legs.every(l => l.mode === 'motor'), 'light wind should motor');
// polar sanity
assert(M.boatSpeed(10, 20, boat) === 0, 'no-go zone has zero speed');
assert(M.boatSpeed(25, 90, boat) <= M.hullSpeed(25) + 1e-9, 'capped at hull speed');
const o = M.optimalAngles(10, boat); console.log('opt @10kt up', o.up.twa, o.up.vmg.toFixed(2), 'dn', o.dn.twa, o.dn.vmg.toFixed(2));
// cross-current flag: 7 kt cross current across a 5.5 kt motor boat
const rX = M.simulate([[47.70, -122.45], [47.70, -122.40]], env(0, 0, cur(7, 0, 180)), boat, T0);
assert(rX.warnings.some(w => w.code === 'crab'), 'cross current > boat speed should flag');
// best departure scan
const e2 = env(10, 180, { stations: [{ id: 'C', lat: 47.75, lon: -122.45, t0: T0 - 2 * H, stepMs: 1800000, v: Array(200).fill(0).map((_, i) => 1.5 * Math.sin(i / 25.0 * Math.PI)), fd: 200, ed: 20 }] });
const bd = M.bestDeparture(route, e2, boat, T0, 36); console.log('departures scanned:', bd.length, 'best', M.hhmm(bd.find(x => x.best).depart), bd.find(x => x.best).elapsedH.toFixed(2) + ' h', 'worst', Math.max(...bd.map(x => x.elapsedH)).toFixed(2) + ' h');
assert(bd.length > 5 && bd.some(x => x.best));
console.log('ALL OK');

// ---- preset route: Shilshole -> Kingston with 10 kt southerly and a 1 kt flood (sets south, i.e. against a northbound boat)
const RT = require('../js/routes.js');
const king = RT.PRESETS.find((p) => p.id === 'kingston').pts;
const eK = (c) => env(10, 180, c);
const k1 = M.simulate(king, eK(cur(1.0, 200, 20)), boat, T0), k2 = M.simulate(king, eK(cur(-1.0, 200, 20)), boat, T0), k0 = M.simulate(king, eK(null), boat, T0);
console.log('\nKingston preset', k1.totalNM.toFixed(2), 'NM');
show('  10 kt S + 1 kt flood (foul)', k1); show('  10 kt S + 1 kt ebb (fair)', k2); show('  10 kt S, no current', k0);
assert(k1.elapsedH > 2 && k1.elapsedH < 3.5, 'Kingston foul-tide time sane: ' + k1.elapsedH);
assert(k2.elapsedH < k0.elapsedH && k0.elapsedH < k1.elapsedH, 'ordering fair < none < foul');
// beating the same trip with a 10 kt northerly: needs tacks
const kb = M.simulate(king, env(10, 340, cur(0, 200, 20)), boat, T0); show('  10 kt NNW (beat)', kb);
assert(kb.elapsedH > k0.elapsedH && kb.legs.some((l) => l.tacks > 0));
console.log('ALL OK (preset)');
