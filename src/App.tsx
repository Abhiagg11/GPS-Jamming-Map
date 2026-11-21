import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Download,
  Flame,
  LoaderCircle,
  Moon,
  Plane,
  RadioTower,
  RefreshCw,
  Route as RouteIcon,
  Satellite,
  SlidersHorizontal,
  Sun,
  X,
} from 'lucide-react';

import MapView from './components/MapView';
import { findAirport, searchAirports } from './lib/airports';
import {
  analyzeRouteInterference,
  hexCentroid,
  multiLegRoute,
  normalizeSeverity,
} from './lib/route';
import type {
  ActiveSeverity,
  Airport,
  InterferenceHex,
  InterferenceResponse,
} from './lib/types';

const PRESET_ROUTES: [string, string, string][] = [
  ['DEL', '', 'BOM'],
  ['BLR', '', 'DEL'],
  ['DEL', 'DOH', 'LHR'],
];

const CORRIDOR_OPTIONS = [50, 150, 300];

function severityLabel(sev: ActiveSeverity | null): string {
  if (sev === 'p') return 'Very high';
  if (sev === 'r') return 'High';
  if (sev === 'y') return 'Moderate';
  return 'None in corridor';
}

function readInitialParams() {
  const params = new URLSearchParams(window.location.search);
  const from = (params.get('from') || 'DEL').trim().toUpperCase().slice(0, 24);
  const via = (params.get('via') || '').trim().toUpperCase().slice(0, 24);
  const to = (params.get('to') || 'BOM').trim().toUpperCase().slice(0, 24);
  const rawCorridor = Number(params.get('corridor'));
  const corridor = CORRIDOR_OPTIONS.includes(rawCorridor) ? rawCorridor : 150;
  const themeParam = params.get('theme');
  const dark =
    themeParam === 'dark'
      ? true
      : themeParam === 'light'
        ? false
        : localStorage.getItem('gps-monitor-theme') === 'dark';

  return { from, via, to, corridor, dark };
}

async function fetchInterferenceFeed(): Promise<InterferenceResponse> {
  try {
    const res = await fetch('/api/interference');
    if (res.ok) {
      return (await res.json()) as InterferenceResponse;
    }
  } catch {
    // Fallback when running without Vite proxy
  }

  const fallback = await fetch('https://api.gpsinterference.com/v1/interference/latest');
  if (!fallback.ok) {
    throw new Error(`Interference feed returned ${fallback.status}`);
  }
  return (await fallback.json()) as InterferenceResponse;
}

export default function App() {
  const initial = useMemo(() => readInitialParams(), []);

  const [darkMode, setDarkMode] = useState(initial.dark);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(true);

  const [fromCode, setFromCode] = useState(initial.from);
  const [viaCode, setViaCode] = useState(initial.via);
  const [toCode, setToCode] = useState(initial.to);
  const [corridorKm, setCorridorKm] = useState(initial.corridor);

  const [fromSuggestions, setFromSuggestions] = useState<Airport[]>([]);
  const [viaSuggestions, setViaSuggestions] = useState<Airport[]>([]);
  const [toSuggestions, setToSuggestions] = useState<Airport[]>([]);

  const [stops, setStops] = useState<Airport[]>([]);
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);

  const [hexes, setHexes] = useState<InterferenceHex[]>([]);
  const [historyDate, setHistoryDate] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [dataError, setDataError] = useState('');
  const [routeError, setRouteError] = useState('');

  const [visibleSeverities, setVisibleSeverities] = useState<
    Record<ActiveSeverity, boolean>
  >({
    y: true,
    r: true,
    p: true,
  });

  const [focusTarget, setFocusTarget] = useState<{
    lat: number;
    lon: number;
    zoom?: number;
    nonce: number;
  } | null>(null);
  const [resetNonce, setResetNonce] = useState(0);

  useEffect(() => {
    localStorage.setItem('gps-monitor-theme', darkMode ? 'dark' : 'light');
    const url = new URL(window.location.href);
    url.searchParams.set('theme', darkMode ? 'dark' : 'light');
    window.history.replaceState({}, '', url.toString());
  }, [darkMode]);

  useEffect(() => {
    let active = true;
    fetchInterferenceFeed()
      .then((data) => {
        if (!active) return;
        setHexes(Array.isArray(data.hexes) ? data.hexes : []);
        setHistoryDate(data.history_date ?? '');
        setUpdatedAt(data.updated ?? '');
        if (!Array.isArray(data.hexes)) {
          setDataError('The data provider returned an unexpected format.');
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setDataError(
            error instanceof Error
              ? error.message
              : 'Could not load interference data.'
          );
        }
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!fromCode.trim()) {
      setFromSuggestions([]);
      return;
    }
    searchAirports(fromCode, 5)
      .then((matches) => {
        if (active) setFromSuggestions(matches);
      })
      .catch(() => {
        if (active) setFromSuggestions([]);
      });
    return () => {
      active = false;
    };
  }, [fromCode]);

  useEffect(() => {
    let active = true;
    if (!viaCode.trim()) {
      setViaSuggestions([]);
      return;
    }
    searchAirports(viaCode, 5)
      .then((matches) => {
        if (active) setViaSuggestions(matches);
      })
      .catch(() => {
        if (active) setViaSuggestions([]);
      });
    return () => {
      active = false;
    };
  }, [viaCode]);

  useEffect(() => {
    let active = true;
    if (!toCode.trim()) {
      setToSuggestions([]);
      return;
    }
    searchAirports(toCode, 5)
      .then((matches) => {
        if (active) setToSuggestions(matches);
      })
      .catch(() => {
        if (active) setToSuggestions([]);
      });
    return () => {
      active = false;
    };
  }, [toCode]);

  const affectedHexes = useMemo(
    () => hexes.filter((hex) => normalizeSeverity(hex.c) !== null).length,
    [hexes]
  );

  const routeAnalysis = useMemo(() => {
    if (stops.length < 2 || !route) return null;
    return analyzeRouteInterference(stops, route, hexes, corridorKm);
  }, [stops, route, hexes, corridorKm]);

  const highlightedCellIds = useMemo(() => {
    if (!routeAnalysis) return undefined;
    return new Set(routeAnalysis.nearbyHexes.map((h) => h.h));
  }, [routeAnalysis]);

  function toggleSeverity(sev: ActiveSeverity) {
    setVisibleSeverities((prev) => ({ ...prev, [sev]: !prev[sev] }));
  }

  function swapAirports() {
    setFromCode(toCode);
    setToCode(fromCode);
    setRouteError('');
  }

  function syncRouteUrl(f: string, v: string, t: string, c: number) {
    const url = new URL(window.location.href);
    if (f) url.searchParams.set('from', f);
    else url.searchParams.delete('from');
    if (v) url.searchParams.set('via', v);
    else url.searchParams.delete('via');
    if (t) url.searchParams.set('to', t);
    else url.searchParams.delete('to');
    url.searchParams.set('corridor', String(c));
    window.history.replaceState({}, '', url.toString());
  }

  async function plotRoute(
    customFrom?: string,
    customVia?: string,
    customTo?: string
  ) {
    const startCode = (customFrom ?? fromCode).trim().toUpperCase();
    const midCode = (customVia ?? viaCode).trim().toUpperCase();
    const endCode = (customTo ?? toCode).trim().toUpperCase();

    setFromCode(startCode);
    setViaCode(midCode);
    setToCode(endCode);
    setRouteError('');
    setSelectedCellId(null);
    setLoadingRoute(true);

    try {
      const from = await findAirport(startCode);
      if (!from) {
        throw new Error(`Origin airport "${startCode}" was not found.`);
      }

      let via: Airport | undefined;
      if (midCode) {
        via = await findAirport(midCode);
        if (!via) {
          throw new Error(`Waypoint airport "${midCode}" was not found.`);
        }
      }

      const to = await findAirport(endCode);
      if (!to) {
        throw new Error(`Destination airport "${endCode}" was not found.`);
      }

      const resolvedStops = via ? [from, via, to] : [from, to];
      const uniqueCodes = new Set(resolvedStops.map((s) => s.iata_code));
      if (uniqueCodes.size < resolvedStops.length) {
        throw new Error('Select distinct airports for each stop.');
      }

      setStops(resolvedStops);
      setRoute(multiLegRoute(resolvedStops));
      setFromCode(from.iata_code);
      setViaCode(via ? via.iata_code : '');
      setToCode(to.iata_code);
      setFromSuggestions([]);
      setViaSuggestions([]);
      setToSuggestions([]);
      syncRouteUrl(
        from.iata_code,
        via ? via.iata_code : '',
        to.iata_code,
        corridorKm
      );
    } catch (error) {
      setRouteError(
        error instanceof Error ? error.message : 'Unable to plot this route.'
      );
      setRoute(null);
      setStops([]);
    } finally {
      setLoadingRoute(false);
    }
  }

  function focusHex(hex: InterferenceHex) {
    const center = hexCentroid(hex);
    if (!center) return;
    setSelectedCellId(hex.h);
    setFocusTarget((prev) => ({
      lat: center[0],
      lon: center[1],
      zoom: 6,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  }

  function clearRouteOnly() {
    setRoute(null);
    setStops([]);
    setSelectedCellId(null);
    setRouteError('');
  }

  function resetMap() {
    clearRouteOnly();
    setFocusTarget(null);
    setFromCode('DEL');
    setViaCode('');
    setToCode('BOM');
    setCorridorKm(150);
    setVisibleSeverities({ y: true, r: true, p: true });
    setResetNonce((n) => n + 1);
    syncRouteUrl('DEL', '', 'BOM', 150);
  }

  function exportReport(format: 'json' | 'csv') {
    if (!routeAnalysis) return;
    const stopSummary = routeAnalysis.waypoints.map((w) => w.iata_code).join('->');
    const timestamp = new Date().toISOString();

    if (format === 'json') {
      const payload = {
        exportedAt: timestamp,
        route: stopSummary,
        waypoints: routeAnalysis.waypoints.map((w) => ({
          iata: w.iata_code,
          name: w.name,
          lat: w.latitude_deg,
          lon: w.longitude_deg,
        })),
        distanceKm: routeAnalysis.distanceKm,
        corridorKm: routeAnalysis.corridorKm,
        peakSeverity: severityLabel(routeAnalysis.maxSeverity),
        counts: {
          moderate: routeAnalysis.moderateCount,
          high: routeAnalysis.highCount,
          veryHigh: routeAnalysis.veryHighCount,
          totalNearby: routeAnalysis.nearbyHexes.length,
        },
        hotspots: routeAnalysis.hotspots.map((hs) => ({
          cell: hs.hex.h,
          severity: hs.severity,
          minDistanceKm: hs.minDistanceKm,
          affectedAircraft: hs.hex.b,
          unaffectedAircraft: hs.hex.g,
          affectedSharePct: hs.hex.p,
        })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      triggerDownload(blob, `gnss-route-${stopSummary}.json`);
      return;
    }

    const lines = [
      'cell,severity,min_distance_km,affected_aircraft,unaffected_aircraft,affected_share_pct',
      ...routeAnalysis.hotspots.map((hs) =>
        [
          hs.hex.h,
          hs.severity,
          hs.minDistanceKm,
          hs.hex.b,
          hs.hex.g,
          hs.hex.p,
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `gnss-route-${stopSummary}.csv`);
  }

  function triggerDownload(blob: Blob, filename: string) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  const totalNearby = routeAnalysis?.nearbyHexes.length ?? 0;
  const modPct = totalNearby ? ((routeAnalysis!.moderateCount / totalNearby) * 100).toFixed(0) : '0';
  const highPct = totalNearby ? ((routeAnalysis!.highCount / totalNearby) * 100).toFixed(0) : '0';
  const vhPct = totalNearby ? ((routeAnalysis!.veryHighCount / totalNearby) * 100).toFixed(0) : '0';

  return (
    <main className={`app-shell ${darkMode ? 'dark-theme' : ''}`}>
      <header className="topbar">
        <div className="brand-mark">
          <Satellite size={21} />
        </div>

        <div className="brand-copy">
          <h1>GPS Interference Monitor</h1>
          <p>AVIATION ROUTE &amp; GNSS INTERFERENCE MAP</p>
        </div>

        <div className="topbar-actions">
          <div className="topbar-status">
            <span className="status-dot" />
            {stops.length >= 2
              ? `Route: ${stops.map((s) => s.iata_code).join(' → ')}`
              : 'Worldwide view'}
          </div>

          <button
            className="mobile-drawer-btn"
            type="button"
            onClick={() => setMobilePanelOpen((o) => !o)}
            aria-expanded={mobilePanelOpen}
          >
            <SlidersHorizontal size={15} />
            <span>Controls</span>
            {mobilePanelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <button
            className="theme-toggle"
            type="button"
            onClick={() => setDarkMode((current) => !current)}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className={`control-panel ${mobilePanelOpen ? 'is-open' : 'is-collapsed'}`}>
          <div className="panel-heading">
            <div className="panel-icon">
              <RouteIcon size={17} />
            </div>
            <div>
              <h2>Route filter</h2>
              <p>Direct or multi-leg IATA route</p>
            </div>
          </div>

          <div className="preset-row" aria-label="Quick routes">
            {PRESET_ROUTES.map(([a, v, b]) => (
              <button
                key={`${a}-${v}-${b}`}
                type="button"
                className="preset-chip"
                onClick={() => void plotRoute(a, v, b)}
              >
                {v ? `${a}→${v}→${b}` : `${a} → ${b}`}
              </button>
            ))}
          </div>

          <form
            className="route-form"
            onSubmit={(event) => {
              event.preventDefault();
              void plotRoute();
            }}
          >
            <label htmlFor="from-airport">FROM</label>
            <input
              id="from-airport"
              value={fromCode}
              onChange={(event) =>
                setFromCode(event.target.value.toUpperCase().slice(0, 24))
              }
              onKeyDown={(e) => {
                if (e.key === 'Escape') setFromSuggestions([]);
                if (e.key === 'Enter' && fromSuggestions.length > 0) {
                  e.preventDefault();
                  setFromCode(fromSuggestions[0].iata_code);
                  setFromSuggestions([]);
                }
              }}
              placeholder="e.g. DEL"
              autoComplete="off"
            />
            {fromSuggestions.length > 0 && (
              <div className="suggestion-list" role="listbox">
                {fromSuggestions.map((a) => (
                  <button
                    key={a.iata_code}
                    type="button"
                    className="suggestion-item"
                    onClick={() => {
                      setFromCode(a.iata_code);
                      setFromSuggestions([]);
                    }}
                  >
                    <strong>{a.iata_code}</strong>
                    <span>{a.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="route-connector">
              <span />
              <button
                type="button"
                className="swap-btn"
                onClick={swapAirports}
                title="Swap origin and destination"
                aria-label="Swap origin and destination"
              >
                <ArrowLeftRight size={13} />
              </button>
              <span />
            </div>

            <label htmlFor="via-airport">VIA WAYPOINT (OPTIONAL)</label>
            <div className="input-with-clear">
              <input
                id="via-airport"
                value={viaCode}
                onChange={(event) =>
                  setViaCode(event.target.value.toUpperCase().slice(0, 24))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setViaSuggestions([]);
                  if (e.key === 'Enter' && viaSuggestions.length > 0) {
                    e.preventDefault();
                    setViaCode(viaSuggestions[0].iata_code);
                    setViaSuggestions([]);
                  }
                }}
                placeholder="Optional e.g. DOH"
                autoComplete="off"
              />
              {viaCode && (
                <button
                  type="button"
                  className="mini-clear-btn"
                  onClick={() => {
                    setViaCode('');
                    setViaSuggestions([]);
                  }}
                  aria-label="Clear waypoint"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {viaSuggestions.length > 0 && (
              <div className="suggestion-list" role="listbox">
                {viaSuggestions.map((a) => (
                  <button
                    key={a.iata_code}
                    type="button"
                    className="suggestion-item"
                    onClick={() => {
                      setViaCode(a.iata_code);
                      setViaSuggestions([]);
                    }}
                  >
                    <strong>{a.iata_code}</strong>
                    <span>{a.name}</span>
                  </button>
                ))}
              </div>
            )}

            <label htmlFor="to-airport" className="spaced-label">TO</label>
            <input
              id="to-airport"
              value={toCode}
              onChange={(event) =>
                setToCode(event.target.value.toUpperCase().slice(0, 24))
              }
              onKeyDown={(e) => {
                if (e.key === 'Escape') setToSuggestions([]);
                if (e.key === 'Enter' && toSuggestions.length > 0) {
                  e.preventDefault();
                  setToCode(toSuggestions[0].iata_code);
                  setToSuggestions([]);
                }
              }}
              placeholder="e.g. BOM"
              autoComplete="off"
            />
            {toSuggestions.length > 0 && (
              <div className="suggestion-list" role="listbox">
                {toSuggestions.map((a) => (
                  <button
                    key={a.iata_code}
                    type="button"
                    className="suggestion-item"
                    onClick={() => {
                      setToCode(a.iata_code);
                      setToSuggestions([]);
                    }}
                  >
                    <strong>{a.iata_code}</strong>
                    <span>{a.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="corridor-control">
              <span>Corridor buffer</span>
              <div className="corridor-pills">
                {CORRIDOR_OPTIONS.map((km) => (
                  <button
                    key={km}
                    type="button"
                    className={`corridor-pill ${corridorKm === km ? 'active' : ''}`}
                    onClick={() => {
                      setCorridorKm(km);
                      syncRouteUrl(fromCode, viaCode, toCode, km);
                    }}
                  >
                    {km} km
                  </button>
                ))}
              </div>
            </div>

            <div className="route-action-row">
              <button
                className="plot-button"
                type="submit"
                disabled={loadingRoute || !fromCode.trim() || !toCode.trim()}
              >
                {loadingRoute ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Plane size={16} />
                )}
                {loadingRoute ? 'Plotting…' : 'Show route'}
              </button>

              {route && (
                <button
                  type="button"
                  className="clear-route-btn"
                  onClick={clearRouteOnly}
                  title="Remove active route line"
                >
                  Clear
                </button>
              )}
            </div>
          </form>

          {routeError && (
            <div className="inline-error">
              <AlertCircle size={15} />
              {routeError}
            </div>
          )}

          {routeAnalysis && stops.length >= 2 && (
            <section className="route-summary-card">
              <div className="section-title">
                <Flame size={14} />
                <h3>Route corridor summary</h3>
              </div>
              <div className="summary-grid">
                <div>
                  <small>Total distance</small>
                  <b>{routeAnalysis.distanceKm.toLocaleString()} km</b>
                </div>
                <div>
                  <small>Peak level</small>
                  <b>{severityLabel(routeAnalysis.maxSeverity)}</b>
                </div>
                <div>
                  <small>Near cells</small>
                  <b>{routeAnalysis.nearbyHexes.length}</b>
                </div>
                <div>
                  <small>Mod / High / VH</small>
                  <b>
                    {routeAnalysis.moderateCount} / {routeAnalysis.highCount} /{' '}
                    {routeAnalysis.veryHighCount}
                  </b>
                </div>
              </div>

              {totalNearby > 0 && (
                <div className="severity-bar" title={`Mod ${modPct}% · High ${highPct}% · Very high ${vhPct}%`}>
                  <span style={{ width: `${modPct}%`, background: '#f2c230' }} />
                  <span style={{ width: `${highPct}%`, background: '#ed493f' }} />
                  <span style={{ width: `${vhPct}%`, background: '#9638c8' }} />
                </div>
              )}

              {routeAnalysis.hottestHex && (
                <button
                  type="button"
                  className="focus-hot-btn"
                  onClick={() => focusHex(routeAnalysis.hottestHex!)}
                >
                  <Crosshair size={13} />
                  Focus highest cell ({routeAnalysis.hottestHex.h})
                </button>
              )}

              {routeAnalysis.hotspots.length > 0 && (
                <div className="hotspot-list">
                  <div className="hotspot-heading">Top cells near corridor</div>
                  {routeAnalysis.hotspots.map((hs) => (
                    <button
                      key={hs.hex.h}
                      type="button"
                      className={`hotspot-row ${selectedCellId === hs.hex.h ? 'selected' : ''}`}
                      onClick={() => focusHex(hs.hex)}
                    >
                      <span className={`sev-dot sev-${hs.severity}`} />
                      <span className="hs-cell">{hs.hex.h}</span>
                      <span className="hs-meta">{hs.minDistanceKm} km</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="export-row">
                <button
                  type="button"
                  className="export-btn"
                  onClick={() => exportReport('json')}
                >
                  <Download size={12} /> JSON
                </button>
                <button
                  type="button"
                  className="export-btn"
                  onClick={() => exportReport('csv')}
                >
                  <Download size={12} /> CSV
                </button>
              </div>
            </section>
          )}

          <div className="panel-divider" />

          <section className="legend-section">
            <div className="section-title">
              <RadioTower size={15} />
              <h3>Interference indicators (click to toggle)</h3>
            </div>

            {(
              [
                ['y', 'moderate', 'Moderate'],
                ['r', 'high', 'High'],
                ['p', 'very-high', 'Very high'],
              ] as const
            ).map(([code, swatchClass, label]) => {
              const enabled = visibleSeverities[code];
              return (
                <button
                  key={code}
                  type="button"
                  className={`legend-toggle ${enabled ? 'is-on' : 'is-off'}`}
                  onClick={() => toggleSeverity(code)}
                >
                  <span className={`legend-swatch ${swatchClass}`} />
                  <span>{label}</span>
                  <span className="legend-state">{enabled ? 'On' : 'Off'}</span>
                </button>
              );
            })}
          </section>

          <div className="panel-divider" />

          <section className="feed-section">
            <div className="section-title">
              <Crosshair size={15} />
              <h3>Data feed</h3>
            </div>

            {loadingData ? (
              <p className="feed-message">
                <LoaderCircle className="spin" size={14} />
                Loading global data…
              </p>
            ) : dataError ? (
              <p className="feed-error">
                <AlertCircle size={14} />
                Feed unavailable
              </p>
            ) : (
              <>
                <div className="feed-stat">
                  <strong>{hexes.length.toLocaleString()}</strong>
                  <span>hexagons loaded</span>
                </div>

                <div className="feed-stat">
                  <strong>{affectedHexes.toLocaleString()}</strong>
                  <span>affected indicators</span>
                </div>

                {historyDate && (
                  <p className="feed-date">Flight data: {historyDate}</p>
                )}

                {updatedAt && (
                  <p className="feed-date">
                    Updated: {new Date(updatedAt).toLocaleString()}
                  </p>
                )}
              </>
            )}

            {dataError && <p className="feed-error-detail">{dataError}</p>}
          </section>

          <button className="reset-button" type="button" onClick={resetMap}>
            <RefreshCw size={14} />
            Reset map
          </button>

          <div className="panel-note">
            Route is a great-circle estimate, not a filed flight plan.
          </div>
        </aside>

        <section
          className="map-panel"
          aria-label="World map showing aviation route and GNSS interference indicators"
        >
          <MapView
            hexes={hexes}
            route={route}
            stops={stops}
            darkMode={darkMode}
            visibleSeverities={visibleSeverities}
            highlightedCellIds={highlightedCellIds}
            selectedCellId={selectedCellId}
            focusTarget={focusTarget}
            resetNonce={resetNonce}
          />

          {route && stops.length >= 2 && (
            <div className="route-chip">
              <Plane size={14} />
              <strong>{stops.map((s) => s.iata_code).join(' → ')}</strong>
              <span>
                {stops[0].name} to {stops[stops.length - 1].name}
                {routeAnalysis ? ` · ${routeAnalysis.distanceKm.toLocaleString()} km` : ''}
              </span>
            </div>
          )}

          {loadingData && (
            <div className="map-loading">
              <LoaderCircle className="spin" size={17} />
              Loading interference hexagons…
            </div>
          )}

          {dataError && (
            <div className="map-warning">
              <AlertCircle size={16} />
              Interference overlay unavailable. The basemap and route search can still be used.
            </div>
          )}

          <div className="map-attribution">
            Interference data:{' '}
            <a
              href="https://gpsinterference.com/"
              target="_blank"
              rel="noreferrer"
            >
              GPSInterference.com
            </a>
          </div>
        </section>
      </div>

      <footer className="app-footer">
        <span>
          For situational awareness and research only — not for flight navigation or operational decisions.
        </span>
        <span>
          Low reported navigation accuracy indicates possible interference; it does not confirm jamming or spoofing.
        </span>
      </footer>
    </main>
  );
}
