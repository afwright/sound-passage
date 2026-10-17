/* Sound Passage — data layer: keyless public APIs fetched straight from the browser,
 * with a small localStorage cache (20 min TTL) and per-source error states.
 * Times are "wall-clock ms" (Seattle local fields stored as UTC) — see model.js. */
(function (root) {
  'use strict';
  var SP = root.SP = root.SP || {};
  var TTL = 20 * 60 * 1000, STALE_OK = 6 * 3600 * 1000, TZ = 'America/Los_Angeles';

  // ---------------------------------------------------------------- stations
  // NOAA CO-OPS current-prediction stations (ids + bins verified against the mdapi / datagetter).
  // fl = "key" station: also fetch the next slack/max events for the currents panel.
  var CURRENT_STATIONS = [
    { id: 'PUG1515', bin: 15, name: 'West Point, W of', lat: 47.6621, lon: -122.4417, key: 1 },
    { id: 'PUG1509', bin: 9, name: 'Point Jefferson, E of', lat: 47.7445, lon: -122.468, key: 1 },
    { id: 'PUG1501', bin: 6, name: 'Agate Passage, S end', lat: 47.711, lon: -122.5671, key: 1 },
    { id: 'PUG1514', bin: 8, name: 'Rich Passage, W end', lat: 47.5899, lon: -122.5623, key: 1 },
    { id: 'PUG1513', bin: 10, name: 'Rich Passage, E end', lat: 47.57, lon: -122.5298 },
    { id: 'PUG1505', bin: 8, name: 'Eagle Harbor entrance', lat: 47.6196, lon: -122.4953 },
    { id: 'PUG1517', bin: 21, name: 'Blake Island, S of', lat: 47.5203, lon: -122.4879 },
    { id: 'PUG1516', bin: 17, name: 'Alki Point, W of', lat: 47.5761, lon: -122.4278 },
    { id: 'PUG1512', bin: 19, name: 'Restoration Point', lat: 47.5788, lon: -122.4687 },
    { id: 'PUG1520', bin: 35, name: 'Dolphin Point, E of', lat: 47.5015, lon: -122.4236 },
    { id: 'PUG1518', bin: 19, name: 'Colvos Passage (Anderson Pt)', lat: 47.4394, lon: -122.5258, key: 1 },
    { id: 'PUG1519', bin: 18, name: 'Colvos Passage (Pt Richmond)', lat: 47.3766, lon: -122.5287 },
    { id: 'PUG1523', bin: 14, name: 'Gig Harbor entrance', lat: 47.3242, lon: -122.5719 },
    { id: 'PUG1503', bin: 34, name: 'Edmonds, 2.5 mi W of', lat: 47.8071, lon: -122.4441 },
    { id: 'PUG1511', bin: 38, name: 'President Point, E of', lat: 47.7671, lon: -122.4319 },
    { id: 'PUG1607', bin: 33, name: 'Point No Point, E of', lat: 47.9189, lon: -122.4841, key: 1 },
    { id: 'PUG1610', bin: 33, name: 'Foulweather Bluff, NE of', lat: 47.9543, lon: -122.5786 },
    { id: 'PUG1605', bin: 40, name: 'Possession Sound entrance', lat: 47.8993, lon: -122.3601 },
    { id: 'PUG1612', bin: 10, name: 'Clinton Ferry Terminal', lat: 47.969, lon: -122.3451 },
    { id: 'PUG1616', bin: 31, name: 'Admiralty Inlet (Bush Pt)', lat: 48.0335, lon: -122.6376, key: 1 },
    { id: 'PUG1619', bin: 46, name: 'Marrowstone Pt, NE of', lat: 48.1063, lon: -122.6725 },
    { id: 'PUG1623', bin: 45, name: 'Point Wilson, NE of', lat: 48.1501, lon: -122.7454, key: 1 }
  ];
  // Open-Meteo points spread over the sound (names are for the map tooltip).
  var WX_POINTS = [
    { id: 'shilshole', name: 'Shilshole', lat: 47.69, lon: -122.43 },
    { id: 'kingston', name: 'Mid-sound off Kingston', lat: 47.80, lon: -122.44 },
    { id: 'madison', name: 'Port Madison / Agate', lat: 47.73, lon: -122.52 },
    { id: 'poulsbo', name: 'Liberty Bay', lat: 47.72, lon: -122.62 },
    { id: 'blake', name: 'Blake Island', lat: 47.54, lon: -122.50 },
    { id: 'elliott', name: 'Elliott Bay', lat: 47.61, lon: -122.38 },
    { id: 'edmonds', name: 'Edmonds', lat: 47.81, lon: -122.40 },
    { id: 'poss', name: 'Possession Sound', lat: 47.93, lon: -122.37 },
    { id: 'langley', name: 'Langley / Saratoga', lat: 48.03, lon: -122.45 },
    { id: 'pnp', name: 'Point No Point', lat: 47.91, lon: -122.52 },
    { id: 'ludlow', name: 'Port Ludlow', lat: 47.93, lon: -122.68 },
    { id: 'admiralty', name: 'Admiralty Inlet', lat: 48.03, lon: -122.64 },
    { id: 'townsend', name: 'Port Townsend', lat: 48.11, lon: -122.76 },
    { id: 'colvos', name: 'Colvos Passage', lat: 47.40, lon: -122.53 },
    { id: 'desmoines', name: 'Des Moines', lat: 47.42, lon: -122.38 }
  ];
  var TIDE_HILO_ID = '9447265', TIDE_REF_ID = '9447130';       // Meadow Point (Shilshole Bay) subordinate; Seattle reference
  var ALERT_ZONES = ['PZZ135', 'PZZ134', 'PZZ133', 'PZZ132', 'PZZ131'];

  // -------------------------------------------------------------------- time
  var fmtParts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  function nowWall() {
    var o = {}; fmtParts.formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
    return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute);
  }
  function parseLocal(s) {      // '2026-10-17T07:31' or '2026-10-17 07:31'
    var m = /(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)/.exec(s); if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  }
  function ymd(ms) { return new Date(ms).toISOString().slice(0, 10).replace(/-/g, ''); }
  function dayStart(ms) { var d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }

  // ------------------------------------------------------------------- cache
  function cacheKey(url) { return 'sp1:' + url; }
  function cacheRead(url) {
    try { var s = localStorage.getItem(cacheKey(url)); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function cacheWrite(url, data) {
    try { localStorage.setItem(cacheKey(url), JSON.stringify({ t: Date.now(), d: data })); }
    catch (e) {
      try {   // quota: drop our oldest entries and retry once
        var ks = []; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('sp1:') === 0) ks.push(k); }
        ks.sort().slice(0, Math.ceil(ks.length / 2)).forEach(function (k) { localStorage.removeItem(k); });
        localStorage.setItem(cacheKey(url), JSON.stringify({ t: Date.now(), d: data }));
      } catch (e2) { /* storage unavailable — fine */ }
    }
  }
  function fetchJSON(url, opts) {
    opts = opts || {};
    var c = opts.force ? null : cacheRead(url);
    if (c && Date.now() - c.t < TTL) return Promise.resolve({ data: c.d, at: c.t, cached: true });
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, opts.timeout || 20000) : null;
    function attempt(n) {
      return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
        if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
        return opts.text ? r.text() : r.json();
      }).catch(function (e) {
        if (n < 1 && (!e.status || e.status >= 500 || e.status === 429) && e.name !== 'AbortError') {
          return new Promise(function (res) { setTimeout(res, 900); }).then(function () { return attempt(n + 1); });
        }
        throw e;
      });
    }
    return attempt(0).then(function (d) {
      if (timer) clearTimeout(timer);
      if (d && d.error && d.error.message) throw new Error(d.error.message);
      cacheWrite(url, d); return { data: d, at: Date.now(), cached: false };
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      var stale = cacheRead(url);
      if (stale && Date.now() - stale.t < STALE_OK) return { data: stale.d, at: stale.t, cached: true, stale: true, err: String(e.message || e) };
      throw e;
    });
  }
  // Wrap a loader so it always resolves to {ok, data, err, at, stale}
  function guard(fn) {
    return function () {
      var args = arguments;
      return Promise.resolve().then(function () { return fn.apply(null, args); })
        .then(function (r) { return Object.assign({ ok: true }, r); })
        .catch(function (e) { return { ok: false, err: String(e && e.message || e) }; });
    };
  }

  // ----------------------------------------------------------------- weather
  var loadWeather = guard(function (force) {
    var lat = WX_POINTS.map(function (p) { return p.lat; }).join(','), lon = WX_POINTS.map(function (p) { return p.lon; }).join(',');
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,precipitation_probability,temperature_2m,cloud_cover,visibility,weather_code' +
      '&daily=sunrise,sunset&wind_speed_unit=kn&timezone=' + TZ + '&forecast_days=3';
    return fetchJSON(url, { force: force }).then(function (r) {
      var arr = Array.isArray(r.data) ? r.data : [r.data];
      if (arr.length !== WX_POINTS.length) throw new Error('unexpected Open-Meteo response');
      var points = arr.map(function (x, i) {
        var h = x.hourly, t0 = parseLocal(h.time[0]);
        return { id: WX_POINTS[i].id, name: WX_POINTS[i].name, lat: WX_POINTS[i].lat, lon: WX_POINTS[i].lon, t0: t0, stepMs: 3600000,
          ws: h.wind_speed_10m, wd: h.wind_direction_10m, gust: h.wind_gusts_10m, precip: h.precipitation, pp: h.precipitation_probability,
          temp: h.temperature_2m, cloud: h.cloud_cover, vis: h.visibility, code: h.weather_code };
      });
      var sun = {}, d = arr[0].daily;
      d.time.forEach(function (day, i) { sun[day] = { sunrise: parseLocal(d.sunrise[i]), sunset: parseLocal(d.sunset[i]) }; });
      return { data: { points: points, sun: sun }, at: r.at, stale: r.stale, err: r.err, cached: r.cached };
    });
  });

  // ------------------------------------------------------------------ NWS
  var loadAlerts = guard(function (force) {
    var url = 'https://api.weather.gov/alerts/active?zone=' + ALERT_ZONES.join(',');
    return fetchJSON(url, { force: force }).then(function (r) {
      var feats = (r.data && r.data.features) || [];
      var seen = {}, list = [];
      feats.forEach(function (f) {
        var p = f.properties || {}; if (seen[p.id || f.id]) return; seen[p.id || f.id] = 1;
        list.push({ event: p.event, headline: p.headline, severity: p.severity, urgency: p.urgency, area: p.areaDesc, onset: p.onset || p.effective, ends: p.ends || p.expires, description: p.description, instruction: p.instruction, sender: p.senderName });
      });
      return { data: list, at: r.at, stale: r.stale, err: r.err };
    });
  });

  // Zone text forecast (verbatim). Try the zone forecast endpoint, then the latest CWF product from WFO SEW.
  function cwfSection(text, zone) {
    var re = new RegExp('(^|\\n)(' + zone + '-[\\s\\S]*?)(\\n\\$\\$|$)');
    var m = re.exec(text); return m ? m[2].trim() : null;
  }
  var loadZoneText = guard(function (zone, force) {
    var url = 'https://api.weather.gov/zones/forecast/' + zone + '/forecast';
    return fetchJSON(url, { force: force }).then(function (r) {
      var p = r.data && r.data.properties; if (!p || !p.periods || !p.periods.length) throw new Error('empty zone forecast');
      var text = p.periods.map(function (q) { return q.name.toUpperCase() + '...' + q.detailedForecast; }).join('\n\n');
      return { data: { zone: zone, updated: p.updated, text: text, source: 'api.weather.gov zone forecast' }, at: r.at, stale: r.stale, err: r.err };
    }).catch(function () {
      return fetchJSON('https://api.weather.gov/products/types/CWF/locations/SEW', { force: force }).then(function (r) {
        var g = r.data && r.data['@graph']; if (!g || !g.length) throw new Error('no CWF products');
        return fetchJSON('https://api.weather.gov/products/' + g[0].id, { force: force }).then(function (pr) {
          var sec = cwfSection(pr.data.productText || '', zone); if (!sec) throw new Error(zone + ' not in latest CWF');
          return { data: { zone: zone, updated: pr.data.issuanceTime, text: sec, source: 'NWS Seattle CWF product' }, at: pr.at };
        });
      });
    });
  });

  // ------------------------------------------------------------------- tides
  var DG = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
  function tideUrl(station, begin, extra) {
    return DG + '?product=predictions&datum=MLLW&units=english&time_zone=lst_ldt&format=json&station=' + station + '&begin_date=' + begin + '&range=72' + (extra || '');
  }
  function parseHilo(arr) { return arr.map(function (p) { return { t: parseLocal(p.t), v: +p.v, type: p.type }; }); }
  var loadTides = guard(function (begin, force) {
    var jobs = [
      fetchJSON(tideUrl(TIDE_HILO_ID, begin, '&interval=hilo'), { force: force }).then(function (r) { return { hilo: parseHilo(r.data.predictions), at: r.at, stale: r.stale }; }),
      fetchJSON(tideUrl(TIDE_REF_ID, begin), { force: force }).then(function (r) { return { series: r.data.predictions.map(function (p) { return [parseLocal(p.t), +p.v]; }), at: r.at, stale: r.stale }; }),
      fetchJSON(tideUrl(TIDE_REF_ID, begin, '&interval=hilo'), { force: force }).then(function (r) { return { hilo: parseHilo(r.data.predictions), at: r.at }; })
    ].map(function (p) { return p.then(function (x) { return x; }, function (e) { return { err: String(e.message || e) }; }); });
    return Promise.all(jobs).then(function (a) {
      var local = a[0], series = a[1], refHilo = a[2], notes = [];
      var out = { station: 'Shilshole Bay (Meadow Point) ' + TIDE_HILO_ID, hilo: null, series: null, seriesStation: 'Seattle ' + TIDE_REF_ID, notes: notes };
      if (local.hilo) out.hilo = local.hilo;
      else if (refHilo.hilo) { out.hilo = refHilo.hilo; out.station = 'Seattle ' + TIDE_REF_ID + ' (Shilshole unavailable)'; notes.push('Shilshole station failed (' + local.err + ') — using Seattle.'); }
      if (series.series) out.series = series.series; else notes.push('Tide curve series unavailable — curve is interpolated between highs and lows.');
      if (!out.hilo) throw new Error(local.err || 'no tide predictions');
      return { data: out, at: Date.now(), stale: local.stale || series.stale };
    });
  });

  // ---------------------------------------------------------------- currents
  function curUrl(st, begin, interval, range) {
    return DG + '?product=currents_predictions&station=' + st.id + '&bin=' + st.bin + '&begin_date=' + begin + '&range=' + (range || 72) +
      '&interval=' + interval + '&units=english&time_zone=lst_ldt&format=json';
  }
  function loadOneCurrent(st, begin, force) {
    return fetchJSON(curUrl(st, begin, 30), { force: force }).then(function (r) {
      var cp = r.data && r.data.current_predictions && r.data.current_predictions.cp;
      if (!Array.isArray(cp) || !cp.length) throw new Error(typeof cp === 'string' ? cp : 'no data');
      var s = Object.assign({}, st, { t0: parseLocal(cp[0].Time), stepMs: 1800000, v: cp.map(function (x) { return +x.Velocity_Major; }),
        fd: +cp[0].meanFloodDir, ed: +cp[0].meanEbbDir, depth: cp[0].Depth });
      // guard against irregular spacing
      var t1 = parseLocal(cp[1].Time); if (t1 - s.t0 !== 1800000) throw new Error('unexpected interval');
      return s;
    });
  }
  function loadExtremes(st, begin, force) {
    return fetchJSON(curUrl(st, begin, 'MAX_SLACK'), { force: force }).then(function (r) {
      var cp = r.data && r.data.current_predictions && r.data.current_predictions.cp;
      if (!Array.isArray(cp)) return [];
      return cp.map(function (x) { return { t: parseLocal(x.Time), type: x.Type, v: +x.Velocity_Major }; });
    });
  }
  var loadCurrents = guard(function (begin, force) {
    var jobs = CURRENT_STATIONS.map(function (st) {
      return loadOneCurrent(st, begin, force).then(function (s) { return { ok: 1, st: s }; }, function (e) { return { ok: 0, id: st.id, err: String(e.message || e) }; });
    });
    var xjobs = CURRENT_STATIONS.filter(function (s) { return s.key; }).map(function (st) {
      return loadExtremes(st, begin, force).then(function (ev) { return { id: st.id, ev: ev }; }, function () { return { id: st.id, ev: [] }; });
    });
    return Promise.all([Promise.all(jobs), Promise.all(xjobs)]).then(function (res) {
      var ok = res[0].filter(function (x) { return x.ok; }).map(function (x) { return x.st; });
      var failed = res[0].filter(function (x) { return !x.ok; });
      if (!ok.length) throw new Error(failed[0] ? failed[0].err : 'no stations');
      var ex = {}; res[1].forEach(function (x) { ex[x.id] = x.ev; });
      return { data: { stations: ok, failed: failed, extremes: ex, total: CURRENT_STATIONS.length }, at: Date.now() };
    });
  });

  // ------------------------------------------------------------------- depth
  // NOAA NCEI DEM mosaic (ImageServer). getSamples takes a multipoint (<= 1000 points; longer lists are silently
  // truncated), answers in raster order with `locationId` = input index, and drops points it cannot sample.
  // Each sample carries the id of the source DEM; the mosaic's catalog gives that DEM's vertical datum.
  var DEM = 'https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer';
  var DEPTH_TTL = 90 * 24 * 3600 * 1000, DEM_BATCH = 250, DEM_CONC = 3;
  function parseSamples(resp, n) {      // -> { e:[m|null], r:[rasterId|null] } aligned to the n requested points
    var e = new Array(n), r = new Array(n), i;
    for (i = 0; i < n; i++) { e[i] = null; r[i] = null; }
    ((resp && resp.samples) || []).forEach(function (s) {
      var k = +s.locationId, v = parseFloat(s.value); if (!(k >= 0 && k < n) || !isFinite(v) || /nodata/i.test(String(s.value))) return;
      e[k] = Math.round(v * 100) / 100; r[k] = s.rasterId;
    });
    return { e: e, r: r };
  }
  function postForm(url, params, timeout) {
    var body = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, timeout || 25000) : null;
    function once() {
      return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body, signal: ctl ? ctl.signal : undefined }).then(function (r) {
        if (!r.ok) { var er = new Error('HTTP ' + r.status); er.status = r.status; throw er; }
        return r.json();
      }).then(function (d) { if (d && d.error) throw new Error(d.error.message || 'DEM service error'); return d; });
    }
    return once().catch(function (e) {
      if (e.name === 'AbortError' || (e.status && e.status < 500)) throw e;
      return new Promise(function (res) { setTimeout(res, 900); }).then(once);
    }).then(function (d) { if (timer) clearTimeout(timer); return d; }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }
  function pool(tasks, limit) {          // run thunks with at most `limit` in flight; rejects on the first failure
    var out = new Array(tasks.length), next = 0, failed = null;
    function worker() {
      if (failed || next >= tasks.length) return Promise.resolve();
      var i = next++;
      return tasks[i]().then(function (v) { out[i] = v; return worker(); }, function (e) { failed = failed || e; });
    }
    var ws = []; for (var w = 0; w < Math.min(limit, tasks.length); w++) ws.push(worker());
    return Promise.all(ws).then(function () { if (failed) throw failed; return out; });
  }
  // Depth samples for a route: { samples, e, r, rasters:{id:{datum,name,cell}}, notes, step }. Cached per route geometry.
  var loadDepth = guard(function (pts, force) {
    var M = SP.model, step = M.DEM_SAMPLE_M, key = 'depth:' + M.routeHash(pts, step), samples = M.sampleRoute(pts, step);
    var c = force ? null : cacheRead(key);
    if (c && Date.now() - c.t < DEPTH_TTL && c.d && c.d.e && c.d.e.length === samples.length) return { data: Object.assign({ samples: samples }, c.d), at: c.t, cached: true };
    var geo = samples.map(function (p) { return [+p.lon.toFixed(6), +p.lat.toFixed(6)]; }), tasks = [];
    for (var a = 0; a < geo.length; a += DEM_BATCH) (function (a) {
      tasks.push(function () {
        var part = geo.slice(a, a + DEM_BATCH);
        return postForm(DEM + '/getSamples', { f: 'json', geometryType: 'esriGeometryMultipoint', returnFirstValueOnly: 'true',
          geometry: JSON.stringify({ points: part, spatialReference: { wkid: 4326 } }) }).then(function (d) { return parseSamples(d, part.length); });
      });
    })(a);
    return pool(tasks, DEM_CONC).then(function (parts) {
      var e = [], r = []; parts.forEach(function (p) { e = e.concat(p.e); r = r.concat(p.r); });
      var ids = {}; r.forEach(function (x) { if (x != null) ids[x] = 1; }); ids = Object.keys(ids);
      var notes = [], rasters = {};
      return (ids.length ? postForm(DEM + '/query', { f: 'json', objectIds: ids.join(','), outFields: 'OBJECTID,Name,VerticalDatum,CellsizeArcseconds', returnGeometry: 'false' }) : Promise.resolve({ features: [] }))
        .then(function (q) {
          (q.features || []).forEach(function (f) { var A = f.attributes; rasters[A.OBJECTID] = { datum: A.VerticalDatum || null, name: A.Name, cell: A.CellsizeArcseconds }; });
        }, function (err) { notes.push('DEM datum lookup failed (' + err.message + ') — assuming NAVD88.'); })
        .then(function () {
          ids.forEach(function (id) { if (!rasters[id]) rasters[id] = { datum: 'NAVD 88', name: '?', cell: null }; });
          var d = { e: e, r: r, rasters: rasters, notes: notes, step: step };
          if (!notes.length) cacheWrite(key, d);
          return { data: Object.assign({ samples: samples }, d), at: Date.now() };
        });
    });
  });

  SP.data = {
    TTL: TTL, TZ: TZ, CURRENT_STATIONS: CURRENT_STATIONS, WX_POINTS: WX_POINTS, TIDE_HILO_ID: TIDE_HILO_ID, TIDE_REF_ID: TIDE_REF_ID,
    ALERT_ZONES: ALERT_ZONES, nowWall: nowWall, parseLocal: parseLocal, ymd: ymd, dayStart: dayStart,
    loadWeather: loadWeather, loadAlerts: loadAlerts, loadZoneText: loadZoneText, loadTides: loadTides, loadCurrents: loadCurrents,
    fetchJSON: fetchJSON, cwfSection: cwfSection, loadDepth: loadDepth, parseSamples: parseSamples, DEM: DEM
  };
})(typeof self !== 'undefined' ? self : this);
