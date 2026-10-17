/* Sound Passage — routing / ETA model. Pure functions, no DOM, no network.
 * All times are "wall-clock milliseconds": the local Seattle date/time fields
 * stored as if they were UTC (Date.UTC(y,m,d,h,mi)). Nothing here touches the
 * host time zone, so the same numbers come out in node and in any browser.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SP = root.SP || {}; root.SP.model = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NM_R = 3440.065;              // earth radius in nautical miles
  var D2R = Math.PI / 180;
  var HOUR = 3600000;

  // ---------------------------------------------------------------- geometry
  function norm360(a) { a = a % 360; return a < 0 ? a + 360 : a; }
  function angDiff(a, b) {          // smallest absolute angle between bearings, 0..180
    var d = Math.abs(norm360(a) - norm360(b)); return d > 180 ? 360 - d : d;
  }
  function distNM(a, b) {
    var p1 = a[0] * D2R, p2 = b[0] * D2R, dp = p2 - p1, dl = (b[1] - a[1]) * D2R;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * NM_R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {          // initial true bearing a -> b, degrees
    var p1 = a[0] * D2R, p2 = b[0] * D2R, dl = (b[1] - a[1]) * D2R;
    var y = Math.sin(dl) * Math.cos(p2);
    var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return norm360(Math.atan2(y, x) / D2R);
  }
  function lerpPt(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
  function buildLegs(pts) {
    var legs = [], cum = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var nm = distNM(pts[i], pts[i + 1]);
      legs.push({ i: i, from: pts[i], to: pts[i + 1], nm: nm, brg: bearing(pts[i], pts[i + 1]), start: cum, end: cum + nm });
      cum += nm;
    }
    return legs;
  }
  function totalNM(pts) { var t = 0; for (var i = 0; i < pts.length - 1; i++) t += distNM(pts[i], pts[i + 1]); return t; }
  function compass(deg) {
    var n = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return n[Math.round(norm360(deg) / 22.5) % 16];
  }

  // ------------------------------------------------------------------- polar
  // Generic cruiser polar as a FRACTION of hull speed (1.34*sqrt(LWL)).
  // Rows: true wind angle; columns: true wind speed (kt). No-go below ~40 deg.
  var TWS_AXIS = [0, 4, 6, 8, 10, 12, 14, 16, 20, 25];
  var TWA_AXIS = [0, 39.9, 40, 45, 52, 60, 75, 90, 110, 120, 135, 150, 165, 180];
  var POLAR = [
    /* 0   */ [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    /* 39.9*/ [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    /* 40  */ [0, .30, .42, .52, .58, .62, .64, .64, .60, .56],
    /* 45  */ [0, .35, .50, .60, .66, .70, .72, .72, .68, .62],
    /* 52  */ [0, .40, .55, .66, .73, .78, .80, .80, .76, .70],
    /* 60  */ [0, .45, .61, .72, .80, .85, .88, .88, .84, .78],
    /* 75  */ [0, .50, .66, .78, .86, .92, .95, .95, .92, .86],
    /* 90  */ [0, .52, .69, .82, .92, .98, 1.0, 1.0, .97, .90],
    /* 110 */ [0, .50, .68, .82, .92, .98, 1.0, 1.0, .98, .92],
    /* 120 */ [0, .46, .64, .78, .88, .95, 1.0, 1.0, .99, .95],
    /* 135 */ [0, .40, .56, .70, .80, .88, .95, .98, .98, .95],
    /* 150 */ [0, .34, .48, .60, .70, .78, .86, .92, .94, .92],
    /* 165 */ [0, .30, .42, .53, .62, .70, .78, .84, .88, .88],
    /* 180 */ [0, .27, .38, .48, .56, .64, .72, .78, .82, .82]
  ];
  function bracket(axis, v) {
    if (v <= axis[0]) return [0, 0, 0];
    var n = axis.length;
    if (v >= axis[n - 1]) return [n - 1, n - 1, 0];
    for (var i = 0; i < n - 1; i++) if (v < axis[i + 1]) return [i, i + 1, (v - axis[i]) / (axis[i + 1] - axis[i])];
    return [n - 1, n - 1, 0];
  }
  function polarFrac(tws, twa) {
    twa = Math.max(0, Math.min(180, twa));
    var a = bracket(TWA_AXIS, twa), s = bracket(TWS_AXIS, tws);
    function row(r) { return POLAR[r][s[0]] + (POLAR[r][s[1]] - POLAR[r][s[0]]) * s[2]; }
    var f = row(a[0]) + (row(a[1]) - row(a[0])) * a[2];
    if (tws > 20) f *= Math.max(0.7, 1 - 0.012 * (tws - 20));    // reef / depower
    return f;
  }
  function hullSpeed(lwl) { return 1.34 * Math.sqrt(Math.max(1, lwl)); }
  // Boat speed through water, kt. Capped at hull speed.
  function boatSpeed(tws, twa, boat) {
    var hs = hullSpeed(boat.lwl);
    return Math.min(hs, hs * (boat.perf == null ? 0.9 : boat.perf) * polarFrac(tws, twa));
  }
  var _optCache = {};
  // Best upwind/downwind true-wind angles by VMG.
  function optimalAngles(tws, boat) {
    var key = Math.round(tws * 2) + '|' + boat.lwl + '|' + boat.perf;
    if (_optCache[key]) return _optCache[key];
    var up = { twa: 45, vmg: 0, stw: 0 }, dn = { twa: 150, vmg: 0, stw: 0 }, a, v;
    for (a = 40; a <= 75; a += 1) {
      v = boatSpeed(tws, a, boat); var vm = v * Math.cos(a * D2R);
      if (vm > up.vmg) up = { twa: a, vmg: vm, stw: v };
    }
    for (a = 120; a <= 180; a += 1) {
      v = boatSpeed(tws, a, boat); var vd = v * Math.cos((180 - a) * D2R);
      if (vd > dn.vmg) dn = { twa: a, vmg: vd, stw: v };
    }
    if (Object.keys(_optCache).length > 4000) _optCache = {};
    return (_optCache[key] = { up: up, dn: dn });
  }
  function pointOfSail(twa, upTwa) {
    if (twa < upTwa - 0.5) return 'beat (tacking)';
    if (twa < 60) return 'close-hauled';
    if (twa < 80) return 'close reach';
    if (twa < 105) return 'beam reach';
    if (twa < 135) return 'broad reach';
    if (twa < 165) return 'deep reach';
    return 'run';
  }

  /* One-step leg model: speed made good through the water ALONG the course.
   * Returns { stw, mode, tack, gybe } where mode = 'sail' | 'motor' | 'motorsail'. */
  function legThroughWater(tws, twa, boat) {
    var opt = optimalAngles(Math.max(tws, 0.1), boat);
    var tackEff = 0.93;                    // time lost in tacks/gybes
    var windward = twa < opt.up.twa - 0.5; // inside the beating angle
    var out = { stw: 0, mode: 'sail', tack: false, gybe: false, windward: windward };

    var motorV = boat.motorKt * (1 - Math.min(0.2, 0.012 * Math.max(0, tws - 8) * (twa < 60 ? 1 : 0.3)));
    var motorLight = boat.motorBelowEnabled && tws < boat.motorBelowKt;
    var motorHere = motorLight || (windward && boat.motorWindward);

    if (motorHere) {
      var assist = 0;
      if (boat.motorSail && tws >= 5) {
        var tf = Math.max(twa, opt.up.twa);
        assist = Math.min(1.2, 0.35 * boatSpeed(tws, tf, boat));
      }
      out.mode = assist > 0.05 ? 'motorsail' : 'motor';
      out.stw = motorV + assist;
      return out;
    }
    if (windward) {                       // VMG to windward: V(opt)*cos(opt)/cos(twa)
      out.stw = (opt.up.stw * Math.cos(opt.up.twa * D2R) / Math.cos(Math.min(twa, 89) * D2R)) * tackEff;
      out.tack = true;
      return out;
    }
    var direct = boatSpeed(tws, twa, boat);
    if (twa > opt.dn.twa + 0.5) {         // deep: gybing downwind may beat the straight run
      var vmc = (opt.dn.stw * Math.cos((180 - opt.dn.twa) * D2R) / Math.cos((180 - twa) * D2R)) * tackEff;
      if (vmc > direct) { out.stw = vmc; out.gybe = true; return out; }
    }
    out.stw = direct;
    return out;
  }

  // ----------------------------------------------------- environment sampling
  // Regular-grid series: { t0, stepMs, ... arrays }
  function seriesAt(arr, t0, step, t) {
    if (!arr || !arr.length) return null;
    var x = (t - t0) / step;
    if (x <= 0) return arr[0];
    if (x >= arr.length - 1) return arr[arr.length - 1];
    var i = Math.floor(x), f = x - i, a = arr[i], b = arr[i + 1];
    if (a == null) return b; if (b == null) return a;
    return a + (b - a) * f;
  }
  function uvFromDirSpeed(dirTo, spd) { return [spd * Math.sin(dirTo * D2R), spd * Math.cos(dirTo * D2R)]; }
  function dirFromUV(u, v) { return norm360(Math.atan2(u, v) / D2R); }

  function nearest(list, lat, lon, k) {
    var out = [];
    for (var i = 0; i < list.length; i++) out.push({ o: list[i], d: distNM([lat, lon], [list[i].lat, list[i].lon]) });
    out.sort(function (a, b) { return a.d - b.d; });
    return out.slice(0, k);
  }

  // Wind at position/time: inverse-distance blend of the 3 nearest weather points.
  // Returns { tws, twd (direction wind blows FROM), gust, vis, precipProb, from: [ids] }
  function windAt(env, lat, lon, t) {
    var pts = env && env.wx && env.wx.points; if (!pts || !pts.length) return null;
    var near = nearest(pts, lat, lon, 3), su = 0, sv = 0, sg = 0, sw = 0, vis = null, pp = 0, pw = 0;
    near.forEach(function (n) {
      var p = n.o, ws = seriesAt(p.ws, p.t0, p.stepMs, t), wd = seriesAt(p.wd, p.t0, p.stepMs, t);
      if (ws == null || wd == null) return;
      var g = seriesAt(p.gust, p.t0, p.stepMs, t); if (g == null) g = ws;
      var w = 1 / (n.d * n.d + 1);
      var uv = uvFromDirSpeed(norm360(wd + 180), ws);   // vector of where the wind goes
      su += uv[0] * w; sv += uv[1] * w; sg += g * w; sw += w;
      var vi = seriesAt(p.vis, p.t0, p.stepMs, t); if (vi != null && (vis == null || vi < vis)) vis = vi;
      var pr = seriesAt(p.pp, p.t0, p.stepMs, t); if (pr != null) { pp += pr * w; pw += w; }
    });
    if (!sw) return null;
    var u = su / sw, v = sv / sw;
    return { tws: Math.sqrt(u * u + v * v), twd: norm360(dirFromUV(u, v) + 180), gust: sg / sw, vis: vis, precipProb: pw ? pp / pw : null };
  }

  // Current vector at position/time, from the 2 nearest stations within reach.
  // Station: { id, lat, lon, t0, stepMs, v:[signed kt, +flood], fd, ed } fd/ed are numbers
  // (a station can also carry per-sample arrays fdA/edA).
  // Returns { u, v, speed, dir, along?:filled by caller, ids, conf }
  var CUR_REACH_NM = 8;
  function stationVec(st, t) {
    var sp = seriesAt(st.v, st.t0, st.stepMs, t); if (sp == null) return null;
    var dir = sp >= 0 ? st.fd : st.ed;
    return uvFromDirSpeed(dir, Math.abs(sp));
  }
  function currentAt(env, lat, lon, t) {
    var sts = env && env.cur && env.cur.stations; if (!sts || !sts.length) return { u: 0, v: 0, speed: 0, dir: 0, ids: [], conf: 0 };
    var near = nearest(sts, lat, lon, 4).filter(function (n) { return n.d <= CUR_REACH_NM; }).slice(0, 2);
    if (!near.length) return { u: 0, v: 0, speed: 0, dir: 0, ids: [], conf: 0 };
    var su = 0, sv = 0, sw = 0, ids = [];
    near.forEach(function (n) {
      var uv = stationVec(n.o, t); if (!uv) return;
      var w = 1 / (n.d * n.d + 0.25);
      su += uv[0] * w; sv += uv[1] * w; sw += w; ids.push(n.o.id);
    });
    if (!sw) return { u: 0, v: 0, speed: 0, dir: 0, ids: [], conf: 0 };
    // fade out when even the nearest station is far away
    var conf = Math.max(0, Math.min(1, 1 - (near[0].d - 3) / 5));
    var u = su / sw * conf, v = sv / sw * conf;
    return { u: u, v: v, speed: Math.sqrt(u * u + v * v), dir: dirFromUV(u, v), ids: ids, conf: conf };
  }

  // -------------------------------------------------------------- simulation
  function dayKey(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function sunFor(env, ms) { return env && env.sun ? env.sun[dayKey(ms)] || null : null; }

  /* simulate(pts, env, boat, departMs, opts) -> result
   * pts: [[lat,lon],...]   boat: see DEFAULT_BOAT   opts: { stepMin, agate:[[lat,lon],..] }
   */
  function simulate(pts, env, boat, departMs, opts) {
    opts = opts || {};
    var stepMs = (opts.stepMin || 5) * 60000;
    var legs = buildLegs(pts), total = legs.length ? legs[legs.length - 1].end : 0;
    var agate = opts.agate || [];
    var res = {
      depart: departMs, eta: departMs, elapsedH: 0, totalNM: total, avgSog: 0, legs: [], warnings: [],
      samples: [], usedCurrent: !!(env && env.cur && env.cur.stations && env.cur.stations.length),
      usedWind: !!(env && env.wx && env.wx.points && env.wx.points.length)
    };
    if (!legs.length) return res;
    var L = legs.map(function (l) {
      return { i: l.i, brg: l.brg, nm: l.nm, t: 0, tws: 0, twaW: 0, curAlong: 0, sail: 0, motor: 0, msail: 0, tackNM: 0, gybeNM: 0, w: 0, maxGust: 0, twd: 0 };
    });
    var t = departMs, s = 0, guard = 0, maxGust = { v: 0 }, crabFail = 0, stalled = 0, calm = 0, agateBad = null, bigAgainst = null, lowVis = null, beyond = false;
    var wxEnd = null;
    if (res.usedWind) { var p0 = env.wx.points[0]; wxEnd = p0.t0 + (p0.ws.length - 1) * p0.stepMs; }

    while (s < total - 1e-7 && guard++ < 4000) {
      var li = 0; while (li < legs.length - 1 && s >= legs[li].end - 1e-9) li++;
      var leg = legs[li], pos = lerpPt(leg.from, leg.to, (s - leg.start) / leg.nm);
      var wind = windAt(env, pos[0], pos[1], t) || { tws: 0, twd: 0, gust: 0, vis: null };
      var cur = currentAt(env, pos[0], pos[1], t);
      var twa = angDiff(wind.twd, leg.brg);
      var m = legThroughWater(wind.tws, twa, boat);
      var stw = m.stw, floor = false;
      if (stw < 0.5 && m.mode === 'sail') { stw = 0.5; floor = true; calm++; }

      // resolve current into along / cross components
      var cu = cur.u, cv = cur.v, b = leg.brg * D2R;
      var along = cu * Math.sin(b) + cv * Math.cos(b);
      var cross = Math.abs(cu * Math.cos(b) - cv * Math.sin(b));
      var sog;
      if (m.tack || m.gybe) sog = stw + along;                    // cross-set averages out over the tacks
      else if (cross >= stw) { sog = along; crabFail++; }          // cannot hold the course line
      else sog = Math.sqrt(stw * stw - cross * cross) + along;
      if (sog < 0.3) { sog = 0.3; stalled++; }

      var dtMs = stepMs, dS = sog * dtMs / HOUR, remLeg = leg.end - s;
      if (dS > remLeg) { dtMs = remLeg / sog * HOUR; dS = remLeg; }
      var dtH = dtMs / HOUR;

      var A = L[li]; A.w += dtH; A.t += dtH; A.tws += wind.tws * dtH; A.twaW += twa * dtH; A.twd += wind.twd * dtH;
      A.curAlong += along * dtH; if (wind.gust > A.maxGust) A.maxGust = wind.gust;
      if (m.mode === 'sail') A.sail += dtH; else if (m.mode === 'motor') A.motor += dtH; else A.msail += dtH;
      if (m.tack) A.tackNM += dS; if (m.gybe) A.gybeNM += dS;
      if (wind.gust > maxGust.v) maxGust = { v: wind.gust, t: t, pos: pos };
      if (along < -1.5) {
        for (var k = 0; k < agate.length; k++) if (distNM(pos, agate[k]) < 1.3) { if (!agateBad || along < agateBad.v) agateBad = { v: along, t: t }; }
        if (!bigAgainst || along < bigAgainst.v) bigAgainst = { v: along, t: t, pos: pos };
      }
      if (wind.vis != null && wind.vis < 3700 && (!lowVis || wind.vis < lowVis.v)) lowVis = { v: wind.vis, t: t };
      if (wxEnd != null && t > wxEnd) beyond = true;
      res.samples.push({ t: t, s: s, tws: wind.tws, twd: wind.twd, gust: wind.gust, along: along, cross: cross, sog: sog, stw: stw, mode: m.mode });

      s += dS; t += dtMs;
    }
    res.eta = t; res.elapsedH = (t - departMs) / HOUR;
    res.avgSog = res.elapsedH > 0 ? total / res.elapsedH : 0;

    res.legs = L.map(function (a, i) {
      var h = a.w || 1e-9, avgTwa = a.twaW / h, avgTws = a.tws / h;
      var opt = optimalAngles(Math.max(avgTws, 0.1), boat);
      var tackLeg = 1.5;                                          // typical NM per tack inside the Sound
      return {
        i: i, from: legs[i].from, to: legs[i].to, brg: a.brg, nm: a.nm, hours: a.t,
        avgTws: avgTws, avgTwa: avgTwa, avgTwd: a.twd / h, maxGust: a.maxGust,
        pointOfSail: pointOfSail(avgTwa, opt.up.twa),
        sailFrac: a.sail / h, motorFrac: a.motor / h, msailFrac: a.msail / h,
        mode: a.motor / h > 0.8 ? 'motor' : (a.msail / h > 0.5 ? 'motor-sail' : (a.motor + a.msail) / h > 0.15 ? 'sail+motor' : 'sail'),
        tacks: a.tackNM > 0.05 ? Math.max(1, Math.round(a.tackNM / tackLeg)) : 0,
        gybes: a.gybeNM > 0.05 ? Math.max(1, Math.round(a.gybeNM / 3)) : 0,
        curAlong: a.curAlong / h, avgSog: a.nm / (a.t || 1e-9)
      };
    });

    // ----- warnings
    var W = res.warnings;
    if (maxGust.v > 25) W.push({ lvl: 'bad', code: 'gust', text: 'Gusts to ' + maxGust.v.toFixed(0) + ' kt forecast along the route' + (maxGust.t ? ' (' + hhmm(maxGust.t) + ')' : '') + '.' });
    else if (maxGust.v > 20) W.push({ lvl: 'warn', code: 'gust', text: 'Gusts to ' + maxGust.v.toFixed(0) + ' kt possible (' + hhmm(maxGust.t) + ') — consider a reef.' });
    if (opts.advisories && opts.advisories.length) W.push({ lvl: 'bad', code: 'advisory', text: 'Active NWS marine alert: ' + opts.advisories.join('; ') + '.' });
    if (agateBad) W.push({ lvl: 'bad', code: 'agate', text: 'Against ' + Math.abs(agateBad.v).toFixed(1) + ' kt of current in Agate Passage (' + hhmm(agateBad.t) + ') — re-time to pass near slack.' });
    else if (bigAgainst && bigAgainst.v < -2) W.push({ lvl: 'warn', code: 'foul', text: 'Foul current up to ' + Math.abs(bigAgainst.v).toFixed(1) + ' kt (' + hhmm(bigAgainst.t) + ').' });
    if (crabFail) W.push({ lvl: 'bad', code: 'crab', text: 'Cross-current exceeds boat speed on part of the route — you cannot hold the course line there.' });
    if (stalled) W.push({ lvl: 'bad', code: 'stall', text: 'Made-good speed falls under 0.3 kt in places (foul current / no wind).' });
    if (calm && !boat.motorBelowEnabled) W.push({ lvl: 'warn', code: 'calm', text: 'Very light wind for ' + (calm * (opts.stepMin || 5) / 60).toFixed(1) + ' h — enable "motor in light wind" or expect to drift.' });
    var tackTotal = res.legs.reduce(function (a, l) { return a + l.tacks; }, 0);
    if (tackTotal) W.push({ lvl: 'info', code: 'tack', text: 'Windward work: roughly ' + tackTotal + (tackTotal === 1 ? ' tack' : ' tacks') + ' needed; ETA uses VMG.' });
    var sun = sunFor(opts.env || env, t), sunD = sunFor(opts.env || env, departMs);
    if (sun && sun.sunset && t > sun.sunset) W.push({ lvl: 'warn', code: 'sunset', text: 'Arrival ' + hhmm(t) + ' is after sunset (' + hhmm(sun.sunset) + ').' });
    if (sunD && sunD.sunrise && departMs < sunD.sunrise) W.push({ lvl: 'warn', code: 'dark', text: 'Departure ' + hhmm(departMs) + ' is before sunrise (' + hhmm(sunD.sunrise) + ').' });
    if (lowVis) W.push({ lvl: 'warn', code: 'vis', text: 'Visibility down to ' + (lowVis.v / 1852).toFixed(1) + ' NM forecast (' + hhmm(lowVis.t) + ').' });
    if (beyond) W.push({ lvl: 'info', code: 'beyond', text: 'Part of the passage is beyond the forecast window; last forecast values were held.' });
    if (!res.usedCurrent) W.push({ lvl: 'info', code: 'nocur', text: 'No current data — ETA ignores tidal current.' });
    if (!res.usedWind) W.push({ lvl: 'info', code: 'nowind', text: 'No wind data — speeds are from a calm-wind default.' });
    res.maxGust = maxGust.v;
    res.arriveAfterSunset = !!(sun && sun.sunset && t > sun.sunset);
    res.score = W.filter(function (w) { return w.lvl === 'bad'; }).length;
    return res;
  }

  function hhmm(ms) { return ms ? new Date(ms).toISOString().slice(11, 16) : '--:--'; }

  /* Scan departures every 30 min from fromMs for hours, daylight departures only. */
  function bestDeparture(pts, env, boat, fromMs, hours, opts) {
    opts = opts || {}; var out = [], step = 30 * 60000, tEnd = fromMs + hours * HOUR;
    var start = Math.ceil(fromMs / step) * step;
    for (var d = start; d <= tEnd; d += step) {
      var sun = sunFor(env, d);
      if (sun && sun.sunrise && sun.sunset && (d < sun.sunrise || d > sun.sunset)) continue;
      var r = simulate(pts, env, boat, d, Object.assign({}, opts, { stepMin: opts.stepMin || 10 }));
      out.push({ depart: d, eta: r.eta, elapsedH: r.elapsedH, avgSog: r.avgSog, bad: r.score, afterSunset: r.arriveAfterSunset, maxGust: r.maxGust });
    }
    if (out.length) {
      var best = Math.min.apply(null, out.map(function (o) { return o.elapsedH; }));
      out.forEach(function (o) { o.fast = o.elapsedH <= best * 1.05 + 1e-9; o.best = o.elapsedH === best; });
    }
    return out;
  }

  // ------------------------------------------------------------------- tides
  // Predicted tide height (ft above MLLW) at wall-ms t. T = { series:[[ms,ft],..] (regular grid), hilo:[{t,v},..] }.
  // Returns null outside the data window.
  function tideHeightAt(T, t) {
    if (!T) return null;
    if (T.series && T.series.length > 1) {
      var a = T.series; if (t < a[0][0] || t > a[a.length - 1][0]) return null;
      var i = Math.min(a.length - 2, Math.floor((t - a[0][0]) / (a[1][0] - a[0][0])));
      var f = (t - a[i][0]) / (a[i + 1][0] - a[i][0]); return a[i][1] + (a[i + 1][1] - a[i][1]) * f;
    }
    var h = T.hilo || []; for (var k = 0; k < h.length - 1; k++) if (t >= h[k].t && t <= h[k + 1].t) {
      var g = (t - h[k].t) / (h[k + 1].t - h[k].t); return h[k].v + (h[k + 1].v - h[k].v) * (1 - Math.cos(Math.PI * g)) / 2;
    }
    return null;
  }
  // Wall-ms at which the simulated boat has covered d NM (reads res.samples; same mapping the leg ETAs use).
  function etaAtDist(res, d) {
    if (!res || !res.samples || !res.samples.length) return null;
    var sm = res.samples; if (d <= 0) return res.depart; if (d >= res.totalNM - 1e-6) return res.eta;
    for (var i = 1; i < sm.length; i++) if (sm[i].s >= d) { var f = (d - sm[i - 1].s) / (sm[i].s - sm[i - 1].s || 1); return sm[i - 1].t + (sm[i].t - sm[i - 1].t) * f; }
    return res.eta;
  }

  // ------------------------------------------------------------------- depth
  var FT_PER_M = 3.28084, M_PER_NM = 1852;
  // Vertical offsets: height of each datum ABOVE MLLW at Seattle 9447130, metres. Source: NOAA CO-OPS
  // https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/9447130/datums.json?units=metric
  // fetched 2026-10-17 (epoch 1983-2001): MLLW 2.419, MSL 4.443, MHW 5.618, NAVD88 3.134 m above station datum.
  // So NAVD88 = MLLW + 0.715 m (2.35 ft): a point at NAVD88 elevation 0 is 0.715 m ABOVE the chart datum.
  var DATUM_ABOVE_MLLW_M = { 'NAVD 88': 3.134 - 2.419, 'MSL': 4.443 - 2.419, 'Sea Level': 4.443 - 2.419, 'MHW': 5.618 - 2.419 };
  var DEM_SAMPLE_M = 50, DEM_MAX_POINTS = 3000, MARINA_NM = 150 / M_PER_NM;

  // Depth of water below MLLW in ft (negative = dries above MLLW) at a DEM elevation (m, in `datum`).
  // depth_below_MLLW = -(elev_in_datum + datum_height_above_MLLW). Null when the datum is unknown.
  function depthBelowMllwFt(elevM, datum) {
    var off = DATUM_ABOVE_MLLW_M[datum == null ? 'NAVD 88' : datum];
    if (elevM == null || off == null) return null;
    return -(elevM + off) * FT_PER_M;
  }
  // Water depth at passage and clearance under the keel (ft). tideFt = predicted height above MLLW.
  function clearance(depthMllwFt, tideFt, draftFt) {
    var d = depthMllwFt + tideFt; return { depth: d, ukc: d - draftFt };
  }

  // FNV-1a hash of the waypoint geometry (+ spacing) -> cache key for a route's bathymetry samples.
  function routeHash(pts, stepM) {
    var h = 0x811c9dc5, str = (stepM || DEM_SAMPLE_M) + '|' + pts.map(function (p) { return p[0].toFixed(5) + ',' + p[1].toFixed(5); }).join(';');
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
  }

  /* Points every ~stepM along the legs: [{ s (NM from start), leg, lat, lon }]. Includes the start and every
   * waypoint; spacing widens only when the route would need more than maxPts samples. */
  function sampleRoute(pts, stepM, maxPts) {
    stepM = stepM || DEM_SAMPLE_M; maxPts = maxPts || DEM_MAX_POINTS;
    var legs = buildLegs(pts), total = legs.length ? legs[legs.length - 1].end * M_PER_NM : 0;
    if (total / stepM > maxPts) stepM = total / maxPts;
    var out = [];
    legs.forEach(function (l, i) {
      var n = Math.max(1, Math.ceil(l.nm * M_PER_NM / stepM));
      for (var k = (i === 0 ? 0 : 1); k <= n; k++) {
        var p = lerpPt(l.from, l.to, k / n); out.push({ s: l.start + l.nm * k / n, leg: i, lat: p[0], lon: p[1] });
      }
    });
    return out;
  }

  /* evaluateDepth(dem, opts) -> { legs, warnings, nLand, nNoData, tideMissing }
   * dem:  { samples: sampleRoute(...), e: [elevation m | null per sample], r: [raster id per sample], rasters: { id: { datum } } }
   * opts: { draft, margin (ft), etaAt(nmFromStart)->wall ms|null, tideAt(ms)->ft above MLLW|null, nLegs }
   * Depths are ft; "mllw" = charted-style depth below MLLW, "atEta" = depth when the boat passes (MLLW depth + tide). */
  function evaluateDepth(dem, opts) {
    var draft = opts.draft, margin = opts.margin, S = dem.samples, nLegs = opts.nLegs || (S.length ? S[S.length - 1].leg + 1 : 0);
    var legs = [], i, tideMissing = false;
    for (i = 0; i < nLegs; i++) legs.push({ i: i, n: 0, valid: 0, nLand: 0, nNoData: 0, mllw: null, atEta: null, land: null, noData: null, status: 'nodata' });
    for (i = 0; i < S.length; i++) {
      var sm = S[i], L = legs[sm.leg], e = dem.e[i], rs = dem.rasters && dem.rasters[dem.r && dem.r[i]], datum = rs ? rs.datum : 'NAVD 88';
      L.n++;
      var dm = e == null ? null : depthBelowMllwFt(e, datum);
      var base = { s: sm.s, lat: sm.lat, lon: sm.lon, marina: sm.s <= MARINA_NM, elevM: e };
      if (dm == null) { L.nNoData++; if (!L.noData) L.noData = base; continue; }
      L.valid++;
      var land = e > 0, t = opts.etaAt ? opts.etaAt(sm.s) : null, tide = t == null || !opts.tideAt ? null : opts.tideAt(t);
      if (tide == null) { tide = 0; tideMissing = true; }
      var c = clearance(dm, tide, draft);
      var hit = Object.assign({ kind: land ? 'land' : 'water', mllw: dm, tide: tide, t: t, depth: c.depth, ukc: c.ukc }, base);
      if (land) { L.nLand++; if (!L.land) L.land = hit; }
      if (!L.mllw || dm < L.mllw.mllw) L.mllw = hit;
      if (!L.atEta || c.ukc < L.atEta.ukc) L.atEta = hit;
    }
    var W = [], nLand = 0, nNoData = 0;
    legs.forEach(function (L) {
      nLand += L.nLand; nNoData += L.nNoData;
      if (!L.valid) { L.status = 'nodata'; }
      else if (L.land || L.atEta.ukc < 0) L.status = 'aground';
      else if (L.atEta.ukc < margin) L.status = 'thin';
      else L.status = 'ok';
      L.driesAtMllw = !!(L.mllw && L.mllw.mllw < 0);
      L.belowDraftMllw = !!(L.mllw && L.mllw.mllw < draft);
      var A = L.atEta, tag = 'Leg ' + (L.i + 1), where = function (h) { return h.lat.toFixed(4) + ', ' + h.lon.toFixed(4); };
      if (L.land) {
        var m0 = L.land.marina;
        W.push({ lvl: 'bad', code: 'depth', leg: L.i, text: tag + (m0 ? ' (marina basin — check the chart)' : '') + ': the depth grid shows land / drying ground (' + sgnFt(L.land.elevM * FT_PER_M) + ' ft above NAVD88) at ' + where(L.land) +
          (L.nLand > 1 ? ' and ' + (L.nLand - 1) + ' more point' + (L.nLand > 2 ? 's' : '') : '') + ' — the leg crosses land or a drying bank' + (m0 ? '.' : '; check the chart.') });
      } else if (L.status === 'aground' || L.status === 'thin') {
        var lbl = tag + (A.marina ? ' (marina basin — check the chart)' : '');
        W.push({ lvl: L.status === 'aground' ? 'bad' : 'warn', code: 'depth', leg: L.i, text: lbl + ': ' + A.depth.toFixed(1) + ' ft of water at ' + hhmm(A.t) + ' (' + A.mllw.toFixed(1) + ' ft MLLW, tide ' + sgnFt(A.tide) + ' ft) — ' +
          (A.ukc < 0 ? (-A.ukc).toFixed(1) + ' ft less than your ' + draft.toFixed(1) + ' ft draft' : A.ukc.toFixed(1) + ' ft under keel, below your ' + margin.toFixed(1) + ' ft margin') + ' near ' + where(A) + '.' });
      }
      if (L.valid && L.belowDraftMllw && L.status !== 'nodata') {
        var Mn = L.mllw;
        W.push({ lvl: 'info', code: 'depth-tide', leg: L.i, text: tag + ' is tide-dependent: shallowest ' + Mn.mllw.toFixed(1) + ' ft MLLW' + (Mn.mllw < 0 ? ' (dries at low water)' : ' (below your ' + draft.toFixed(1) + ' ft draft at MLLW)') + ' near ' + where(Mn) +
          (Mn.mllw < draft + margin ? '; needs about ' + Math.max(0, draft + margin - Mn.mllw).toFixed(1) + ' ft of tide for your margin' : '') + '.' });
      }
      if (L.nNoData) W.push({ lvl: 'warn', code: 'depth-nodata', leg: L.i, text: tag + ': no depth data for ' + L.nNoData + ' of ' + L.n + ' sample points' + (L.noData ? ' (first near ' + where(L.noData) + ')' : '') + ' — depth not checked there.' });
    });
    if (tideMissing) W.push({ lvl: 'info', code: 'depth-notide', text: 'Tide prediction does not cover the whole passage — depths there are evaluated at MLLW (worst case).' });
    return { legs: legs, warnings: W, nLand: nLand, nNoData: nNoData, tideMissing: tideMissing, draft: draft, margin: margin };
  }
  function sgnFt(v) { return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1); }
  // Runs of consecutive samples sharing a status, for colouring the route line: [{ status, pts:[[lat,lon],..] }] (ok runs omitted).
  function depthRuns(dem, dres, opts) {
    var runs = [], cur = null;
    dem.samples.forEach(function (sm, i) {
      var e = dem.e[i], rs = dem.rasters && dem.rasters[dem.r && dem.r[i]], dm = e == null ? null : depthBelowMllwFt(e, rs ? rs.datum : 'NAVD 88'), st = 'ok';
      if (dm == null) st = 'nodata';
      else {
        var t = opts.etaAt ? opts.etaAt(sm.s) : null, tide = t == null || !opts.tideAt ? null : opts.tideAt(t), u = dm + (tide == null ? 0 : tide) - dres.draft;
        st = e > 0 || u < 0 ? 'aground' : u < dres.margin ? 'thin' : 'ok';
      }
      if (st === 'ok') { cur = null; return; }
      if (!cur || cur.status !== st) { cur = { status: st, pts: [] }; runs.push(cur); }
      cur.pts.push([sm.lat, sm.lon]);
    });
    return runs.filter(function (r) { return r.status !== 'nodata'; });
  }

  var DEFAULT_BOAT = { loa: 30, lwl: 25, perf: 0.9, motorKt: 5.5, motorBelowEnabled: true, motorBelowKt: 5, motorWindward: false, motorSail: false, draft: 5.5, margin: 2 };
  var BOAT_PRESETS = {
    'daysailer-24': { label: '24-ft daysailer', loa: 24, lwl: 20, perf: 0.9, motorKt: 4.5 },
    'cruiser-30': { label: '30-ft cruiser', loa: 30, lwl: 25, perf: 0.9, motorKt: 5.5 },
    'cruiser-36': { label: '36-ft cruiser', loa: 36, lwl: 30, perf: 0.9, motorKt: 6.0 },
    'cruiser-42': { label: '42-ft cruiser', loa: 42, lwl: 35, perf: 0.9, motorKt: 6.5 },
    'perf-35': { label: '35-ft performance', loa: 35, lwl: 31, perf: 1.0, motorKt: 6.0 }
  };

  return {
    HOUR: HOUR, norm360: norm360, angDiff: angDiff, distNM: distNM, bearing: bearing, lerpPt: lerpPt, buildLegs: buildLegs,
    totalNM: totalNM, compass: compass, polarFrac: polarFrac, hullSpeed: hullSpeed, boatSpeed: boatSpeed,
    optimalAngles: optimalAngles, pointOfSail: pointOfSail, legThroughWater: legThroughWater, seriesAt: seriesAt,
    windAt: windAt, currentAt: currentAt, stationVec: stationVec, uvFromDirSpeed: uvFromDirSpeed, dirFromUV: dirFromUV,
    simulate: simulate, bestDeparture: bestDeparture, sunFor: sunFor, hhmm: hhmm, dayKey: dayKey,
    tideHeightAt: tideHeightAt, etaAtDist: etaAtDist, FT_PER_M: FT_PER_M, DATUM_ABOVE_MLLW_M: DATUM_ABOVE_MLLW_M, DEM_SAMPLE_M: DEM_SAMPLE_M, MARINA_NM: MARINA_NM,
    depthBelowMllwFt: depthBelowMllwFt, clearance: clearance, routeHash: routeHash, sampleRoute: sampleRoute, evaluateDepth: evaluateDepth, depthRuns: depthRuns,
    DEFAULT_BOAT: DEFAULT_BOAT, BOAT_PRESETS: BOAT_PRESETS
  };
});
