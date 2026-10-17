// node test/live.test.js — hits the real APIs (needs network) and runs the sim for every preset
global.self = global;
require('../js/data.js');
const D = global.SP.data, M = require('../js/model.js'), R = require('../js/routes.js');
(async () => {
  const now = D.nowWall(), begin = D.ymd(now);
  console.log('Seattle wall time now:', new Date(now).toISOString().slice(0, 16));
  const [wx, al, zt, td, cu] = await Promise.all([D.loadWeather(), D.loadAlerts(), D.loadZoneText('PZZ135'), D.loadTides(begin), D.loadCurrents(begin)]);
  for (const [n, r] of [['weather', wx], ['alerts', al], ['zone text', zt], ['tides', td], ['currents', cu]]) console.log(n.padEnd(10), r.ok ? 'ok' : 'FAIL ' + r.err);
  if (cu.ok) console.log('current stations loaded', cu.data.stations.length + '/' + cu.data.total, 'failed:', cu.data.failed.map(f => f.id + ':' + f.err).join(', ') || '-');
  if (td.ok) console.log('tides:', td.data.station, 'hilo', td.data.hilo.length, 'series', td.data.series && td.data.series.length);
  if (al.ok) console.log('alerts:', al.data.map(a => a.event).join(', ') || 'none');
  if (zt.ok) console.log('zone text:', zt.data.source, zt.data.text.slice(0, 80).replace(/\n/g, ' '));
  const env = { wx: wx.ok ? { points: wx.data.points } : null, sun: wx.ok ? wx.data.sun : {}, cur: cu.ok ? { stations: cu.data.stations } : null };
  const boat = Object.assign({}, M.DEFAULT_BOAT);
  const dep = Math.ceil((now + 3600000) / 3600000) * 3600000;
  console.log('\nDeparture', M.hhmm(dep), 'boat 30 ft / LWL 25 (hull ' + M.hullSpeed(25).toFixed(2) + ' kt)');
  for (const p of R.PRESETS) {
    const r = M.simulate(p.pts, env, boat, dep, { agate: R.AGATE });
    console.log(p.id.padEnd(14), (r.totalNM.toFixed(1) + ' NM').padEnd(9), 'elapsed', r.elapsedH.toFixed(2).padStart(5) + ' h', 'avg SOG', r.avgSog.toFixed(2), 'ETA', M.hhmm(r.eta), '| ' + r.warnings.map(w => w.code).join(','));
  }
  const k = R.PRESETS.find(p => p.id === 'kingston'), r = M.simulate(k.pts, env, boat, dep, { agate: R.AGATE });
  console.log('\nKingston legs:'); r.legs.forEach(l => console.log('  ', l.brg.toFixed(0) + '°T', l.nm.toFixed(2), 'NM', l.pointOfSail.padEnd(14), l.mode.padEnd(9), 'TWS', l.avgTws.toFixed(1), 'TWA', l.avgTwa.toFixed(0), 'cur', l.curAlong.toFixed(2), 'kt', l.hours.toFixed(2), 'h'));
  const bd = M.bestDeparture(k.pts, env, boat, now, 36, { agate: R.AGATE });
  console.log('best-departure scan:', bd.length, 'departures; fastest', M.hhmm(bd.find(x => x.best).depart), bd.find(x => x.best).elapsedH.toFixed(2) + ' h; slowest', Math.max(...bd.map(x => x.elapsedH)).toFixed(2) + ' h');
})().catch(e => { console.error(e); process.exit(1); });
