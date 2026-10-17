// node test/depth.live.test.js [draft] [margin] — hits the live NCEI DEM for every preset at MLLW (tide 0, worst case)
global.self = global;
const M = require('../js/model.js'); global.SP = { model: M }; require('../js/data.js');
global.SP.model = M;
const D = global.SP.data, R = require('../js/routes.js');
const draft = +process.argv[2] || 5.5, margin = process.argv[3] != null ? +process.argv[3] : 2;
(async () => {
  console.log('draft', draft, 'ft, margin', margin, 'ft, tide = MLLW (0 ft)\n');
  for (const p of R.PRESETS) {
    const r = await D.loadDepth(p.pts, true);
    if (!r.ok) { console.log(p.id.padEnd(14), 'FAIL', r.err); continue; }
    const dem = r.data, legs = M.buildLegs(p.pts);
    const ev = M.evaluateDepth(dem, { draft, margin, nLegs: legs.length, etaAt: (s) => 0, tideAt: () => 0 });
    let worst = null; ev.legs.forEach((L) => { if (L.mllw && (!worst || L.mllw.mllw < worst.mllw.mllw)) worst = Object.assign({ leg: L.i + 1 }, L); });
    const ras = {}; dem.r.forEach((x) => { if (x != null) ras[dem.rasters[x].name + ' (' + dem.rasters[x].datum + ')'] = (ras[dem.rasters[x].name + ' (' + dem.rasters[x].datum + ')'] || 0) + 1; });
    const w = worst.mllw;
    console.log(p.id.padEnd(14), String(dem.samples.length).padStart(4) + ' pts', 'min ' + w.mllw.toFixed(1).padStart(6) + ' ft MLLW', 'leg ' + worst.leg, '@ ' + w.lat.toFixed(4) + ',' + w.lon.toFixed(4) + (w.marina ? ' [marina zone]' : ''),
      '| land pts ' + ev.nLand, 'nodata ' + ev.nNoData, '| statuses', ev.legs.map((L) => L.status[0]).join(''));
    ev.legs.forEach((L) => { if (L.status !== 'ok') console.log('     leg', L.i + 1, L.status, 'min', L.mllw && L.mllw.mllw.toFixed(1), L.land ? 'land@' + L.land.lat.toFixed(4) + ',' + L.land.lon.toFixed(4) + ' elev ' + L.land.elevM + ' m' : ''); });
    console.log('     sources:', Object.keys(ras).map((k) => k + ' x' + ras[k]).join('; '), (dem.notes || []).join(' '));
  }
})().catch((e) => { console.error(e); process.exit(1); });
