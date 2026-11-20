
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Crosshair,
  LoaderCircle,
  Moon,
  Plane,
  RadioTower,
  RefreshCw,
  Route as RouteIcon,
  Satellite,
  Sun,
} from 'lucide-react';

import MapView from './components/MapView';
import { findAirport } from './lib/airports';
import { greatCircleRoute } from './lib/route';
import type {
  Airport,
  InterferenceHex,
  InterferenceResponse,
} from './lib/types';

export default function App() {
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('gps-monitor-theme') === 'dark'
  );

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
    localStorage.setItem(
      'gps-monitor-theme',
      darkMode ? 'dark' : 'light'
    );
  }, [darkMode]);

  useEffect(() => {
    let active = true;

    fetch('/api/interference')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Interference feed returned ${response.status}`);
        }
        return response.json() as Promise<InterferenceResponse>;
      })
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

  const affectedHexes = useMemo(
    () => hexes.filter((hex) => hex.c !== 'g').length,
    [hexes]
  );

  async function plotRoute() {
    setRouteError('');
    setLoadingRoute(true);

    try {
      const from = await findAirport(fromCode);
      const to = await findAirport(toCode);

      if (!from) {
        throw new Error(`Airport code "${fromCode}" was not found.`);
      }

      if (!to) {
        throw new Error(`Airport code "${toCode}" was not found.`);
      }

      if (from.iata_code === to.iata_code) {
        throw new Error('Choose two different airports.');
      }

      setOrigin(from);
      setDestination(to);
      setRoute(greatCircleRoute(from, to));
      setFromCode(from.iata_code);
      setToCode(to.iata_code);
    } catch (error) {
      setRouteError(
        error instanceof Error
          ? error.message
          : 'Unable to plot this route.'
      );
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
            Worldwide view
          </div>

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
        <aside className="control-panel">
          <div className="panel-heading">
            <div className="panel-icon">
              <RouteIcon size={17} />
            </div>
            <div>
              <h2>Route filter</h2>
              <p>Enter two airport codes</p>
            </div>
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
                setFromCode(event.target.value.toUpperCase().slice(0, 3))
              }
              placeholder="e.g. DEL"
              maxLength={3}
              autoComplete="off"
            />

            <div className="route-connector">
              <span />
              <ArrowRight size={14} />
              <span />
            </div>

            <label htmlFor="to-airport">TO</label>
            <input
              id="to-airport"
              value={toCode}
              onChange={(event) =>
                setToCode(event.target.value.toUpperCase().slice(0, 3))
              }
              placeholder="e.g. BOM"
              maxLength={3}
              autoComplete="off"
            />

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

          <div className="panel-divider" />

          <section className="legend-section">
            <div className="section-title">
              <RadioTower size={15} />
              <h3>Interference indicators</h3>
            </div>

            <div className="legend-item">
              <span className="legend-swatch moderate" />
              <span>Moderate</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch high" />
              <span>High</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch very-high" />
              <span>Very high</span>
            </div>
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

            {dataError && (
              <p className="feed-error-detail">{dataError}</p>
            )}
          </section>

          <button
            className="reset-button"
            type="button"
            onClick={resetMap}
          >
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
          />

          {route && origin && destination && (
            <div className="route-chip">
              <Plane size={14} />
              <strong>{origin.iata_code}</strong>
              <ArrowRight size={13} />
              <strong>{destination.iata_code}</strong>
              <span>
                {origin.name} to {destination.name}
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
