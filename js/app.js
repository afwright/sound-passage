/* Sound Passage — UI. Wires the data layer (data.js) and the routing model (model.js) to the page. */
(function () {
  'use strict';
  const SP = window.SP, M = SP.model, D = SP.data, RT = SP.routes;
  const $ = (s) => document.getElementById(s);
  const H = 3600000, HALF = 1800000;
  const CUSTOM_LOCK = 4;                       // custom routes keep HOME + the marina exit fixed

  // -------------------------------------------------------------- state
  const S = { wx: null, alerts: null, tides: null, cur: null, zones: {}, loading: {}, depth: {}, depthP: {}, depthBusy: 0, depthLast: null, chartErr: 0 };
  const st = {
    routeId: 'kingston', custom: RT.PRESETS[0].pts.slice(0, CUSTOM_LOCK).map((p) => p.slice()), lastPreset: 'kingston',
    boat: Object.assign({ type: 'cruiser-30' }, M.DEFAULT_BOAT), depart: null, retDepart: null,
    result: null, ret: null, best: null, mapT: null, wxPoint: 'shilshole', zone: 'PZZ135', theme: 'auto', hasCalc: false
  };
  let axis0 = D.dayStart(D.nowWall());

  // -------------------------------------------------------------- helpers
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hm = (ms) => new Date(ms).toISOString().slice(11, 16);
  const dayLbl = (ms) => { const d = new Date(ms); return DOW[d.getUTCDay()] + ' ' + d.getUTCDate(); };
  const fmtT = (ms) => DOW[new Date(ms).getUTCDay()] + ' ' + hm(ms);
  const fmtDur = (h) => { const m = Math.round(h * 60); return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; };
  const toInput = (ms) => new Date(ms).toISOString().slice(0, 16);
  const nowMs = () => D.nowWall();
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const sgn = (v, d) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d == null ? 1 : d);
  const deg3 = (d) => String(Math.round(M.norm360(d)) % 360).padStart(3, '0') + '°';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function save() { try { localStorage.setItem('sp-prefs', JSON.stringify({ boat: st.boat, routeId: st.routeId, custom: st.custom, lastPreset: st.lastPreset, wxPoint: st.wxPoint, zone: st.zone, theme: st.theme })); } catch (e) { /* ignore */ } }
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem('sp-prefs') || 'null'); if (!p) return;
      if (p.boat) st.boat = Object.assign(st.boat, p.boat);
      if (p.routeId && (p.routeId === 'custom' || RT.PRESETS.some((r) => r.id === p.routeId))) st.routeId = p.routeId;
      if (Array.isArray(p.custom) && p.custom.length >= CUSTOM_LOCK) st.custom = p.custom;
      if (p.lastPreset) st.lastPreset = p.lastPreset;
      if (p.wxPoint) st.wxPoint = p.wxPoint;
      if (p.zone) st.zone = p.zone;
      if (p.theme) st.theme = p.theme;
    } catch (e) { /* ignore */ }
  }
  const windColor = (k) => k < 4 ? 'var(--wind-1)' : k < 9 ? 'var(--wind-2)' : k < 15 ? 'var(--wind-3)' : k < 21 ? 'var(--wind-4)' : k < 27 ? 'var(--wind-5)' : 'var(--wind-6)';
  const WMO = (c) => c == null ? '' : c === 0 ? 'Clear' : c <= 2 ? 'Partly cloudy' : c === 3 ? 'Overcast' : c === 45 || c === 48 ? 'Fog' : c <= 57 ? 'Drizzle' : c <= 67 ? 'Rain' : c <= 77 ? 'Snow' : c <= 82 ? 'Showers' : c <= 86 ? 'Snow showers' : 'Thunderstorms';
  const cToF = (c) => c * 9 / 5 + 32;

  function makeEnv() {
    return {
      wx: S.wx && S.wx.ok ? { points: S.wx.data.points } : null,
      sun: S.wx && S.wx.ok ? S.wx.data.sun : {},
      cur: S.cur && S.cur.ok ? { stations: S.cur.data.stations } : null
    };
  }
  const alertNames = () => (S.alerts && S.alerts.ok ? S.alerts.data.map((a) => a.event) : []);
  function wxPt(id) { const pts = S.wx && S.wx.ok && S.wx.data.points; return pts ? (pts.find((p) => p.id === id) || pts[0]) : null; }
  const idxAt = (p, t) => clamp(Math.floor((t - p.t0) / p.stepMs), 0, p.ws.length - 1);

  const tideHeight = (t) => M.tideHeightAt(S.tides && S.tides.ok && S.tides.data, t);

  // -------------------------------------------------------------- source status
  const SRC = { wx: 'Wind', nws: 'NWS', tide: 'Tides', cur: 'Currents', depth: 'Depth' };
  function setPill(key, cls, text, title) {
    let el = $('pill-' + key);
    if (!el) { el = document.createElement('span'); el.id = 'pill-' + key; el.className = 'pill'; $('srcs').appendChild(el); }
    el.className = 'pill ' + cls; el.title = title || ''; el.innerHTML = '<i></i>' + esc(text);
  }
  function ageTxt(at) { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'now' : m + ' min ago'; }
  function renderStatus() {
    const msgs = [];
    const pill = (key, r, okTxt) => {
      if (!r) return setPill(key, 'load', SRC[key] + ' …');
      if (!r.ok) return setPill(key, 'bad', SRC[key] + ' ✗', r.err);
      setPill(key, r.stale ? 'part' : 'ok', SRC[key] + ' ' + (okTxt || ageTxt(r.at)), r.stale ? 'Live fetch failed (' + r.err + ') — showing cached data' : '');
    };
    pill('wx', S.wx);
    const nwsOk = S.alerts && S.alerts.ok, zoneOk = S.zones[st.zone] && S.zones[st.zone].ok;
    if (!S.alerts || !S.zones[st.zone]) setPill('nws', 'load', 'NWS …');
    else if (nwsOk && zoneOk) setPill('nws', 'ok', 'NWS ok');
    else setPill('nws', nwsOk || zoneOk ? 'part' : 'bad', 'NWS ' + (nwsOk || zoneOk ? 'partial' : '✗'), (S.alerts.err || '') + ' ' + (S.zones[st.zone].err || ''));
    pill('tide', S.tides);
    if (S.cur && S.cur.ok) {
      const d = S.cur.data, n = d.stations.length;
      setPill('cur', n < d.total ? 'part' : (S.cur.stale ? 'part' : 'ok'), 'Currents ' + n + '/' + d.total, d.failed.map((f) => f.id + ': ' + f.err).join('\n'));
      if (n < d.total) msgs.push(['part', 'NOAA currents: only ' + n + ' of ' + d.total + ' stations loaded — current estimates are patchy in places.']);
    } else pill('cur', S.cur);
    const dl = S.depthLast;
    if (S.depthBusy) setPill('depth', 'load', 'Depth …');
    else if (!dl) setPill('depth', '', 'Depth on calc', 'Bathymetry is sampled along the route when you press Calculate');
    else if (!dl.ok) setPill('depth', 'bad', 'Depth ✗', dl.err);
    else setPill('depth', dl.data.notes.length ? 'part' : 'ok', 'Depth ok', dl.data.notes.join('\n') || 'NOAA NCEI bathymetry grid, ' + dl.data.samples.length + ' sample points' + (dl.cached ? ' (cached)' : ''));
    if (dl && !dl.ok) msgs.push(['bad', 'NOAA depth grid unavailable — depth was NOT checked for this trip; use the chart. (' + dl.err + ')']);
    if (S.chartErr >= 4) msgs.push(['part', 'NOAA chart tiles are not loading — switch the base layer to OpenStreetMap (layers control, top right of the map).']);
    if (S.wx && !S.wx.ok) msgs.push(['bad', 'Open-Meteo wind unavailable — go/no-go is blank and the ETA assumes no wind (it will motor). (' + S.wx.err + ')']);
    if (S.cur && !S.cur.ok) msgs.push(['bad', 'NOAA currents unavailable — ETA ignores current. (' + S.cur.err + ')']);
    if (S.tides && !S.tides.ok) msgs.push(['bad', 'NOAA tide predictions unavailable — tide chart and next high/low are hidden. (' + S.tides.err + ')']);
    if (S.alerts && !S.alerts.ok) msgs.push(['bad', 'NWS alerts unavailable — check weather.gov for advisories before you go. (' + S.alerts.err + ')']);
    if (S.zones[st.zone] && !S.zones[st.zone].ok) msgs.push(['bad', 'NWS marine zone forecast unavailable (' + S.zones[st.zone].err + ').']);
    [['Wind', S.wx], ['Tides', S.tides], ['Currents', S.cur]].forEach(([n, r]) => { if (r && r.ok && r.stale) msgs.push(['part', n + ': live fetch failed, showing cached data from ' + ageTxt(r.at) + '.']); });
    $('banner').innerHTML = msgs.map((m) => '<div class="' + m[0] + '">' + esc(m[1]) + '</div>').join('');
  }

  // -------------------------------------------------------------- go / no-go
  function renderGo() {
    const el = $('gng'), p = wxPt('shilshole'), now = nowMs();
    if (!p) { el.innerHTML = '<div class="verdict"><span class="lbl">Next 4 h · Shilshole</span><span class="big">—</span><span class="why">' + (S.wx ? 'No wind data.' : 'Loading…') + '</span></div>'; return; }
    const i0 = idxAt(p, now), i1 = Math.min(p.ws.length - 1, i0 + 3);
    let maxW = 0, maxG = 0, maxPP = 0, minVis = 1e9, tMax = -99;
    for (let i = i0; i <= i1; i++) {
      maxW = Math.max(maxW, p.ws[i] || 0); maxG = Math.max(maxG, p.gust[i] || 0);
      maxPP = Math.max(maxPP, p.pp[i] || 0); if (p.vis[i] != null) minVis = Math.min(minVis, p.vis[i]); if (p.temp[i] != null) tMax = Math.max(tMax, p.temp[i]);
    }
    const w = M.windAt({ wx: { points: [p] } }, p.lat, p.lon, now) || { tws: p.ws[i0], twd: p.wd[i0], gust: p.gust[i0] };
    const alerts = S.alerts && S.alerts.ok ? S.alerts.data : null;
    const hard = alerts && alerts.some((a) => /warning|gale|storm|hurricane/i.test(a.event) && !/watch/i.test(a.event));
    const adv = alerts && alerts.length;
    const why = []; let lvl = 'go';
    if (hard) { lvl = 'nogo'; why.push(alerts.filter((a) => /warning|gale|storm/i.test(a.event)).map((a) => a.event)[0]); }
    if (maxG >= 30) { lvl = 'nogo'; why.push('gusts ' + Math.round(maxG) + ' kt'); }
    else if (maxW >= 22) { lvl = 'nogo'; why.push('wind ' + Math.round(maxW) + ' kt'); }
    else {
      if (adv && lvl !== 'nogo') { lvl = 'caution'; why.push(alerts[0].event); }
      if (maxG >= 22) { lvl = lvl === 'nogo' ? lvl : 'caution'; why.push('gusts ' + Math.round(maxG) + ' kt'); }
      else if (maxW >= 15) { lvl = lvl === 'nogo' ? lvl : 'caution'; why.push('wind ' + Math.round(maxW) + ' kt'); }
      if (minVis < 1852) { lvl = lvl === 'nogo' ? lvl : 'caution'; why.push('visibility ' + (minVis / 1852).toFixed(1) + ' NM'); }
      if (maxPP >= 80) { if (lvl === 'go') lvl = 'caution'; why.push('rain likely'); }
    }
    if (!S.alerts || !S.alerts.ok) why.push('NWS alerts unavailable');
    const label = { go: 'Go', caution: 'Caution', nogo: 'No-go' }[lvl];
    let tideCell = '<div class="cell"><div class="k">Next tide</div><div class="v">—</div><div class="s">' + (S.tides && !S.tides.ok ? 'unavailable' : 'loading…') + '</div></div>';
    if (S.tides && S.tides.ok) {
      const up = S.tides.data.hilo.filter((x) => x.t > now);
      if (up.length) {
        const a = up[0], b = up[1];
        tideCell = '<div class="cell"><div class="k">Next tide</div><div class="v">' + (a.type === 'H' ? 'High' : 'Low') + ' <small class="num">' + f1(a.v) + ' ft</small></div><div class="s num">' + hm(a.t) + ' · in ' + fmtDur((a.t - now) / H) + (b ? '<br>then ' + (b.type === 'H' ? 'high' : 'low') + ' ' + f1(b.v) + ' ft ' + hm(b.t) : '') + '</div></div>';
      }
    }
    let alertCell;
    if (!S.alerts) alertCell = '<div class="cell"><div class="k">Marine alerts</div><div class="v"><small>loading…</small></div></div>';
    else if (!S.alerts.ok) alertCell = '<div class="cell"><div class="k">Marine alerts</div><div class="v"><span class="chip warn">unavailable</span></div><div class="s">check weather.gov</div></div>';
    else if (!S.alerts.data.length) alertCell = '<div class="cell"><div class="k">Marine alerts</div><div class="v"><span class="chip ok">None active</span></div><div class="s">PZZ135 &amp; nearby zones</div></div>';
    else alertCell = '<div class="cell"><div class="k">Marine alerts</div><div class="v">' + S.alerts.data.slice(0, 3).map((a) => '<span class="chip bad">' + esc(a.event) + '</span>').join(' ') + '</div><div class="s">until ' + esc(S.alerts.data[0].ends ? new Date(S.alerts.data[0].ends).toLocaleString('en-US', { timeZone: D.TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '—') + '</div></div>';
    const arrow = '<svg width="22" height="22" viewBox="-12 -12 24 24" aria-hidden="true"><g transform="rotate(' + (w.twd + 180).toFixed(0) + ')"><path d="M0,-10 L6,8 L0,4 L-6,8 Z" fill="currentColor"/></g></svg>';
    el.innerHTML =
      '<div class="verdict ' + lvl + '"><span class="lbl">Next 4 h · Shilshole</span><span class="big">' + label + '</span><span class="why">' + esc(why.join(' · ') || 'nothing flagged — indicative only') + '</span></div>' +
      '<div class="cell"><div class="k">Wind now</div><div class="v"><span class="num">' + Math.round(w.tws) + '</span><small>kt</small>' + arrow + '<small>from ' + M.compass(w.twd) + ' ' + deg3(w.twd) + '</small></div><div class="s num">gust ' + Math.round(w.gust) + ' kt · 4 h max ' + Math.round(maxW) + '/' + Math.round(maxG) + '</div></div>' +
      '<div class="cell"><div class="k">Precip</div><div class="v"><span class="num">' + Math.round(maxPP) + '</span><small>% chance</small></div><div class="s">' + esc(WMO(p.code[i0])) + '</div></div>' +
      '<div class="cell"><div class="k">Temp · Vis</div><div class="v"><span class="num">' + Math.round(cToF(p.temp[i0])) + '</span><small>°F</small></div><div class="s num">vis ' + (minVis < 1e9 ? (minVis / 1852 >= 10 ? '10+' : (minVis / 1852).toFixed(1)) : '—') + ' NM</div></div>' +
      alertCell + tideCell;
  }

  // -------------------------------------------------------------- chart scaffolding
  function boxW(id, min) { const w = $(id).clientWidth || 800; return Math.max(min || 0, w); }
  function nightRects(x, y0, h, tA, tB, pxPerMs, left) {
    const sun = S.wx && S.wx.ok ? S.wx.data.sun : null; if (!sun) return '';
    let out = '';
    Object.keys(sun).forEach((day) => {
      const s = sun[day], d0 = Date.parse(day + 'T00:00:00Z'), d1 = d0 + 24 * H;
      [[d0, s.sunrise], [s.sunset, d1]].forEach(([a, b]) => {
        const aa = Math.max(a, tA), bb = Math.min(b, tB); if (bb > aa) out += '<rect class="c-night" x="' + (left + (aa - tA) * pxPerMs).toFixed(1) + '" y="' + y0 + '" width="' + ((bb - aa) * pxPerMs).toFixed(1) + '" height="' + h + '"/>';
      });
    });
    return out;
  }
  function tripBand(y0, h, tA, pxPerMs, left, tB) {
    const r = st.result; if (!r) return '';
    const a = Math.max(r.depart, tA), b = Math.min(r.eta, tB); if (b <= a) return '';
    return '<rect class="c-trip" x="' + (left + (a - tA) * pxPerMs).toFixed(1) + '" y="' + y0 + '" width="' + Math.max(2, (b - a) * pxPerMs).toFixed(1) + '" height="' + h + '"><title>Trip ' + fmtT(r.depart) + ' → ' + fmtT(r.eta) + '</title></rect>';
  }

  // -------------------------------------------------------------- hourly wind strip
  function renderWx() {
    const box = $('wxChart'), p = wxPt(st.wxPoint);
    if (!p) { box.innerHTML = '<p class="note">' + (S.wx && !S.wx.ok ? 'Wind forecast unavailable.' : 'Loading…') + '</p>'; return; }
    const n = p.ws.length, W = boxW('wxChart', 640), Hh = 270, ml = 32, mr = 8, mt = 40, mb = 24, pp0 = Hh - mb - 34;
    const bw = (W - ml - mr) / n, tA = p.t0, tB = p.t0 + n * H, px = bw / H;
    const gmax = Math.max.apply(null, p.gust.filter((v) => v != null));
    const ymax = Math.max(25, Math.ceil(gmax / 5) * 5), plotTop = mt, plotH = pp0 - plotTop - 6;
    const y = (v) => plotTop + plotH - (v / ymax) * plotH;
    let g = '';
    g += nightRects(0, plotTop, Hh - mb - plotTop, tA, tB, px, ml);
    for (let v = 0; v <= ymax; v += 5) g += '<line class="c-grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (ml - 4) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    g += tripBand(plotTop, Hh - mb - plotTop, tA, px, ml, tB);
    for (let i = 0; i < n; i++) {
      const x = ml + i * bw, t = p.t0 + i * H, ws = p.ws[i] || 0, gu = p.gust[i] || ws, pp = p.pp[i] || 0;
      const tip = fmtT(t) + ' · wind ' + Math.round(ws) + ' kt, gust ' + Math.round(gu) + ' kt from ' + M.compass(p.wd[i]) + ' (' + deg3(p.wd[i]) + ') · rain ' + Math.round(pp) + '% (' + (p.precip[i] || 0).toFixed(1) + ' mm) · ' + Math.round(cToF(p.temp[i])) + '°F · vis ' + (p.vis[i] != null ? (p.vis[i] / 1852).toFixed(1) : '?') + ' NM · ' + WMO(p.code[i]);
      g += '<g><title>' + esc(tip) + '</title><rect x="' + x.toFixed(1) + '" y="' + y(ws).toFixed(1) + '" width="' + Math.max(1, bw - 1).toFixed(1) + '" height="' + (plotTop + plotH - y(ws)).toFixed(1) + '" fill="' + windColor(ws) + '"/>';
      g += '<line class="c-gust" x1="' + x.toFixed(1) + '" x2="' + (x + bw - 1).toFixed(1) + '" y1="' + y(gu).toFixed(1) + '" y2="' + y(gu).toFixed(1) + '"/>';
      g += '<rect class="c-pp" x="' + x.toFixed(1) + '" y="' + (Hh - mb - (pp / 100) * 30).toFixed(1) + '" width="' + Math.max(1, bw - 1).toFixed(1) + '" height="' + ((pp / 100) * 30).toFixed(1) + '"/>';
      if (bw >= 7 || i % 2 === 0) g += '<g transform="translate(' + (x + bw / 2).toFixed(1) + ',' + (mt - 14) + ') rotate(' + ((p.wd[i] + 180) % 360).toFixed(0) + ')"><path class="c-arrow" d="M0,-8 L4.5,6 L0,3 L-4.5,6 Z"/></g>';
      g += '</g>';
      if (new Date(t).getUTCHours() % 6 === 0 && i < n) g += '<text x="' + (x + 1).toFixed(1) + '" y="' + (Hh - 8) + '">' + String(new Date(t).getUTCHours()).padStart(2, '0') + '</text>';
      if (new Date(t).getUTCHours() === 0) g += '<line class="c-axis" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="14" y2="' + (Hh - mb) + '"/><text class="big" x="' + (x + 4).toFixed(1) + '" y="12">' + dayLbl(t) + '</text>';
    }
    g += '<text x="2" y="' + (plotTop - 4) + '">kt</text><text x="2" y="' + (Hh - mb - 2) + '" style="font-size:9px">rain%</text>';
    const now = nowMs();
    if (now >= tA && now <= tB) { const x = ml + (now - tA) * px; g += '<line class="c-now" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="22" y2="' + (Hh - mb) + '"/><text class="c-nowt" x="' + (x + 3).toFixed(1) + '" y="' + (plotTop + 10) + '">now</text>'; }
    box.innerHTML = '<svg width="' + W + '" height="' + Hh + '" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="72 hour wind and rain forecast">' + g + '</svg>';
    $('wxSrc').textContent = 'Open-Meteo 10 m wind (kt) at ' + p.name + ' (' + p.lat.toFixed(2) + ', ' + p.lon.toFixed(2) + '). Arrows show where the wind blows to. Hover a bar for details.';
  }

  // -------------------------------------------------------------- tide chart
  function renderTide() {
    const box = $('tideChart'), T = S.tides && S.tides.ok && S.tides.data;
    if (!T) { box.innerHTML = '<p class="note">' + (S.tides && !S.tides.ok ? 'NOAA tide predictions unavailable.' : 'Loading…') + '</p>'; $('tideList').innerHTML = ''; return; }
    const W = boxW('tideChart', 300), Hh = 250, ml = 38, mr = 10, mt = 26, mb = 24;
    // 24 h window from the hour before now; jump ahead to a planned departure that falls outside it.
    const dep = st.result && st.result.depart, hr0 = Math.floor(nowMs() / H) * H - H;
    const tA = dep && dep > hr0 + 20 * H ? Math.floor(dep / H) * H - 2 * H : hr0, tB = tA + 24 * H, px = (W - ml - mr) / (tB - tA);
    const inWin = (t) => t >= tA - H && t <= tB + H;
    const vals = T.hilo.filter((h) => inWin(h.t)).map((h) => h.v).concat(T.series ? T.series.filter((s) => inWin(s[0])).map((s) => s[1]) : []);
    if (!vals.length) vals.push(0, 10);
    const lo = Math.floor(Math.min.apply(null, vals) - 0.5), hi = Math.ceil(Math.max.apply(null, vals) + 1);
    const y = (v) => mt + (Hh - mt - mb) * (1 - (v - lo) / (hi - lo)), x = (t) => ml + (t - tA) * px;
    let g = nightRects(0, mt, Hh - mt - mb, tA, tB, px, ml);
    for (let v = Math.ceil(lo / 2) * 2; v <= hi; v += 2) g += '<line class="c-grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/><text x="' + (ml - 4) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + v + '</text>';
    for (let t = Math.ceil(tA / (3 * H)) * 3 * H; t <= tB; t += 3 * H) {
      const hr = new Date(t).getUTCHours();
      g += '<text x="' + (x(t) + 2).toFixed(1) + '" y="' + (Hh - 8) + '">' + String(hr).padStart(2, '0') + '</text>';
      if (hr === 0) g += '<line class="c-axis" x1="' + x(t).toFixed(1) + '" x2="' + x(t).toFixed(1) + '" y1="14" y2="' + (Hh - mb) + '"/><text class="big" x="' + (x(t) + 4).toFixed(1) + '" y="12">' + dayLbl(t) + '</text>';
    }
    g += tripBand(mt, Hh - mt - mb, tA, px, ml, tB);
    // curve
    const pts = [];
    if (T.series) T.series.forEach((s) => { if (s[0] >= tA && s[0] <= tB) pts.push([x(s[0]), y(s[1])]); });
    else for (let t = tA; t <= tB; t += 360000) { const v = tideHeight(t); if (v != null) pts.push([x(t), y(v)]); }
    if (pts.length) {
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
      g += '<path class="c-area" d="' + d + 'L' + pts[pts.length - 1][0].toFixed(1) + ',' + y(lo).toFixed(1) + 'L' + pts[0][0].toFixed(1) + ',' + y(lo).toFixed(1) + 'Z"/><path class="c-curve" d="' + d + '"/>';
    }
    T.hilo.forEach((h) => {
      if (h.t < tA || h.t > tB) return;
      const cx = x(h.t), cy = y(h.v), up = h.type === 'H';
      g += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="3.5" fill="var(--panel)" stroke="var(--navy)" stroke-width="2"/><text text-anchor="middle" x="' + cx.toFixed(1) + '" y="' + (up ? cy - 8 : cy + 16).toFixed(1) + '">' + (up ? 'H ' : 'L ') + f1(h.v) + '</text><text text-anchor="middle" x="' + cx.toFixed(1) + '" y="' + (up ? cy - 19 : cy + 27).toFixed(1) + '">' + hm(h.t) + '</text>';
    });
    const now = nowMs();
    if (now >= tA && now <= tB) {
      const hv = tideHeight(now);
      g += '<line class="c-now" x1="' + x(now).toFixed(1) + '" x2="' + x(now).toFixed(1) + '" y1="18" y2="' + (Hh - mb) + '"/>' + (hv != null ? '<circle cx="' + x(now).toFixed(1) + '" cy="' + y(hv).toFixed(1) + '" r="4" fill="var(--now)"/>' : '') + '<text class="c-nowt" x="' + (x(now) + 5).toFixed(1) + '" y="30">now ' + (hv != null ? f1(hv) + ' ft' : '') + '</text>';
    }
    [['dep', st.result && st.result.depart, 'depart'], ['arr', st.result && st.result.eta, 'arrive']].forEach(([k, t, lbl]) => {
      if (!t || t < tA || t > tB) return; const hv = tideHeight(t);
      g += '<line stroke="var(--sun)" stroke-width="2" stroke-dasharray="4 3" x1="' + x(t).toFixed(1) + '" x2="' + x(t).toFixed(1) + '" y1="18" y2="' + (Hh - mb) + '"/>' + (hv != null ? '<circle cx="' + x(t).toFixed(1) + '" cy="' + y(hv).toFixed(1) + '" r="4" fill="var(--sun)" stroke="#5b4200"/><text x="' + (x(t) + 5).toFixed(1) + '" y="' + (y(hv) - 7).toFixed(1) + '">' + lbl + ' ' + f1(hv) + ' ft</text>' : '');
    });
    g += '<text x="2" y="' + (mt - 8) + '">ft MLLW</text><text id="tideRead" x="' + (W - mr) + '" y="12" text-anchor="end"></text>';
    g += '<rect id="tideHit" x="' + ml + '" y="' + mt + '" width="' + (W - ml - mr) + '" height="' + (Hh - mt - mb) + '" fill="transparent"/>';
    box.innerHTML = '<svg width="' + W + '" height="' + Hh + '" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Tide prediction, 24 hours">' + g + '</svg>';
    const hit = $('tideHit'), rd = $('tideRead');
    if (hit && hit.addEventListener) {
      hit.addEventListener('mousemove', (e) => {
        const r = hit.getBoundingClientRect(), t = tA + ((e.clientX - r.left) / r.width) * (tB - tA); const hv = tideHeight(t);
        rd.textContent = fmtT(Math.round(t / 60000) * 60000) + (hv != null ? ' · ' + f1(hv) + ' ft' : '');
      });
      hit.addEventListener('mouseleave', () => { rd.textContent = ''; });
    }
    $('tideSrc').textContent = 'Highs/lows: ' + T.station + ' · curve: ' + T.seriesStation + (T.series ? '' : ' (not loaded — interpolated)');
    const up = T.hilo.filter((h) => h.t >= tA && h.t <= tB);
    $('tideList').innerHTML = (T.notes && T.notes.length ? '<div class="err">' + esc(T.notes.join(' ')) + '</div>' : '') + up.map((h) => '<span class="mono">' + (h.type === 'H' ? '▲' : '▼') + ' ' + dayLbl(h.t).split(' ')[0] + ' ' + hm(h.t) + ' ' + f1(h.v) + ' ft</span>').join(' &nbsp; ');
  }

  // -------------------------------------------------------------- currents panel
  function deriveEvents(s) {          // fall-back slack / max from the 30-min series
    const ev = [], v = s.v;
    for (let i = 1; i < v.length - 1; i++) {
      if ((v[i - 1] < 0 && v[i] >= 0) || (v[i - 1] >= 0 && v[i] < 0)) { const f = Math.abs(v[i - 1]) / (Math.abs(v[i - 1]) + Math.abs(v[i])); ev.push({ t: s.t0 + (i - 1 + f) * HALF, type: 'slack', v: 0 }); }
      if (Math.abs(v[i]) >= Math.abs(v[i - 1]) && Math.abs(v[i]) > Math.abs(v[i + 1]) && Math.abs(v[i]) > 0.25) ev.push({ t: s.t0 + i * HALF, type: v[i] > 0 ? 'flood' : 'ebb', v: v[i] });
    }
    return ev.sort((a, b) => a.t - b.t);
  }
  function curNow(s, t) {
    const v = M.seriesAt(s.v, s.t0, s.stepMs, t); if (v == null) return null;
    return { v, spd: Math.abs(v), dir: v >= 0 ? s.fd : s.ed, kind: v >= 0 ? 'flood' : 'ebb' };
  }
  function renderCurrents() {
    const box = $('curTbl');
    if (!S.cur) { box.innerHTML = '<p class="note">Loading…</p>'; return; }
    if (!S.cur.ok) { box.innerHTML = '<p class="err">NOAA currents unavailable — ETA ignores current.</p>'; $('curNote').textContent = ''; return; }
    const now = nowMs(), d = S.cur.data;
    const rows = d.stations.slice().sort((a, b) => (b.key || 0) - (a.key || 0) || b.lat - a.lat);
    const evLbl = (e) => (e.type === 'slack' ? 'slack' : e.type === 'flood' ? 'max flood ' + Math.abs(e.v).toFixed(1) : 'max ebb ' + Math.abs(e.v).toFixed(1));
    box.innerHTML = '<table class="t"><thead><tr><th>Station</th><th class="n">Now</th><th>Next events</th></tr></thead><tbody>' + rows.map((s) => {
      const c = curNow(s, now), ev = ((d.extremes[s.id] && d.extremes[s.id].length ? d.extremes[s.id] : deriveEvents(s)).filter((e) => e.t > now)).slice(0, 3);
      const nowTxt = c ? (c.spd < 0.15 ? 'slack' : '<span style="color:var(--' + (c.kind === 'flood' ? 'flood' : 'ebb') + ')">' + c.kind + ' ' + c.spd.toFixed(1) + ' kt → ' + deg3(c.dir) + '</span>') : '—';
      return '<tr' + (s.id === 'PUG1501' ? ' class="hl"' : '') + '><td>' + esc(s.name) + '<br><span class="note mono">' + s.id + '</span></td><td class="n" style="font-family:var(--f-body)">' + nowTxt + '</td><td class="mono" style="white-space:normal">' + (ev.length ? ev.map((e) => hm(e.t) + ' ' + evLbl(e)).join('<br>') : '—') + '</td></tr>';
    }).join('') + '</tbody></table>';
    $('curNote').innerHTML = 'Major-axis velocity from NOAA CO-OPS predictions (bin nearest the surface). Flood sets toward the flood direction shown, ebb the opposite. <b>Agate Passage</b> (highlighted) runs over 2.5 kt at max — plan to transit within about 45 min of slack. ' +
      (d.failed.length ? '<span class="err">Missing: ' + esc(d.failed.map((f) => f.id).join(', ')) + '.</span>' : '');
  }

  // -------------------------------------------------------------- NWS panel
  function renderNws() {
    const ab = $('alertsBox');
    if (!S.alerts) ab.innerHTML = '';
    else if (!S.alerts.ok) ab.innerHTML = '<div class="alert"><b>NWS alerts unavailable</b> — ' + esc(S.alerts.err) + '. Check weather.gov.</div>';
    else if (!S.alerts.data.length) ab.innerHTML = '<p class="note" style="margin:0 0 6px">No active marine alerts for PZZ131–135 (Puget Sound, Admiralty Inlet, Strait, N. Inland Waters).</p>';
    else ab.innerHTML = S.alerts.data.map((a) => '<div class="alert"><h3>' + esc(a.event) + '</h3><div>' + esc(a.headline || '') + '</div><details><summary class="note">Details</summary><pre class="nws">' + esc((a.description || '') + (a.instruction ? '\n\n' + a.instruction : '')) + '</pre></details></div>').join('');
    $('zoneTabs').innerHTML = ['PZZ135', 'PZZ134'].map((z) => '<button type="button" data-z="' + z + '" aria-pressed="' + (z === st.zone) + '">' + z + (z === 'PZZ135' ? ' Puget Sound' : ' Admiralty Inlet') + '</button>').join('');
    const r = S.zones[st.zone];
    $('zoneTxt').textContent = !r ? 'Loading…' : r.ok ? r.data.text : 'NWS zone forecast unavailable: ' + r.err;
    $('zoneMeta').textContent = r && r.ok ? 'Verbatim · ' + r.data.source + ' · issued ' + new Date(r.data.updated).toLocaleString('en-US', { timeZone: D.TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  }

  // -------------------------------------------------------------- routes
  function presetById(id) { return RT.PRESETS.find((r) => r.id === id); }
  function curPts() { return st.routeId === 'custom' ? st.custom : (presetById(st.routeId) || RT.PRESETS[0]).pts; }
  function curName() { return st.routeId === 'custom' ? 'Custom route' : presetById(st.routeId).name; }
  function fillRouteSel() {
    const sel = $('routeSel'), groups = {};
    RT.PRESETS.forEach((r) => { (groups[r.kind] = groups[r.kind] || []).push(r); });
    sel.innerHTML = Object.keys(groups).map((k) => '<optgroup label="' + esc(k) + '">' + groups[k].map((r) => '<option value="' + r.id + '">' + esc(r.name) + ' — ' + M.totalNM(r.pts).toFixed(1) + ' NM</option>').join('') + '</optgroup>').join('') + '<optgroup label="Your own"><option value="custom">Custom — click the map</option></optgroup>';
    sel.value = st.routeId;
  }
  function renderLegs() {
    const pts = curPts(), legs = M.buildLegs(pts), custom = st.routeId === 'custom';
    $('legTotal').textContent = legs.length + ' legs · ' + M.totalNM(pts).toFixed(1) + ' NM';
    let h = '<table class="t"><thead><tr><th>#</th><th class="n">°T</th><th class="n">NM</th>' + (custom ? '<th>To lat</th><th>To lon</th><th></th>' : '<th class="n">Σ NM</th>') + '</tr></thead><tbody>';
    legs.forEach((l, i) => {
      const locked = custom && i + 1 < CUSTOM_LOCK;
      h += '<tr><td>' + (i + 1) + '</td><td class="n">' + deg3(l.brg) + '</td><td class="n">' + l.nm.toFixed(2) + '</td>';
      if (custom) h += '<td><input type="number" step="0.0001" data-i="' + (i + 1) + '" data-k="0" value="' + pts[i + 1][0] + '"' + (locked ? ' disabled' : '') + ' aria-label="Waypoint ' + (i + 2) + ' latitude"></td><td><input type="number" step="0.0001" data-i="' + (i + 1) + '" data-k="1" value="' + pts[i + 1][1] + '"' + (locked ? ' disabled' : '') + ' aria-label="Waypoint ' + (i + 2) + ' longitude"></td><td>' + (locked ? '' : '<button class="btn sm" data-del="' + (i + 1) + '" aria-label="Delete waypoint ' + (i + 2) + '">✕</button>') + '</td>';
      else h += '<td class="n">' + l.end.toFixed(1) + '</td>';
      h += '</tr>';
    });
    $('legList').innerHTML = h + '</tbody></table>';
    $('customBar').hidden = !custom;
    const note = $('routeNote');
    note.textContent = custom ? (pts.length <= CUSTOM_LOCK ? 'Custom route: click the map to add waypoints, starting from the marina exit.' : 'Custom route — ' + (pts.length - CUSTOM_LOCK) + ' waypoint(s) added. Check each leg against the chart: nothing here avoids land.') : presetById(st.routeId).note;
  }

  // -------------------------------------------------------------- map
  let map, layers = {}, windMk = {}, curMk = {}, wpMk = [], routeLine, routeCase, homeMk, mapReady = false, chartLayer;
  // NOAA Chart Display Service (ENC data, chart symbology) via WMS. display_params is the Maritime Chart Service's JSON
  // vendor parameter. Layer 8 ("Data quality") is left out: it fills open water with CATZOC triangles.
  const CHART_WMS = 'https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/NOAAChartDisplay/MapServer/exts/MaritimeChartService/WMSServer';
  const CHART_LAYERS = '0,1,2,3,4,5,6,7,9,10,11,12';
  const isDark = () => st.theme === 'dark' || (st.theme === 'auto' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  // Feet, colour scheme (0 = day, 4 = dusk) and contours from the boat: shallow = draft, safety = draft + margin, deep = well beyond (contours are metres).
  function chartParams() {
    const b = st.boat, m = (ft) => Math.round(ft / M.FT_PER_M * 10) / 10;
    const shallow = Math.max(0.1, m(b.draft)), safety = Math.max(shallow, m(b.draft + b.margin)), deep = Math.round(Math.max(safety * 2, safety + 2) * 10) / 10;
    const P = [['ColorScheme', isDark() ? 4 : 0], ['DisplayDepthUnits', 2], ['ShallowContour', shallow], ['SafetyContour', safety], ['DeepContour', deep], ['SafetyDepth', safety]];
    return JSON.stringify({ ECDISParameters: { DynamicParameters: { Parameter: P.map((x) => ({ name: x[0], value: x[1] })) } } });
  }
  function updateChart() { if (chartLayer) chartLayer.setParams({ display_params: chartParams() }); }
  function initMap() {
    if (typeof L === 'undefined') { $('map').innerHTML = '<p class="note" style="padding:20px">Map library failed to load (offline?). The rest of the tool still works.</p>'; return; }
    map = L.map('map', { zoomControl: true, preferCanvas: false }).setView([47.76, -122.5], 10);
    chartLayer = L.tileLayer.wms(CHART_WMS, { layers: CHART_LAYERS, format: 'image/png', transparent: true, version: '1.1.1', display_params: chartParams(), maxZoom: 18,
      attribution: 'Chart: <a href="https://nauticalcharts.noaa.gov/">NOAA Office of Coast Survey</a> (ENC, not for navigation)' }).addTo(map);
    chartLayer.on('tileerror', () => { if (++S.chartErr === 4) renderStatus(); });
    chartLayer.on('tileload', () => { if (S.chartErr) { const was = S.chartErr >= 4; S.chartErr = 0; if (was) renderStatus(); } });
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors', className: 'base-tiles' });
    const sea = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenSeaMap contributors' });
    layers.wind = L.layerGroup().addTo(map); layers.cur = L.layerGroup().addTo(map); layers.route = L.layerGroup().addTo(map); layers.depth = L.layerGroup().addTo(map);
    L.control.layers({ 'NOAA chart': chartLayer, 'OpenStreetMap': osm }, { 'OpenSeaMap seamarks': sea, 'Current arrows': layers.cur, 'Wind arrows': layers.wind, 'Route': layers.route, 'Depth warnings': layers.depth }, { collapsed: true }).addTo(map);
    const NmScale = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd(m) { const d = L.DomUtil.create('div', 'nm-scale'); this._d = d; m.on('zoomend moveend', this._u, this); this._u(); return d; },
      onRemove(m) { m.off('zoomend moveend', this._u, this); },
      _u() {
        const m = this._map; if (!m || !this._d) return; const y = m.getSize().y / 2;
        const nm = m.distance(m.containerPointToLatLng([10, y]), m.containerPointToLatLng([110, y])) / 1852;
        let pick = 0.1; [0.1, 0.25, 0.5, 1, 2, 5, 10, 20].forEach((s) => { if (s <= nm) pick = s; });
        this._d.style.width = Math.round(100 * pick / nm) + 'px'; this._d.textContent = pick + ' NM';
      }
    });
    new NmScale().addTo(map);
    homeMk = L.marker(RT.HOME, { icon: L.divIcon({ className: '', html: '<span class="mk-home">Shilshole</span>', iconSize: [0, 0] }), interactive: false, zIndexOffset: -100 }).addTo(map);
    map.on('click', (e) => { if (st.routeId === 'custom') addPoint([+e.latlng.lat.toFixed(4), +e.latlng.lng.toFixed(4)]); });
    mapReady = true;
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { map.invalidateSize(); if (fitPending || map.getZoom() < 7) fitRoute(); }).observe($('map'));
  }
  function windIcon(k, dirTo, label) {
    return L.divIcon({ className: 'mk-wind', iconSize: [34, 34], iconAnchor: [17, 17],
      html: '<svg width="34" height="34" viewBox="-17 -17 34 34"><g transform="rotate(' + dirTo.toFixed(0) + ')"><path d="M0,-13 L7,9 L0,5 L-7,9 Z" fill="' + windColor(k) + '" stroke="#08202f" stroke-width="1.2"/></g></svg><span class="lbl">' + label + '</span>' });
  }
  function curIcon(spd, dir, kind) {
    const len = 12 + 22 * Math.min(spd, 3) / 3, col = kind === 'flood' ? 'var(--flood)' : 'var(--ebb)', sz = 60;
    const body = spd < 0.1 ? '<circle r="4" fill="none" stroke="' + col + '" stroke-width="2"/>' :
      '<g transform="rotate(' + dir.toFixed(0) + ')"><line x1="0" y1="' + (len / 2) + '" x2="0" y2="' + (-len / 2 + 4) + '" stroke="' + col + '" stroke-width="3.2" stroke-linecap="round"/><path d="M0,' + (-len / 2 - 3) + ' L6,' + (-len / 2 + 7) + ' L-6,' + (-len / 2 + 7) + ' Z" fill="' + col + '"/></g>';
    return L.divIcon({ className: 'mk-cur', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2], html: '<svg width="' + sz + '" height="' + sz + '" viewBox="-30 -30 60 60">' + body + '</svg><span class="lbl">' + spd.toFixed(1) + '</span>' });
  }
  function updateMarkers() {
    if (!mapReady || st.mapT == null) return;
    const t = st.mapT;
    $('mapTout').textContent = fmtT(t);
    if (S.wx && S.wx.ok) S.wx.data.points.forEach((p) => {
      const ws = M.seriesAt(p.ws, p.t0, p.stepMs, t), wd = M.seriesAt(p.wd, p.t0, p.stepMs, t); if (ws == null || wd == null) return;
      const gu = M.seriesAt(p.gust, p.t0, p.stepMs, t), icon = windIcon(ws, (wd + 180) % 360, String(Math.round(ws)));
      const tip = esc(p.name) + '<br>' + Math.round(ws) + ' kt (gust ' + Math.round(gu) + ') from ' + M.compass(wd) + ' ' + deg3(wd);
      if (!windMk[p.id]) windMk[p.id] = L.marker([p.lat, p.lon], { icon, keyboard: false }).bindTooltip(tip).addTo(layers.wind);
      else { windMk[p.id].setIcon(icon); windMk[p.id].setTooltipContent(tip); }
    });
    if (S.cur && S.cur.ok) S.cur.data.stations.forEach((s) => {
      const c = curNow(s, t); if (!c) return;
      const icon = curIcon(c.spd, c.dir, c.kind), tip = esc(s.name) + ' <span class="mono">' + s.id + '</span><br>' + (c.spd < 0.1 ? 'slack' : c.kind + ' ' + c.spd.toFixed(2) + ' kt toward ' + deg3(c.dir) + 'T');
      if (!curMk[s.id]) curMk[s.id] = L.marker([s.lat, s.lon], { icon, keyboard: false, zIndexOffset: 50 }).bindTooltip(tip).addTo(layers.cur);
      else { curMk[s.id].setIcon(icon); curMk[s.id].setTooltipContent(tip); }
    });
  }
  const etaAtDist = M.etaAtDist;
  function drawRoute() {
    if (!mapReady) return;
    layers.route.clearLayers(); wpMk = [];
    const pts = curPts(), custom = st.routeId === 'custom', legs = M.buildLegs(pts);
    if (pts.length > 1) {
      L.polyline(pts, { color: '#ffffff', weight: 8, opacity: .75, interactive: false }).addTo(layers.route);
      const dr = st.result && st.result.depth && st.routeId === st.result.routeId ? st.result.depthRuns : null;   // thin / aground stretches, drawn as a halo
      (dr || []).forEach((r) => L.polyline(r.pts, { color: DEPTH_COL[r.status], weight: 12, opacity: .9, lineCap: 'butt', interactive: false, depthRun: true }).addTo(layers.route));
      L.polyline(pts, { color: '#d5361c', weight: 4, opacity: .95, interactive: false }).addTo(layers.route);
    }
    pts.forEach((p, i) => {
      const last = i === pts.length - 1, withEta = st.result && st.routeId === st.result.routeId;
      let eta = ''; if (withEta && i > 0) { const t = etaAtDist(st.result, legs[i - 1].end); if (t) eta = '<br>ETA ' + fmtT(t); }
      const tip = (i === 0 ? 'Start · Shilshole Bay Marina' : 'WP ' + (i + 1) + ' · ' + deg3(legs[i - 1].brg) + 'T ' + legs[i - 1].nm.toFixed(2) + ' NM') + eta;
      let m;
      if (custom) {
        if (i < CUSTOM_LOCK) return;
        m = L.marker(p, { draggable: true, icon: L.divIcon({ className: '', html: '<div class="mk-wp drag"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }) });
        m.on('drag', () => { const ll = m.getLatLng(); layersLineUpdate(i, [ll.lat, ll.lng]); });
        m.on('dragend', () => { const ll = m.getLatLng(); st.custom[i] = [+ll.lat.toFixed(4), +ll.lng.toFixed(4)]; save(); afterRouteEdit(); });
      } else if (last) m = L.circleMarker(p, { radius: 7, color: '#08202f', weight: 2, fillColor: '#f0b21a', fillOpacity: 1 });
      else if (i > 0) m = L.circleMarker(p, { radius: 4, color: '#d5361c', weight: 2, fillColor: '#fff', fillOpacity: 1 });
      else return;
      m.bindTooltip(tip, { permanent: !!(last && withEta), direction: 'top', offset: [0, -6] }).addTo(layers.route);
    });
    drawDepth();
  }
  // Markers at the shallowest point of each leg that warns (outbound result only).
  const DEPTH_COL = { thin: '#f0b21a', aground: '#8f0f2a' };
  function drawDepth() {
    if (!mapReady) return; layers.depth.clearLayers();
    const r = st.result; if (!r || !r.depth || st.routeId !== r.routeId) return;
    r.depth.legs.forEach((lg) => {
      if (lg.status !== 'thin' && lg.status !== 'aground') return;
      const h = lg.land || lg.atEta;
      const tip = 'Leg ' + (lg.i + 1) + (h.marina ? ' · marina basin — check the chart' : '') + '<br>' + (lg.land ? 'land / drying in the depth grid (' + sgn(h.elevM * M.FT_PER_M) + ' ft NAVD88)' :
        f1(h.depth) + ' ft at ' + hm(h.t) + ' (' + f1(h.mllw) + ' ft MLLW, tide ' + sgn(h.tide) + ')<br>' + f1(h.ukc) + ' ft under keel · draft ' + f1(r.depth.draft) + ', margin ' + f1(r.depth.margin));
      L.circleMarker([h.lat, h.lon], { radius: 7, color: '#fff', weight: 2, fillColor: DEPTH_COL[lg.status], fillOpacity: 1 }).bindTooltip(tip, { direction: 'top', offset: [0, -6] }).addTo(layers.depth);
    });
  }
  function layersLineUpdate(i, ll) {            // live polyline while dragging
    const pts = st.custom.map((p) => p.slice()); pts[i] = ll;
    layers.route.eachLayer((l) => { if (l instanceof L.Polyline && !(l instanceof L.Polygon) && l.getLatLngs && l.options && l.options.weight >= 4 && !l.options.depthRun) l.setLatLngs(pts); });
  }
  // A fit made while the map box has no size zooms Leaflet out to the whole world; defer it until the box is measured.
  let fitPending = false;
  function fitRoute() {
    if (!mapReady) return; const pts = curPts(); if (pts.length < 2) return;
    const sz = map.getSize(); if (!sz.x || !sz.y) { fitPending = true; return; }
    fitPending = false; map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 12 });
  }
  function addPoint(ll) { st.custom.push(ll); save(); afterRouteEdit(); }
  function afterRouteEdit() { st.result = st.ret = st.best = null; renderLegs(); drawRoute(); renderResults(); renderBest(); renderWx(); renderTide(); }

  // -------------------------------------------------------------- planner
  function readBoat() {
    const b = st.boat;
    b.loa = +$('loa').value || 30; b.lwl = +$('lwl').value || 25; b.perf = clamp((+$('perf').value || 90) / 100, 0.5, 1.1);
    b.motorKt = +$('motorKt').value || 5.5; b.motorBelowEnabled = $('motorLight').checked; b.motorBelowKt = +$('motorBelow').value || 5;
    b.motorWindward = $('motorWind').checked; b.motorSail = $('motorSail').checked; b.type = $('boatType').value;
    b.draft = clamp(+$('draft').value || M.DEFAULT_BOAT.draft, 1, 15); b.margin = clamp($('margin').value === '' ? M.DEFAULT_BOAT.margin : +$('margin').value || 0, 0, 10);
    $('hull').value = M.hullSpeed(b.lwl).toFixed(2);
    return b;
  }
  function writeBoat() {
    const b = st.boat;
    $('boatType').value = b.type; $('loa').value = b.loa; $('lwl').value = b.lwl; $('perf').value = Math.round(b.perf * 100); $('motorKt').value = b.motorKt;
    $('draft').value = b.draft; $('margin').value = b.margin; $('motorLight').checked = !!b.motorBelowEnabled; $('motorBelow').value = b.motorBelowKt; $('motorWind').checked = !!b.motorWindward; $('motorSail').checked = !!b.motorSail;
    $('hull').value = M.hullSpeed(b.lwl).toFixed(2);
  }
  function readDepart() { const v = D.parseLocal($('depart').value || ''); return v == null ? st.depart : v; }
  function calc() {
    const pts = curPts(); if (pts.length < 2 || (st.routeId === 'custom' && pts.length <= CUSTOM_LOCK)) { $('resBody').innerHTML = '<p class="err">Click the map to add at least one waypoint beyond the marina exit.</p>'; $('resPanel').hidden = false; return; }
    const boat = readBoat(); st.depart = readDepart(); save();
    const env = makeEnv(), opts = { agate: RT.AGATE, advisories: alertNames(), stepMin: 5 };
    st.result = M.simulate(pts, env, boat, st.depart, opts); st.result.routeId = st.routeId; st.result.name = curName(); runDepth(st.result, pts);
    const from = Math.max(nowMs(), axis0), scanFrom = Math.ceil(from / HALF) * HALF;
    st.best = M.bestDeparture(pts, env, boat, scanFrom, 36, Object.assign({}, opts, { stepMin: 10 }));
    st.hasCalc = true; st.ret = null; $('retBar').hidden = true;
    $('btnReturn').disabled = false;
    st.mapT = Math.round((st.depart - axis0) / HALF) * HALF + axis0; syncSlider();
    renderResults(); renderBest(); drawRoute(); updateMarkers(); renderWx(); renderTide();
  }
  function calcReturn() {
    if (!st.result) return;
    const rev = curPts().slice().reverse(), boat = readBoat();
    st.retDepart = D.parseLocal($('retDepart').value || '') || Math.ceil((st.result.eta + 2 * H) / HALF) * HALF;
    const opts = { agate: RT.AGATE, advisories: alertNames(), stepMin: 5 };
    st.ret = M.simulate(rev, makeEnv(), boat, st.retDepart, opts); st.ret.name = 'Return: ' + curName() + ' → Shilshole'; runDepth(st.ret, rev);
    renderResults();
  }

  // -------------------------------------------------------------- depth check
  // Bathymetry samples are fetched once per route geometry (cached); the tide / draft / departure adjustment re-runs on every calc.
  function evalDepth(res) {
    const dem = S.depth[res.depthKey], b = st.boat; if (!dem) return;
    const o = { draft: b.draft, margin: b.margin, nLegs: res.legs.length, etaAt: (d) => M.etaAtDist(res, d), tideAt: tideHeight };
    res.depth = M.evaluateDepth(dem, o); res.depthRuns = M.depthRuns(dem, res.depth, o); res.depthState = 'ok';
  }
  function depthDone(res) { if (st.result === res || st.ret === res) { renderResults(); drawRoute(); } }
  function runDepth(res, pts) {
    res.depth = res.depthRuns = null; res.depthErr = null; res.depthKey = M.routeHash(pts, M.DEM_SAMPLE_M);
    if (S.depth[res.depthKey]) { res.depthState = 'ok'; evalDepth(res); return; }
    res.depthState = 'load';
    const key = res.depthKey;
    if (!S.depthP[key]) {
      S.depthBusy++; renderStatus();
      S.depthP[key] = D.loadDepth(pts).then((r) => { S.depthBusy--; S.depthLast = r; delete S.depthP[key]; if (r.ok) S.depth[key] = r.data; renderStatus(); return r; });
    }
    S.depthP[key].then((r) => { if (r.ok) evalDepth(res); else { res.depthState = 'err'; res.depthErr = r.err; } depthDone(res); });
  }
  function reevalDepth() {      // tide data arrived or changed
    [st.result, st.ret].forEach((r) => { if (r && r.depthState === 'ok') evalDepth(r); });
    if (st.result) { renderResults(); drawRoute(); }
  }
  const CHIP = { ok: ['ok', 'ok'], thin: ['warn', 'thin'], aground: ['bad', 'aground'], nodata: ['mute', 'no data'] };
  function depthCell(res, i) {
    if (res.depthState === 'load') return '<td class="note">checking…</td>';
    const lg = res.depth && res.depth.legs[i]; if (!lg) return '<td class="note">not checked</td>';
    const c = CHIP[lg.status], chip = '<span class="chip ' + c[0] + '">' + c[1] + '</span>' + (lg.nNoData && lg.status !== 'nodata' ? ' <span class="note">+' + lg.nNoData + ' no data</span>' : '');
    if (!lg.valid) return '<td>' + chip + '</td>';
    const A = lg.atEta, mn = lg.mllw;
    return '<td class="num">' + (lg.land ? 'land' : f1(mn.mllw) + ' ft MLLW / ' + f1(A.depth) + ' ft @ ' + hm(A.t)) + ' ' + chip + (A.marina || mn.marina ? ' <span class="note">marina</span>' : '') + '</td>';
  }
  function depthWarnings(res) {
    if (res.depthState === 'err') return [{ lvl: 'warn', code: 'depth-off', text: 'Depth was not checked: the NOAA bathymetry service failed (' + res.depthErr + '). Check the chart for shoals along the route.' }];
    return res.depth ? res.depth.warnings : [];
  }
  function warnHTML(res) {
    const lbl = { bad: 'Warning', warn: 'Caution', info: 'Note' };
    const all = res.warnings.concat(depthWarnings(res));
    return '<ul class="warns">' + (all.length ? all.map((w) => '<li class="' + w.lvl + '"><b>' + lbl[w.lvl] + '</b>' + esc(w.text) + '</li>').join('') : '<li><b>OK</b>No flags raised by the model.</li>') + '</ul>';
  }
  function resultHTML(title, res) {
    const tide = (t) => { const v = tideHeight(t); return v == null ? '' : ' · tide ' + f1(v) + ' ft'; };
    let h = '<h3 style="font-size:22px;margin:6px 0 2px">' + esc(title) + '</h3>';
    h += '<div class="tiles">' +
      '<div class="tile"><div class="k">Depart</div><div class="v num">' + fmtT(res.depart) + '</div><small class="num">' + (tide(res.depart) || '&nbsp;') + '</small></div>' +
      '<div class="tile"><div class="k">ETA</div><div class="v num">' + fmtT(res.eta) + '</div><small class="num">' + (tide(res.eta) || '&nbsp;') + '</small></div>' +
      '<div class="tile"><div class="k">Elapsed</div><div class="v">' + fmtDur(res.elapsedH) + '</div></div>' +
      '<div class="tile"><div class="k">Distance</div><div class="v num">' + res.totalNM.toFixed(1) + ' <small>NM</small></div></div>' +
      '<div class="tile"><div class="k">Avg SOG</div><div class="v num">' + res.avgSog.toFixed(1) + ' <small>kt</small></div></div></div>';
    h += warnHTML(res);
    h += '<div class="tbl-wrap"><table class="t"><thead><tr><th>Leg</th><th class="n">°T</th><th class="n">NM</th><th class="n">TWS/gust</th><th class="n">TWA</th><th>Point of sail</th><th>Sail / motor</th><th class="n">Current</th><th class="n">Time</th><th class="n">ETA</th><th>Min depth</th></tr></thead><tbody>';
    let cum = 0;
    res.legs.forEach((l, i) => {
      cum += l.nm; const tEnd = etaAtDist(res, cum);
      const mode = l.mode + (l.tacks ? ' · ~' + l.tacks + ' tacks' : '') + (l.gybes ? ' · ~' + l.gybes + ' gybes' : '');
      const cur = Math.abs(l.curAlong) < 0.05 ? '0.0' : '<span class="' + (l.curAlong > 0 ? 'pos' : 'neg') + '">' + sgn(l.curAlong) + ' ' + (l.curAlong > 0 ? 'help' : 'hinder') + '</span>';
      h += '<tr><td>' + (i + 1) + '</td><td class="n">' + deg3(l.brg) + '</td><td class="n">' + l.nm.toFixed(2) + '</td><td class="n">' + Math.round(l.avgTws) + '/' + Math.round(l.maxGust) + '</td><td class="n">' + Math.round(l.avgTwa) + '°</td><td>' + esc(l.pointOfSail) + '</td><td>' + esc(mode) + '</td><td class="n">' + cur + '</td><td class="n">' + fmtDur(l.hours).replace(' min', 'm').replace(' h ', 'h ') + '</td><td class="n">' + (tEnd ? hm(tEnd) : '') + '</td>' + depthCell(res, i) + '</tr>';
    });
    h += '</tbody></table></div>';
    if (res.depthState !== 'load') h += '<p class="note" style="margin:6px 0 0">' + (res.depth ? 'Depth: NOAA NCEI bathymetry grid (~3–10 m cells, smoothed), sampled every ~' + M.DEM_SAMPLE_M + ' m, adjusted by the predicted Seattle tide (draft ' + f1(st.boat.draft) + ' ft, margin ' + f1(st.boat.margin) + ' ft). It can miss rocks, pilings and narrow shoals — the chart layer is the authority.' : 'Depth not checked for this trip — use the chart layer.') + '</p>';
    return h;
  }
  function renderResults() {
    const panel = $('resPanel');
    if (!st.result) { panel.hidden = true; $('btnReturn').disabled = true; return; }
    panel.hidden = false;
    $('resBody').innerHTML = resultHTML(st.result.name + ' — outbound', st.result) + (st.ret ? '<div class="sect">' + resultHTML(st.ret.name, st.ret) + '</div>' : '');
  }
  function renderBest() {
    const panel = $('bestPanel'), b = st.best;
    if (!b || !b.length) { panel.hidden = true; return; }
    panel.hidden = false;
    const W = boxW('bestChart', 480), Hh = 230, ml = 40, mr = 8, mt = 22, mb = 34;
    const t0 = b[0].depart, t1 = b[b.length - 1].depart + HALF, px = (W - ml - mr) / (t1 - t0);
    const emax = Math.max.apply(null, b.map((o) => o.elapsedH)) * 1.12, emin = 0, y = (v) => mt + (Hh - mt - mb) * (1 - (v - emin) / (emax - emin));
    let g = '<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--panel-2)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--mute)" stroke-width="2"/></pattern></defs>';
    g += nightRects(0, mt, Hh - mt - mb, t0, t1, px, ml);
    const step = emax > 8 ? 2 : 1; for (let v = 0; v <= emax; v += step) g += '<line class="c-grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/><text x="' + (ml - 4) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + v + '</text>';
    b.forEach((o) => {
      const x = ml + (o.depart - t0) * px, w = Math.max(2, HALF * px - 1.5), cls = o.best ? 'var(--go)' : o.fast ? 'color-mix(in srgb, var(--go) 60%, var(--panel))' : 'var(--wind-2)';
      const sel = st.result && Math.abs(st.result.depart - o.depart) < 1000;
      g += '<g class="bar" data-dep="' + o.depart + '"><title>' + fmtT(o.depart) + ' → ETA ' + fmtT(o.eta) + ' · ' + fmtDur(o.elapsedH) + ' · ' + o.avgSog.toFixed(1) + ' kt' + (o.afterSunset ? ' · arrives after sunset' : '') + (o.bad ? ' · ' + o.bad + ' warning(s)' : '') + '</title><rect x="' + x.toFixed(1) + '" y="' + y(o.elapsedH).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + (y(0) - y(o.elapsedH)).toFixed(1) + '" fill="' + (o.afterSunset ? 'url(#hatch)' : cls) + '"' + (o.afterSunset ? ' stroke="' + (o.fast ? 'var(--go)' : 'var(--mute)') + '"' : '') + (sel ? ' stroke="var(--now)" stroke-width="2.5"' : '') + '/>' + (o.bad ? '<circle cx="' + (x + w / 2).toFixed(1) + '" cy="' + (y(o.elapsedH) - 5).toFixed(1) + '" r="2.6" fill="var(--flag)"/>' : '') + '</g>';
    });
    for (let t = Math.ceil(t0 / (3 * H)) * 3 * H; t < t1; t += 3 * H) {
      const hr = new Date(t).getUTCHours();
      g += '<text x="' + (ml + (t - t0) * px - 8).toFixed(1) + '" y="' + (Hh - 18) + '">' + String(hr).padStart(2, '0') + '</text>';
      if (hr === 0) g += '<text class="big" x="' + (ml + (t - t0) * px - 8).toFixed(1) + '" y="' + (Hh - 4) + '">' + dayLbl(t) + '</text>';
    }
    g += '<text x="2" y="' + (mt - 8) + '">h elapsed</text>';
    $('bestChart').innerHTML = '<svg width="' + W + '" height="' + Hh + '" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Elapsed time by departure time">' + g + '</svg>';
    const best = b.find((o) => o.best), worst = b.reduce((a, o) => (o.elapsedH > a.elapsedH ? o : a), b[0]);
    const groups = []; b.forEach((o) => { if (!o.fast) return; const last = groups[groups.length - 1]; if (last && o.depart - last.end <= HALF) last.end = o.depart; else groups.push({ start: o.depart, end: o.depart }); });
    $('bestTxt').innerHTML = '<b>Fastest:</b> leave ' + fmtT(best.depart) + ' → ' + fmtDur(best.elapsedH) + ', ETA ' + fmtT(best.eta) + ' (' + best.avgSog.toFixed(1) + ' kt). <b>Slowest:</b> ' + fmtT(worst.depart) + ' → ' + fmtDur(worst.elapsedH) + '. <b>Fast windows</b> (within 5 %): ' + groups.map((q) => q.start === q.end ? fmtT(q.start) : fmtT(q.start) + '–' + hm(q.end)).join(', ') + '. <span class="note">Hatched = arrives after sunset; red dot = model warnings.</span>';
  }

  // -------------------------------------------------------------- slider
  function syncSlider() { const i = clamp(Math.round((st.mapT - axis0) / HALF), 0, 143); $('mapT').value = i; }

  // -------------------------------------------------------------- loading
  function loadAll(force) {
    const now = nowMs(); axis0 = D.dayStart(now); const begin = D.ymd(now);
    S.wx = S.alerts = S.tides = S.cur = null; S.zones = {}; renderStatus();
    const done = (key, setter) => (r) => { setter(r); renderStatus(); renderAll(); };
    D.loadWeather(force).then(done('wx', (r) => { S.wx = r; }));
    D.loadAlerts(force).then(done('alerts', (r) => { S.alerts = r; }));
    D.loadZoneText('PZZ135', force).then(done('z1', (r) => { S.zones.PZZ135 = r; }));
    D.loadZoneText('PZZ134', force).then(done('z2', (r) => { S.zones.PZZ134 = r; }));
    D.loadTides(begin, force).then(done('tides', (r) => { S.tides = r; reevalDepth(); }));
    D.loadCurrents(begin, force).then(done('cur', (r) => { S.cur = r; }));
  }
  function renderAll() {
    renderGo(); renderWx(); renderTide(); renderCurrents(); renderNws(); updateMarkers();
    if (S.wx && S.wx.ok && !$('wxPoint').options.length) {
      $('wxPoint').innerHTML = S.wx.data.points.map((p) => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join(''); $('wxPoint').value = st.wxPoint;
    }
    if (st.hasCalc && (S.wx || S.cur)) { /* keep the current result; user can recalc after refresh */ }
  }

  // -------------------------------------------------------------- wiring
  function applyTheme() {
    const r = document.documentElement; if (st.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', st.theme);
    $('btnTheme').textContent = 'Theme: ' + st.theme; updateChart();
  }
  function wire() {
    $('btnRefresh').addEventListener('click', () => loadAll(true));
    $('btnTheme').addEventListener('click', () => { st.theme = { auto: 'light', light: 'dark', dark: 'auto' }[st.theme]; applyTheme(); save(); });
    $('routeSel').addEventListener('change', (e) => {
      const v = e.target.value;
      if (v === 'custom' && st.routeId !== 'custom') { st.lastPreset = st.routeId; }
      if (v !== 'custom') st.lastPreset = v;
      st.routeId = v; st.result = st.ret = st.best = null; save();
      renderLegs(); drawRoute(); fitRoute(); renderResults(); renderBest(); $('btnReturn').disabled = true; $('retBar').hidden = true; renderWx(); renderTide();
    });
    $('btnUndo').addEventListener('click', () => { if (st.custom.length > CUSTOM_LOCK) { st.custom.pop(); save(); afterRouteEdit(); } });
    $('btnClear').addEventListener('click', () => { st.custom = st.custom.slice(0, CUSTOM_LOCK); save(); afterRouteEdit(); });
    $('btnCopy').addEventListener('click', () => { const p = presetById(st.lastPreset) || RT.PRESETS[0]; st.custom = p.pts.map((q) => q.slice()); save(); afterRouteEdit(); fitRoute(); });
    $('legList').addEventListener('change', (e) => {
      const t = e.target; if (!t.dataset || t.dataset.i == null) return;
      const i = +t.dataset.i, k = +t.dataset.k, v = parseFloat(t.value); if (!isFinite(v)) return;
      st.custom[i][k] = v; save(); afterRouteEdit();
    });
    $('legList').addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-del]'); if (!b) return; st.custom.splice(+b.dataset.del, 1); save(); afterRouteEdit(); });
    $('btnHour').addEventListener('click', () => { st.depart = Math.floor(nowMs() / H) * H + H; $('depart').value = toInput(st.depart); if (st.hasCalc) calc(); });
    $('depart').addEventListener('change', () => { if (st.hasCalc) calc(); });
    $('btnCalc').addEventListener('click', () => { calc(); if (isPhone()) setTimeout(() => $('resPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); });
    $('btnReturn').addEventListener('click', () => {
      $('retBar').hidden = false; if (!$('retDepart').value && st.result) $('retDepart').value = toInput(Math.ceil((st.result.eta + 2 * H) / HALF) * HALF);
      calcReturn();
    });
    $('retDepart').addEventListener('change', calcReturn);
    ['loa', 'lwl', 'perf', 'motorKt', 'motorLight', 'motorBelow', 'motorWind', 'motorSail', 'draft', 'margin'].forEach((id) => $(id).addEventListener('change', () => {
      if (id === 'loa' || id === 'lwl') $('boatType').value = 'custom';
      readBoat(); if (id === 'draft' || id === 'margin') { $('draft').value = st.boat.draft; $('margin').value = st.boat.margin; updateChart(); } save(); if (st.hasCalc) calc();
    }));
    $('boatType').addEventListener('change', () => {
      const p = M.BOAT_PRESETS[$('boatType').value];
      if (p) { $('loa').value = p.loa; $('lwl').value = p.lwl; $('perf').value = Math.round(p.perf * 100); $('motorKt').value = p.motorKt; }
      readBoat(); save(); if (st.hasCalc) calc();
    });
    $('wxPoint').addEventListener('change', (e) => { st.wxPoint = e.target.value; save(); renderWx(); });
    $('zoneTabs').addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-z]'); if (!b) return; st.zone = b.dataset.z; save(); renderNws(); renderStatus(); });
    $('mapT').addEventListener('input', () => { st.mapT = axis0 + (+$('mapT').value) * HALF; updateMarkers(); });
    $('btnMapDep').addEventListener('click', () => { st.mapT = Math.round(((st.depart || nowMs()) - axis0) / HALF) * HALF + axis0; syncSlider(); updateMarkers(); });
    $('btnMapNow').addEventListener('click', () => { st.mapT = Math.round((nowMs() - axis0) / HALF) * HALF + axis0; syncSlider(); updateMarkers(); });
    $('bestChart').addEventListener('click', (e) => { const g = e.target.closest && e.target.closest('[data-dep]'); if (!g) return; st.depart = +g.dataset.dep; $('depart').value = toInput(st.depart); calc(); });
    let rt; const redraw = () => { clearTimeout(rt); rt = setTimeout(() => { renderWx(); renderTide(); renderBest(); if (map) map.invalidateSize(); }, 120); };
    if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(redraw); ['wxChart', 'tideChart', 'bestChart'].forEach((id) => ro.observe($(id))); } else window.addEventListener('resize', redraw);
  }

  // Phone layout: one section group at a time behind a bottom tab bar (CSS hides the others under 760px).
  function setTab(tab, scroll) {
    document.body.dataset.mtab = tab;
    document.querySelectorAll('#mtabs [data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
    try { localStorage.setItem('sp.mtab', tab); } catch (e) {}
    if (scroll !== false) window.scrollTo(0, 0);
    if (tab === 'chart' && map) setTimeout(() => { map.invalidateSize(); if (fitPending) fitRoute(); }, 30);
    if (tab === 'now' || tab === 'tide' || tab === 'plan') setTimeout(() => { renderWx(); renderTide(); renderBest(); }, 30);
  }
  function wireTabs() {
    $('mtabs').addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
    let t = 'now'; try { t = localStorage.getItem('sp.mtab') || 'now'; } catch (e) {}
    setTab(['now', 'chart', 'plan', 'tide'].includes(t) ? t : 'now', false);
  }
  const isPhone = () => window.matchMedia('(max-width: 760px)').matches;

  function init() {
    loadPrefs();
    const sel = $('boatType'); sel.innerHTML = Object.keys(M.BOAT_PRESETS).map((k) => '<option value="' + k + '">' + esc(M.BOAT_PRESETS[k].label) + '</option>').join('') + '<option value="custom">Custom</option>';
    fillRouteSel(); writeBoat(); applyTheme();
    st.depart = Math.floor(nowMs() / H) * H + H; $('depart').value = toInput(st.depart);
    st.mapT = Math.round((st.depart - axis0) / HALF) * HALF + axis0; syncSlider();
    wireTabs(); initMap(); wire();
    if (typeof window.matchMedia === 'function') { const mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', updateChart); } renderLegs(); drawRoute(); fitRoute(); updateMarkers();
    renderStatus(); renderGo(); renderWx(); renderTide(); renderCurrents(); renderNws();
    loadAll(false);
    if (map) setTimeout(() => map.invalidateSize(), 250);
    // refresh the "now" decorations once a minute
    setInterval(() => { renderGo(); renderWx(); renderTide(); renderCurrents(); }, 60000);
  }
  init();
  window.SP.app = { st, S, calc, loadAll };
})();
