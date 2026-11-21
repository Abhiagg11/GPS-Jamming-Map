import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Crosshair,
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
} from 'lucide-react';

import MapView from './components/MapView';
import { findAirport, searchAirports } from './lib/airports';
import {
  analyzeRouteInterference,
  greatCircleRoute,
  normalizeSeverity,
} from './lib/route';
import type {
  ActiveSeverity,
  Airport,
  InterferenceHex,
  InterferenceResponse,
} from './lib/types';

const PRESET_ROUTES: [string, string][] = [
  ['DEL', 'BOM'],
  ['BLR', 'DEL'],
  ['DEL', 'DXB'],
];

const CORRIDOR_OPTIONS = [50, 150, 300];

function severityLabel(sev: ActiveSeverity | null): string {
  if (sev === 'p') return 'Very high';
  if (sev === 'r') return 'High';
  if (sev === 'y') return 'Moderate';
  return 'None in corridor';
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
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('gps-monitor-theme') === 'dark'
  );
  const [mobilePanelOpen, setMobilePanelOpen] = useState(true);

  const [fromCode, setFromCode] = useState('DEL');
  const [toCode, setToCode] = useState('BOM');
  const [corridorKm, setCorridorKm] = useState(150);

  const [fromSuggestions, setFromSuggestions] = useState<Airport[]>([]);
  const [toSuggestions, setToSuggestions] = useState<Airport[]>([]);

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
    nonce: number;
  } | null>(null);
  const [resetNonce, setResetNonce] = useState(0);

  useEffect(() => {
    localStorage.setItem('gps-monitor-theme', darkMode ? 'dark' : 'light');
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
    if (fromCode.trim().length < 1) {
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
    if (toCode.trim().length < 1) {
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
    if (!origin || !destination || !route) return null;
    return analyzeRouteInterference(
      origin,
      destination,
      route,
      hexes,
      corridorKm
    );
  }, [origin, destination, route, hexes, corridorKm]);

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

  async function plotRoute(customFrom?: string, customTo?: string) {
    const startCode = (customFrom ?? fromCode).trim().toUpperCase();
    const endCode = (customTo ?? toCode).trim().toUpperCase();

    setFromCode(startCode);
    setToCode(endCode);
    setRouteError('');
    setLoadingRoute(true);

    try {
      const from = await findAirport(startCode);
      const to = await findAirport(endCode);

      if (!from) {
        throw new Error(`Airport code "${startCode}" was not found.`);
      }
      if (!to) {
        throw new Error(`Airport code "${endCode}" was not found.`);
      }
      if (from.iata_code === to.iata_code) {
        throw new Error('Choose two different airports.');
      }

      setOrigin(from);
      setDestination(to);
      setRoute(greatCircleRoute(from, to));
      setFromSuggestions([]);
      setToSuggestions([]);
    } catch (error) {
      setRouteError(
        error instanceof Error ? error.message : 'Unable to plot this route.'
      );
      setRoute(null);
      setOrigin(null);
      setDestination(null);
    } finally {
      setLoadingRoute(false);
    }
  }

  function focusHottestHex() {
    const hot = routeAnalysis?.hottestHex;
    if (!hot || !hot.poly?.length) return;
    const lat = hot.poly.reduce((acc, p) => acc + p[0], 0) / hot.poly.length;
    const lon = hot.poly.reduce((acc, p) => acc + p[1], 0) / hot.poly.length;
    setFocusTarget((prev) => ({ lat, lon, nonce: (prev?.nonce ?? 0) + 1 }));
  }

  function resetMap() {
    setRoute(null);
    setOrigin(null);
    setDestination(null);
    setFocusTarget(null);
    setRouteError('');
    setFromCode('DEL');
    setToCode('BOM');
    setVisibleSeverities({ y: true, r: true, p: true });
    setResetNonce((n) => n + 1);
  }

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
            {route && origin && destination
              ? `Route: ${origin.iata_code} → ${destination.iata_code}`
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
              <p>IATA code, airport, or country</p>
            </div>
          </div>

          <div className="preset-row" aria-label="Quick routes">
            {PRESET_ROUTES.map(([a, b]) => (
              <button
                key={`${a}-${b}`}
                type="button"
                className="preset-chip"
                onClick={() => void plotRoute(a, b)}
              >
                {a} → {b}
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

            <label htmlFor="to-airport">TO</label>
            <input
              id="to-airport"
              value={toCode}
              onChange={(event) =>
                setToCode(event.target.value.toUpperCase().slice(0, 24))
              }
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
                    onClick={() => setCorridorKm(km)}
                  >
                    {km} km
                  </button>
                ))}
              </div>
            </div>

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
          </form>

          {routeError && (
            <div className="inline-error">
              <AlertCircle size={15} />
              {routeError}
            </div>
          )}

          {routeAnalysis && origin && destination && (
            <section className="route-summary-card">
              <div className="section-title">
                <Flame size={14} />
                <h3>Route corridor summary</h3>
              </div>
              <div className="summary-grid">
                <div>
                  <small>Distance</small>
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
              {routeAnalysis.hottestHex && (
                <button
                  type="button"
                  className="focus-hot-btn"
                  onClick={focusHottestHex}
                >
                  <Crosshair size={13} />
                  Focus highest cell ({routeAnalysis.hottestHex.h})
                </button>
              )}
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
            origin={origin}
            destination={destination}
            darkMode={darkMode}
            visibleSeverities={visibleSeverities}
            highlightedCellIds={highlightedCellIds}
            focusTarget={focusTarget}
            resetNonce={resetNonce}
          />

          {route && origin && destination && (
            <div className="route-chip">
              <Plane size={14} />
              <strong>{origin.iata_code}</strong>
              <ArrowRight size={13} />
              <strong>{destination.iata_code}</strong>
              <span>
                {origin.name} to {destination.name}
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
