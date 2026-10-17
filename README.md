# Sound Passage

Local, single-page sailing prep tool for Puget Sound from Shilshole Bay Marina (Ballard, Seattle): wind and weather, NWS marine alerts and forecast text, tide curve, NOAA tidal currents on a chart, the NOAA chart (ENC, depths in feet, safety contour from your draft), route presets or your own clicked route, an ETA / best-departure model that blends forecast wind with tidal current, and a per-leg depth check (NOAA NCEI bathymetry grid, tide-adjusted, against your draft + margin).

Run: `python3 -m http.server 8765 -d ~/sailprep` then open <http://localhost:8765>

No build step, no npm. Needs internet (Open-Meteo, NOAA CO-OPS, api.weather.gov, NOAA Chart Display Service WMS, NOAA NCEI DEM ImageServer, OSM and OpenSeaMap tiles, Leaflet + Google Fonts from CDNs). All data sources are keyless; results are cached in localStorage for 20 minutes.

## Files

- `index.html`, `style.css` – page and theme (light/dark via CSS tokens).
- `js/model.js` – pure routing/ETA model (polar, VMG, current vector math, simulation, best-departure scan) and the depth math (datum offsets, route sampling, clearance). Also loads under node.
- `js/routes.js` – 14 route presets (water-only waypoints, Shilshole first) and the Agate Passage coordinates used for current warnings.
- `js/data.js` – fetch layer: cache, retry, per-source error states, parsing.
- `js/app.js` – UI, map, charts.
- `test/depth.test.js` – offline depth-model checks (datum math, clearance logic). `test/depth.live.test.js` – samples the live DEM for every preset at MLLW. `test/sim.test.js` – offline model checks. `test/live.test.js` – hits the real APIs and sims every preset. `test/smoke.test.js` – boots the UI against a stub DOM with live data.

Run tests: `node test/sim.test.js` and `node test/depth.test.js` (offline), `node test/live.test.js`, `node test/smoke.test.js` (need network).

## Depth

The chart is NOAA's Chart Display Service WMS; `display_params` (JSON) sets feet, day/dusk colours and the shallow / safety / deep contours from draft and margin. The depth check POSTs sample points (every ~50 m) to the NCEI DEM mosaic's `getSamples` (max 1000 points per call; we send 250), converts NAVD88 elevation to depth below MLLW with the Seattle 9447130 datum offset (NAVD88 = MLLW + 0.715 m, fetched from CO-OPS 2026-10-17), adds the predicted tide at the time the boat passes each point, and compares with draft and margin. Samples are cached per route geometry for 90 days.

## Not for navigation

Forecast and model output only. The ETA ignores traffic lanes, shoals, rips, ferries and your boat's real performance. Preset waypoints were generated against OpenStreetMap coastline data and checked for land crossings, but check them against the NOAA charts before you rely on them. Check the current NWS forecast before leaving the dock.
