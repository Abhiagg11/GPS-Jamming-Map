import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crosshair,
  Download,
  Flame,
  Layers,
  LoaderCircle,
  Moon,
  Plane,
  RadioTower,
  RefreshCw,
  Route as RouteIcon,
  Satellite,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  X,
} from 'lucide-react';

import MapView, { type BasemapStyle } from './components/MapView';
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
const BASEMAP_OPTIONS: { id: BasemapStyle; label: string }[] = [
  { id: 'street', label: 'Street' },
  { id: 'topo', label: 'Topo' },
  { id: 'satellite', label: 'Satellite' },
];

const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function snapshotKey(data: InterferenceResponse): string {
  return `${data.history_date ?? ''}|${data.updated ?? ''}|${data.hexes?.length ?? 0}`;
}

function severityLabel(sev: ActiveSeverity | null): string {
  if (sev === 'p') return 'Very high';
  if (sev === 'r') return 'High';
  if (sev === 'y') return 'Moderate';
  return 'Clear';
}

function readInitialParams() {
  const params = new URLSearchParams(window.location.search);
  const from = (params.get('from') || 'DEL').trim().toUpperCase().slice(0, 24);
  const via = (params.get('via') || '').trim().toUpperCase().slice(0, 24);
  const to = (params.get('to') || 'BOM').trim().toUpperCase().slice(0, 24);
  const rawCorridor = Number(params.get('corridor'));
  const corridor = CORRIDOR_OPTIONS.includes(rawCorridor) ? rawCorridor : 150;
  const rawMap = params.get('map');
  const basemap: BasemapStyle =
    rawMap === 'topo' || rawMap === 'satellite' || rawMap === 'street'
      ? rawMap
      : 'street';
  const themeParam = params.get('theme');
  const dark =
    themeParam === 'dark'
      ? true
      : themeParam === 'light'
        ? false
        : localStorage.getItem('gps-monitor-theme') === 'dark';

  return { from, via, to, corridor, basemap, dark };
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
  const fromInputRef = useRef<HTMLInputElement | null>(null);

  const [darkMode, setDarkMode] = useState(initial.dark);
  const [basemap, setBasemap] = useState<BasemapStyle>(initial.basemap);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(true);

  const [summaryOpen, setSummaryOpen] = useState(true);
  const [legendOpen, setLegendOpen] = useState(true);
  const [feedOpen, setFeedOpen] = useState(true);

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
  const [copiedLink, setCopiedLink] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [hexes, setHexes] = useState<InterferenceHex[]>([]);
  const [historyDate, setHistoryDate] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [checkingFeed, setCheckingFeed] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [dataError, setDataError] = useState('');
  const [routeError, setRouteError] = useState('');

  const [snapshotSignature, setSnapshotSignature] = useState('');
  const [pendingSnapshot, setPendingSnapshot] =
    useState<InterferenceResponse | null>(null);

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

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const id = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(id);
  }, [toastMessage]);

  useEffect(() => {
    localStorage.setItem('gps-monitor-theme', darkMode ? 'dark' : 'light');
    const url = new URL(window.location.href);
    url.searchParams.set('theme', darkMode ? 'dark' : 'light');
    url.searchParams.set('map', basemap);
    window.history.replaceState({}, '', url.toString());
  }, [darkMode, basemap]);

  const applySnapshot = useCallback((data: InterferenceResponse) => {
    const validHexes = Array.isArray(data.hexes) ? data.hexes : [];
    setHexes(validHexes);
    setHistoryDate(data.history_date ?? '');
    setUpdatedAt(data.updated ?? '');
    setSnapshotSignature(snapshotKey(data));
    setPendingSnapshot(null);
    if (!Array.isArray(data.hexes)) {
      setDataError('The data provider returned an unexpected format.');
    } else {
      setDataError('');
    }
  }, []);

  const checkForUpdates = useCallback(
    async (manual = false) => {
      if (manual) setCheckingFeed(true);
      try {
        const data = await fetchInterferenceFeed();
        const nextSig = snapshotKey(data);

        if (!snapshotSignature) {
          applySnapshot(data);
        } else if (nextSig && nextSig !== snapshotSignature) {
          if (manual) {
            applySnapshot(data);
            showToast('Updated to latest interference snapshot');
          } else {
            setPendingSnapshot(data);
          }
        } else if (manual) {
          showToast('Already on latest snapshot');
        }
      } catch (error: unknown) {
        if (manual) {
          showToast(
            error instanceof Error ? error.message : 'Unable to check feed'
          );
        }
      } finally {
        if (manual) setCheckingFeed(false);
      }
    },
    [applySnapshot, showToast, snapshotSignature]
  );

  useEffect(() => {
    let active = true;

    fetchInterferenceFeed()
      .then((data) => {
        if (!active) return;
        applySnapshot(data);
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
  }, [applySnapshot]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkForUpdates(false);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [checkForUpdates]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isTyping || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '/') {
        e.preventDefault();
        setMobilePanelOpen(true);
        fromInputRef.current?.focus();
      } else if (e.key.toLowerCase() === 'd') {
        setDarkMode((prev) => !prev);
      } else if (e.key.toLowerCase() === 'r') {
        resetMap();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

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
    url.searchParams.set('map', basemap);
    window.history.replaceState({}, '', url.toString());
  }

  async function copyShareLink() {
    syncRouteUrl(fromCode, viaCode, toCode, corridorKm);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      showToast('Share link copied to clipboard');
      window.setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      showToast('Could not copy link automatically');
    }
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
      setSummaryOpen(true);
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
    showToast('Active route cleared');
  }

  function resetMap() {
    setRoute(null);
    setStops([]);
    setSelectedCellId(null);
    setRouteError('');
    setFocusTarget(null);
    setFromCode('DEL');
    setViaCode('');
    setToCode('BOM');
    setCorridorKm(150);
    setBasemap('street');
    setVisibleSeverities({ y: true, r: true, p: true });
    setResetNonce((n) => n + 1);
    syncRouteUrl('DEL', '', 'BOM', 150);
    showToast('Map reset to worldwide view');
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
      showToast('Exported route summary (JSON)');
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
    showToast('Exported top hotspots (CSV)');
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
  const modPct = totalNearby
    ? ((routeAnalysis!.moderateCount / totalNearby) * 100).toFixed(0)
    : '0';
  const highPct = totalNearby
    ? ((routeAnalysis!.highCount / totalNearby) * 100).toFixed(0)
    : '0';
  const vhPct = totalNearby
    ? ((routeAnalysis!.veryHighCount / totalNearby) * 100).toFixed(0)
    : '0';

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
            <span>{mobilePanelOpen ? 'Hide' : 'Controls'}</span>
            {mobilePanelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <button
            className="theme-toggle"
            type="button"
            onClick={() => setDarkMode((current) => !current)}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={darkMode ? 'Switch to light mode (D)' : 'Switch to dark mode (D)'}
          >
            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside
          className={`control-panel ${mobilePanelOpen ? 'is-open' : 'is-collapsed'}`}
        >
          <div className="panel-heading">
            <div className="panel-icon">
              <RouteIcon size={17} />
            </div>
            <div>
              <h2>Route filter</h2>
              <p>Search IATA, airport, or country</p>
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
              ref={fromInputRef}
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

            <label htmlFor="to-airport" className="spaced-label">
              TO
            </label>
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

            <div className="basemap-control">
              <span>
                <Layers size={11} /> Basemap layer
              </span>
              <div className="basemap-pills">
                {BASEMAP_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`basemap-pill ${basemap === opt.id ? 'active' : ''}`}
                    onClick={() => setBasemap(opt.id)}
                  >
                    {opt.label}
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
              <div className="collapsible-header">
                <button
                  type="button"
                  className="section-toggle-btn"
                  onClick={() => setSummaryOpen((o) => !o)}
                  aria-expanded={summaryOpen}
                >
                  <Flame size={14} />
                  <h3>Corridor analysis</h3>
                  {summaryOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                <button
                  type="button"
                  className="copy-link-btn"
                  onClick={() => void copyShareLink()}
                  title="Copy shareable route URL"
                >
                  {copiedLink ? <Check size={11} /> : <Copy size={11} />}
                  <span>{copiedLink ? 'Copied' : 'Share'}</span>
                </button>
              </div>

              {summaryOpen && (
                <>
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

                  {totalNearby > 0 ? (
                    <>
                      <div
                        className="severity-bar"
                        title={`Mod ${modPct}% · High ${highPct}% · Very high ${vhPct}%`}
                      >
                        <span style={{ width: `${modPct}%`, background: '#f2c230' }} />
                        <span style={{ width: `${highPct}%`, background: '#ed493f' }} />
                        <span style={{ width: `${vhPct}%`, background: '#9638c8' }} />
                      </div>

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
                              <span className="hs-meta">
                                {Number(hs.hex.p || 0).toFixed(0)}% · {hs.minDistanceKm}km
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="clear-corridor-note">
                      <ShieldCheck size={14} />
                      <span>
                        No interference cells within {routeAnalysis.corridorKm} km of this path.
                      </span>
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
                </>
              )}
            </section>
          )}

          <div className="panel-divider" />

          <section className="legend-section">
            <button
              type="button"
              className="section-toggle-btn"
              onClick={() => setLegendOpen((o) => !o)}
              aria-expanded={legendOpen}
            >
              <RadioTower size={15} />
              <h3>Severity layers</h3>
              {legendOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {legendOpen && (
              <div className="legend-items">
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
              </div>
            )}
          </section>

          <div className="panel-divider" />

          <section className="feed-section">
            <div className="collapsible-header">
              <button
                type="button"
                className="section-toggle-btn"
                onClick={() => setFeedOpen((o) => !o)}
                aria-expanded={feedOpen}
              >
                <Crosshair size={15} />
                <h3>Data feed</h3>
                {feedOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              <button
                type="button"
                className="copy-link-btn"
                onClick={() => void checkForUpdates(true)}
                disabled={checkingFeed || loadingData}
                title="Check for a newer feed snapshot"
              >
                <RefreshCw size={10} className={checkingFeed ? 'spin' : ''} />
                <span>{checkingFeed ? 'Checking' : 'Check'}</span>
              </button>
            </div>

            {feedOpen && (
              <>
                {loadingData ? (
                  <div className="skeleton-stack" aria-label="Loading feed statistics">
                    <div className="skeleton-line wide" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line short" />
                  </div>
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
              </>
            )}
          </section>

          <button className="reset-button" type="button" onClick={resetMap}>
            <RefreshCw size={14} />
            Reset map
          </button>

          <div className="panel-note">
            Shortcuts: <b>/</b> search · <b>D</b> theme · <b>R</b> reset. Great-circle estimate only.
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
            basemap={basemap}
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
                {routeAnalysis
                  ? ` · ${routeAnalysis.distanceKm.toLocaleString()} km · ${totalNearby} cells`
                  : ''}
              </span>
            </div>
          )}

          {toastMessage && (
            <div className="toast-pill" role="status" aria-live="polite">
              {toastMessage}
            </div>
          )}

          {pendingSnapshot && (
            <div className="snapshot-banner" role="status">
              <span>
                New snapshot ready
                {pendingSnapshot.history_date ? ` (${pendingSnapshot.history_date})` : ''}
              </span>
              <button
                type="button"
                onClick={() => {
                  applySnapshot(pendingSnapshot);
                  showToast('Updated to latest interference snapshot');
                }}
              >
                Apply now
              </button>
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
