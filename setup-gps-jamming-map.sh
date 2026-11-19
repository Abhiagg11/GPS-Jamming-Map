#!/usr/bin/env bash
set -euo pipefail

# Run this script from the root of the blank gps-jamming-map repository.

cat > package.json <<'JSON'
{
  "name": "gps-jamming-map",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 0.0.0.0"
  },
  "dependencies": {
    "leaflet": "^1.9.4",
    "lucide-react": "^0.468.0",
    "papaparse": "^5.5.3",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-leaflet": "^5.0.0"
  },
  "devDependencies": {
    "@types/geojson": "^7946.0.16",
    "@types/leaflet": "^1.9.20",
    "@types/papaparse": "^5.3.16",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.7",
    "@vitejs/plugin-react": "^4.7.0",
    "typescript": "~5.8.3",
    "vite": "^6.3.5"
  }
}
JSON

cat > index.html <<'HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f7f9fc" />
    <meta name="description" content="Aviation route map with observed GNSS interference indicators." />
    <title>GPS Interference Monitor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
HTML

cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src", "vite.config.ts"]
}
JSON

cat > vite.config.ts <<'TS'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      // The data provider currently restricts browser CORS to its own website.
      // The development proxy lets this Codespace request the public API safely.
      '/api/interference': {
        target: 'https://api.gpsinterference.com',
        changeOrigin: true,
        rewrite: () => '/v1/interference/latest',
        secure: true,
      },
      '/api/airports.csv': {
        target: 'https://raw.githubusercontent.com',
        changeOrigin: true,
        rewrite: () => '/davidmegginson/ourairports-data/main/airports.csv',
        secure: true,
      },
    },
  },
});
TS

mkdir -p src/components src/data src/lib

cat > src/main.tsx <<'TSX'
import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
TSX

cat > src/lib/types.ts <<'TS'
export interface Airport {
  iata_code: string;
  name: string;
  latitude_deg: number;
  longitude_deg: number;
  type: string;
  scheduled_service: string;
  iso_country: string;
}

export interface InterferenceHex {
  h: string;
  g: number; // unaffected aircraft
  b: number; // affected aircraft
  p: number; // affected share, percent
  c: string; // provider colour class
  poly: [number, number][]; // [latitude, longitude]
}

export interface InterferenceResponse {
  history_date?: string;
  updated?: string;
  attribution?: string;
  hexes: InterferenceHex[];
}
TS

cat > src/lib/airports.ts <<'TS'
import Papa from 'papaparse';
import type { Airport } from './types';

let airportCache: Airport[] | null = null;
let airportRequest: Promise<Airport[]> | null = null;

export async function getAirports(): Promise<Airport[]> {
  if (airportCache) return airportCache;
  if (airportRequest) return airportRequest;

  airportRequest = (async () => {
    const response = await fetch('/api/airports.csv');
    if (!response.ok) throw new Error(`Airport directory request failed (${response.status})`);
    const csv = await response.text();
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    const loadedAirports: Airport[] = parsed.data
      .filter((row) =>
        Boolean(row.iata_code?.trim()) &&
        ['large_airport', 'medium_airport', 'small_airport'].includes(row.type) &&
        row.scheduled_service === 'yes' &&
        Number.isFinite(Number(row.latitude_deg)) &&
        Number.isFinite(Number(row.longitude_deg)),
      )
      .map((row) => ({
        iata_code: row.iata_code.trim().toUpperCase(),
        name: row.name,
        latitude_deg: Number(row.latitude_deg),
        longitude_deg: Number(row.longitude_deg),
        type: row.type,
        scheduled_service: row.scheduled_service,
        iso_country: row.iso_country,
      }));

    if (!loadedAirports.length) throw new Error('The airport directory returned no usable airports.');
    airportCache = loadedAirports;
    return loadedAirports;
  })();

  try {
    return await airportRequest;
  } finally {
    airportRequest = null;
  }
}

export async function findAirport(code: string): Promise<Airport | undefined> {
  const airports = await getAirports();
  const normalized = code.trim().toUpperCase();
  return airports.find((airport) => airport.iata_code === normalized);
}
TS

cat > src/lib/route.ts <<'TS'
import type { Airport } from './types';

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

// Interpolate points along the great-circle arc between two airports.
export function greatCircleRoute(from: Airport, to: Airport): [number, number][] {
  const lat1 = toRadians(from.latitude_deg);
  const lon1 = toRadians(from.longitude_deg);
  const lat2 = toRadians(to.latitude_deg);
  const lon2 = toRadians(to.longitude_deg);

  const vector = (lat: number, lon: number) => [
    Math.cos(lat) * Math.cos(lon),
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
  ];
  const a = vector(lat1, lon1);
  const b = vector(lat2, lon2);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  const distanceKm = omega * 6371;
  const steps = Math.max(30, Math.min(180, Math.ceil(distanceKm / 45)));

  if (omega < 1e-8) return [[from.latitude_deg, from.longitude_deg], [to.latitude_deg, to.longitude_deg]];

  const points: [number, number][] = [];
  for (let index = 0; index <= steps; index += 1) {
    const fraction = index / steps;
    const scaleA = Math.sin((1 - fraction) * omega) / Math.sin(omega);
    const scaleB = Math.sin(fraction * omega) / Math.sin(omega);
    const x = scaleA * a[0] + scaleB * b[0];
    const y = scaleA * a[1] + scaleB * b[1];
    const z = scaleA * a[2] + scaleB * b[2];
    points.push([toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))), toDegrees(Math.atan2(y, x))]);
  }
  return points;
}
TS

cat > src/components/InterferenceLayer.tsx <<'TSX'
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { InterferenceHex } from '../lib/types';

interface Props {
  hexes: InterferenceHex[];
}

const colours: Record<string, string> = {
  g: '#22a447',
  y: '#f2c230',
  r: '#ed493f',
  p: '#9638c8',
  purple: '#9638c8',
};

function labelForClass(value: string): string {
  if (value === 'g') return 'Low indicator';
  if (value === 'y') return 'Moderate indicator';
  if (value === 'r') return 'High indicator';
  return 'Very high indicator';
}

export default function InterferenceLayer({ hexes }: Props) {
  const map = useMap();

  useEffect(() => {
    if (!hexes.length) return;

    const features: GeoJSON.Feature<GeoJSON.Polygon, InterferenceHex>[] = hexes
      .filter((hex) => Array.isArray(hex.poly) && hex.poly.length >= 4)
      .map((hex) => ({
        type: 'Feature',
        properties: hex,
        geometry: {
          type: 'Polygon',
          coordinates: [[...hex.poly.map(([lat, lon]) => [lon, lat]), [hex.poly[0][1], hex.poly[0][0]]]],
        },
      }));

    const layer = L.geoJSON({ type: 'FeatureCollection', features }, {
      renderer: L.canvas({ padding: 0.5 }),
      style: (feature) => {
        const properties = feature?.properties as InterferenceHex | undefined;
        const colour = colours[properties?.c ?? ''] ?? '#ed493f';
        return {
          color: colour,
          weight: 1.25,
          opacity: 1,
          fillColor: colour,
          fillOpacity: 0.62,
          interactive: true,
        };
      },
      onEachFeature: (feature, polygon) => {
        const item = feature.properties as InterferenceHex;
        const colour = colours[item.c] ?? '#ed493f';
        const popup = `
          <div class="hex-popup">
            <strong style="color:${colour}">${labelForClass(item.c)}</strong>
            <div class="hex-popup-row"><span>Affected aircraft</span><b>${item.b.toLocaleString()}</b></div>
            <div class="hex-popup-row"><span>Unaffected aircraft</span><b>${item.g.toLocaleString()}</b></div>
            <div class="hex-popup-row"><span>Affected share</span><b>${Number(item.p).toFixed(1)}%</b></div>
            <small>Cell: ${item.h}</small>
          </div>`;
        polygon.bindPopup(popup, { maxWidth: 240 });
      },
    });

    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [hexes, map]);

  return null;
}
TSX

cat > src/components/MapView.tsx <<'TSX'
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { Airport } from '../lib/types';
import type { InterferenceHex } from '../lib/types';
import InterferenceLayer from './InterferenceLayer';

interface Props {
  hexes: InterferenceHex[];
  route: [number, number][] | null;
  origin: Airport | null;
  destination: Airport | null;
}

function FitRoute({ route }: { route: [number, number][] | null }) {
  const map = useMap();
  useEffect(() => {
    if (route?.length) {
      map.fitBounds(route, { padding: [38, 38], maxZoom: 6, animate: true });
    }
  }, [map, route]);
  return null;
}

export default function MapView({ hexes, route, origin, destination }: Props) {
  return (
    <MapContainer center={[22, 10]} zoom={2} minZoom={2} maxZoom={10} worldCopyJump preferCanvas>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <InterferenceLayer hexes={hexes} />
      {route && <Polyline positions={route} pathOptions={{ color: '#1769e0', weight: 4, opacity: 0.95 }} />}
      {origin && (
        <CircleMarker center={[origin.latitude_deg, origin.longitude_deg]} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#1769e0', fillOpacity: 1 }}>
          <Tooltip permanent direction="top">{origin.iata_code}</Tooltip>
        </CircleMarker>
      )}
      {destination && (
        <CircleMarker center={[destination.latitude_deg, destination.longitude_deg]} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#0f9d68', fillOpacity: 1 }}>
          <Tooltip permanent direction="top">{destination.iata_code}</Tooltip>
        </CircleMarker>
      )}
      <FitRoute route={route} />
    </MapContainer>
  );
}
TSX

cat > src/App.tsx <<'TSX'
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Crosshair, LoaderCircle, Plane, RadioTower, RefreshCw, Route as RouteIcon, Satellite } from 'lucide-react';
import MapView from './components/MapView';
import { findAirport } from './lib/airports';
import { greatCircleRoute } from './lib/route';
import type { Airport, InterferenceHex, InterferenceResponse } from './lib/types';

export default function App() {
  const [fromCode, setFromCode] = useState('DEL');
  const [toCode, setToCode] = useState('BOM');
  const [origin, setOrigin] = useState<Airport | null>(null);
  const [destination, setDestination] = useState<Airport | null>(null);
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const [hexes, setHexes] = useState<InterferenceHex[]>([]);
  const [historyDate, setHistoryDate] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [dataError, setDataError] = useState('');
  const [routeError, setRouteError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/interference')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Interference feed returned ${response.status}`);
        return response.json() as Promise<InterferenceResponse>;
      })
      .then((data) => {
        if (!active) return;
        setHexes(Array.isArray(data.hexes) ? data.hexes : []);
        setHistoryDate(data.history_date ?? '');
        setUpdatedAt(data.updated ?? '');
        if (!Array.isArray(data.hexes)) setDataError('The data provider returned an unexpected format.');
      })
      .catch((error: unknown) => {
        if (active) setDataError(error instanceof Error ? error.message : 'Could not load interference data.');
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });
    return () => { active = false; };
  }, []);

  const affectedHexes = useMemo(() => hexes.filter((hex) => hex.c !== 'g').length, [hexes]);

  async function plotRoute() {
    setRouteError('');
    setLoadingRoute(true);
    try {
      const from = await findAirport(fromCode);
      const to = await findAirport(toCode);
      if (!from) throw new Error(`Airport code “${fromCode.toUpperCase()}” was not found. Use a valid IATA code.`);
      if (!to) throw new Error(`Airport code “${toCode.toUpperCase()}” was not found. Use a valid IATA code.`);
      if (from.iata_code === to.iata_code) throw new Error('Choose two different airports.');
      setOrigin(from);
      setDestination(to);
      setRoute(greatCircleRoute(from, to));
      setFromCode(from.iata_code);
      setToCode(to.iata_code);
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : 'Unable to plot this route.');
      setRoute(null);
      setOrigin(null);
      setDestination(null);
    } finally {
      setLoadingRoute(false);
    }
  }

  function resetMap() {
    setRoute(null);
    setOrigin(null);
    setDestination(null);
    setRouteError('');
    setFromCode('DEL');
    setToCode('BOM');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><Satellite size={21} /></div>
        <div className="brand-copy">
          <h1>GPS Interference Monitor</h1>
          <p>AVIATION ROUTE &amp; GNSS INTERFERENCE MAP</p>
        </div>
        <div className="topbar-status"><span className="status-dot" /> Worldwide view</div>
      </header>

      <div className="workspace">
        <aside className="control-panel">
          <div className="panel-heading">
            <div className="panel-icon"><RouteIcon size={17} /></div>
            <div><h2>Route filter</h2><p>Enter two airport codes</p></div>
          </div>

          <form className="route-form" onSubmit={(event) => { event.preventDefault(); void plotRoute(); }}>
            <label htmlFor="from-airport">FROM</label>
            <input id="from-airport" value={fromCode} onChange={(event) => setFromCode(event.target.value.toUpperCase().slice(0, 3))} placeholder="e.g. DEL" maxLength={3} autoComplete="off" />
            <div className="route-connector"><span /><ArrowRight size={14} /><span /></div>
            <label htmlFor="to-airport">TO</label>
            <input id="to-airport" value={toCode} onChange={(event) => setToCode(event.target.value.toUpperCase().slice(0, 3))} placeholder="e.g. BOM" maxLength={3} autoComplete="off" />
            <button className="plot-button" type="submit" disabled={loadingRoute || !fromCode.trim() || !toCode.trim()}>
              {loadingRoute ? <LoaderCircle className="spin" size={16} /> : <Plane size={16} />}
              {loadingRoute ? 'Plotting…' : 'Show route'}
            </button>
          </form>

          {routeError && <div className="inline-error"><AlertCircle size={15} />{routeError}</div>}

          <div className="panel-divider" />
          <section className="legend-section">
            <div className="section-title"><RadioTower size={15} /><h3>Interference indicators</h3></div>
            <div className="legend-item"><span className="legend-swatch low" /><span>Low</span></div>
            <div className="legend-item"><span className="legend-swatch moderate" /><span>Moderate</span></div>
            <div className="legend-item"><span className="legend-swatch high" /><span>High</span></div>
            <div className="legend-item"><span className="legend-swatch very-high" /><span>Very high</span></div>
          </section>

          <div className="panel-divider" />
          <section className="feed-section">
            <div className="section-title"><Crosshair size={15} /><h3>Data feed</h3></div>
            {loadingData ? (
              <p className="feed-message"><LoaderCircle className="spin" size={14} /> Loading global data…</p>
            ) : dataError ? (
              <p className="feed-error"><AlertCircle size={14} /> Feed unavailable</p>
            ) : (
              <>
                <div className="feed-stat"><strong>{hexes.length.toLocaleString()}</strong><span>hexagons loaded</span></div>
                <div className="feed-stat"><strong>{affectedHexes.toLocaleString()}</strong><span>coloured indicators</span></div>
                {historyDate && <p className="feed-date">Flight data: {historyDate}</p>}
                {updatedAt && <p className="feed-date">Updated: {new Date(updatedAt).toLocaleString()}</p>}
              </>
            )}
            {dataError && <p className="feed-error-detail">{dataError}</p>}
          </section>

          <button className="reset-button" type="button" onClick={resetMap}><RefreshCw size={14} /> Reset map</button>
          <div className="panel-note">Route is a great-circle estimate, not a filed flight plan.</div>
        </aside>

        <section className="map-panel" aria-label="World map showing aviation route and GNSS interference indicators">
          <MapView hexes={hexes} route={route} origin={origin} destination={destination} />
          {route && origin && destination && (
            <div className="route-chip"><Plane size={14} /><strong>{origin.iata_code}</strong><ArrowRight size={13} /><strong>{destination.iata_code}</strong><span>{origin.name} to {destination.name}</span></div>
          )}
          {loadingData && <div className="map-loading"><LoaderCircle className="spin" size={17} /> Loading interference hexagons…</div>}
          {dataError && <div className="map-warning"><AlertCircle size={16} /> Interference overlay unavailable. The basemap and route search can still be used.</div>}
          <div className="map-attribution">Interference data: <a href="https://gpsinterference.com/" target="_blank" rel="noreferrer">GPSInterference.com</a></div>
        </section>
      </div>

      <footer className="app-footer">
        <span>For situational awareness and research only — not for flight navigation or operational decisions.</span>
        <span>Low reported navigation accuracy indicates possible interference; it does not confirm jamming or spoofing.</span>
      </footer>
    </main>
  );
}
TSX

cat > src/styles.css <<'CSS'
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #1c2736;
  background: #f5f7fa;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-optical-sizing: auto;
}

* { box-sizing: border-box; }
html, body, #root { width: 100%; height: 100%; margin: 0; }
body { min-width: 320px; overflow: hidden; }
button, input { font: inherit; }

.app-shell { display: flex; flex-direction: column; height: 100dvh; min-height: 0; background: #f5f7fa; }
.topbar { height: 66px; flex: 0 0 66px; display: flex; align-items: center; gap: 11px; padding: 0 20px; background: #fff; border-bottom: 1px solid #e5eaf0; z-index: 500; }
.brand-mark { display: grid; place-items: center; width: 37px; height: 37px; border-radius: 10px; color: #1769e0; background: #eaf2ff; }
.brand-copy h1 { margin: 0; font-size: 15px; font-weight: 720; letter-spacing: -.2px; }
.brand-copy p { margin: 3px 0 0; color: #7b8796; font-size: 9px; font-weight: 700; letter-spacing: 1.05px; }
.topbar-status { margin-left: auto; display: flex; align-items: center; gap: 7px; color: #657386; font-size: 11px; font-weight: 600; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: #16a36a; box-shadow: 0 0 0 3px #e5f6ee; }

.workspace { display: flex; flex: 1; min-height: 0; gap: 12px; padding: 12px; }
.control-panel { width: 236px; min-width: 220px; flex: 0 0 236px; display: flex; flex-direction: column; padding: 15px 14px 12px; overflow-y: auto; background: #fff; border: 1px solid #e4e9ef; border-radius: 12px; box-shadow: 0 2px 8px #172b4d08; z-index: 400; }
.panel-heading { display: flex; align-items: center; gap: 9px; margin-bottom: 17px; }
.panel-icon { width: 32px; height: 32px; display: grid; place-items: center; color: #1769e0; background: #edf4ff; border-radius: 9px; }
.panel-heading h2 { margin: 0; font-size: 13px; font-weight: 720; }
.panel-heading p { margin: 3px 0 0; color: #8792a1; font-size: 10px; }
.route-form { display: flex; flex-direction: column; }
.route-form label { margin: 0 0 5px; color: #7a8797; font-size: 9px; font-weight: 750; letter-spacing: .9px; }
.route-form input { width: 100%; height: 39px; padding: 0 11px; border: 1px solid #dce3eb; border-radius: 7px; outline: none; background: #fbfcfe; color: #17283e; font-size: 14px; font-weight: 750; letter-spacing: 1.4px; text-transform: uppercase; }
.route-form input:focus { border-color: #5b96ee; box-shadow: 0 0 0 3px #1769e018; background: #fff; }
.route-connector { height: 20px; display: flex; align-items: center; gap: 7px; padding-left: 12px; color: #9ba8b8; }
.route-connector span { width: 1px; height: 8px; background: #d7dee7; }
.plot-button { height: 38px; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 13px; border: 0; border-radius: 7px; color: #fff; background: #1769e0; font-size: 11px; font-weight: 700; cursor: pointer; transition: background .15s ease; }
.plot-button:hover:not(:disabled) { background: #0f57c5; }
.plot-button:disabled { opacity: .65; cursor: wait; }
.inline-error { display: flex; align-items: flex-start; gap: 6px; margin-top: 10px; color: #b42318; font-size: 10px; line-height: 1.4; }
.panel-divider { height: 1px; margin: 16px 0 13px; background: #edf0f4; }
.section-title { display: flex; align-items: center; gap: 7px; margin-bottom: 11px; color: #65758a; }
.section-title h3 { margin: 0; color: #334155; font-size: 10px; font-weight: 750; }
.legend-item { display: flex; align-items: center; gap: 9px; margin: 9px 0; color: #596779; font-size: 10px; }
.legend-swatch { width: 14px; height: 12px; display: inline-block; border: 1px solid #26344555; border-radius: 2px; }
.legend-swatch.low { background: #22a447; }
.legend-swatch.moderate { background: #f2c230; }
.legend-swatch.high { background: #ed493f; }
.legend-swatch.very-high { background: #9638c8; }
.feed-section { min-height: 100px; }
.feed-stat { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; margin: 8px 0; }
.feed-stat strong { color: #26374c; font-size: 14px; font-variant-numeric: tabular-nums; }
.feed-stat span { color: #8591a0; font-size: 9px; }
.feed-date { margin: 7px 0 0; color: #8591a0; font-size: 9px; line-height: 1.4; }
.feed-message, .feed-error { display: flex; align-items: center; gap: 7px; margin: 8px 0; color: #748195; font-size: 10px; }
.feed-error { color: #b42318; }
.feed-error-detail { color: #9b4b45; font-size: 9px; line-height: 1.4; overflow-wrap: anywhere; }
.reset-button { display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; height: 32px; margin-top: auto; border: 1px solid #dfe5ed; border-radius: 7px; color: #566579; background: #fff; font-size: 10px; font-weight: 650; cursor: pointer; }
.reset-button:hover { background: #f7f9fc; }
.panel-note { margin-top: 10px; color: #9aa4b1; font-size: 9px; line-height: 1.4; }

.map-panel { position: relative; flex: 1; min-width: 0; min-height: 0; overflow: hidden; border: 1px solid #dfe6ed; border-radius: 12px; background: #eaf0f3; }
.leaflet-container { width: 100%; height: 100%; background: #eaf0f3; font-family: inherit; }
.leaflet-tooltip { border: 0; border-radius: 4px; box-shadow: 0 1px 5px #1d2e441f; color: #1e293b; font-size: 10px; font-weight: 750; }
.leaflet-tooltip:before { display: none; }
.hex-popup { min-width: 160px; font-family: inherit; font-size: 12px; }
.hex-popup strong { display: block; margin-bottom: 8px; font-size: 12px; }
.hex-popup-row { display: flex; justify-content: space-between; gap: 15px; margin: 5px 0; color: #64748b; }
.hex-popup-row b { color: #1e293b; }
.hex-popup small { display: block; margin-top: 8px; color: #94a3b8; }
.route-chip { position: absolute; top: 13px; left: 50%; z-index: 450; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; max-width: calc(100% - 30px); padding: 9px 12px; border: 1px solid #e1e7ef; border-radius: 8px; color: #41536a; background: #fff; box-shadow: 0 2px 10px #172b4d18; font-size: 11px; white-space: nowrap; }
.route-chip svg:first-child { color: #1769e0; }
.route-chip span { margin-left: 5px; overflow: hidden; color: #8792a1; text-overflow: ellipsis; }
.map-loading, .map-warning { position: absolute; left: 14px; bottom: 37px; z-index: 450; display: flex; align-items: center; gap: 8px; max-width: min(420px, calc(100% - 28px)); padding: 9px 11px; border: 1px solid #e1e7ef; border-radius: 7px; color: #526176; background: #fff; box-shadow: 0 2px 10px #172b4d14; font-size: 10px; }
.map-warning { color: #9b4b45; }
.map-attribution { position: absolute; right: 8px; bottom: 5px; z-index: 450; padding: 3px 6px; border-radius: 4px; color: #6b7788; background: #ffffffdf; font-size: 9px; }
.map-attribution a { color: #1769e0; text-decoration: none; }
.app-footer { min-height: 27px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 17px 7px; color: #8792a1; font-size: 9px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 720px) {
  body { overflow: auto; }
  .app-shell { min-height: 100dvh; height: auto; }
  .topbar { height: 60px; flex-basis: 60px; padding: 0 12px; }
  .topbar-status { font-size: 9px; }
  .workspace { flex-direction: column; min-height: 0; padding: 8px; gap: 8px; }
  .control-panel { width: 100%; min-width: 0; flex: 0 0 auto; padding: 12px; }
  .panel-heading { margin-bottom: 10px; }
  .route-form { display: grid; grid-template-columns: 1fr 1fr; column-gap: 9px; align-items: end; }
  .route-form label { margin-top: 0; }
  .route-form input { grid-row: auto; }
  .route-connector { display: none; }
  .plot-button { grid-column: 1 / -1; margin-top: 9px; }
  .panel-divider { margin: 11px 0; }
  .legend-section { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; }
  .legend-section .section-title { grid-column: 1 / -1; margin-bottom: 4px; }
  .legend-item { margin: 2px 0; }
  .feed-section, .panel-note { display: none; }
  .reset-button { margin-top: 9px; }
  .map-panel { flex: none; height: 58vh; min-height: 380px; }
  .app-footer { flex-direction: column; align-items: flex-start; padding: 0 12px 10px; line-height: 1.4; }
  .route-chip { left: 10px; transform: none; font-size: 10px; }
  .route-chip span { display: none; }
}
CSS

npm install

echo ""
echo "Project files created and dependencies installed. Start the app with: npm run dev"
