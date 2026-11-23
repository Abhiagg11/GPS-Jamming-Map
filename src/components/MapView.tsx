import { useEffect, useMemo } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import { Globe, LocateFixed, Minus, Plus } from 'lucide-react';
import {
  corridorPolygon,
  greatCirclePoints,
  haversineKm,
  initialBearingDeg,
} from '../lib/route';
import type { ActiveSeverity, Airport, InterferenceHex } from '../lib/types';
import InterferenceLayer from './InterferenceLayer';

export type BasemapStyle = 'street' | 'topo' | 'satellite';

interface Props {
  hexes: InterferenceHex[];
  route: [number, number][] | null;
  stops: Airport[];
  corridorKm: number;
  darkMode: boolean;
  basemap: BasemapStyle;
  visibleSeverities: Record<ActiveSeverity, boolean>;
  highlightedCellIds?: Set<string>;
  selectedCellId?: string | null;
  focusTarget: { lat: number; lon: number; zoom?: number; nonce: number } | null;
  fitRouteNonce: number;
  resetNonce: number;
  onSelectStopRole: (role: 'from' | 'to', airport: Airport) => void;
  onFitRoute: () => void;
  onResetWorld: () => void;
}

function MapController({
  route,
  focusTarget,
  fitRouteNonce,
  resetNonce,
}: {
  route: [number, number][] | null;
  focusTarget: { lat: number; lon: number; zoom?: number; nonce: number } | null;
  fitRouteNonce: number;
  resetNonce: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (route?.length) {
      map.fitBounds(route, {
        padding: [46, 46],
        maxZoom: 6,
        animate: true,
      });
    }
  }, [map, route]);

  useEffect(() => {
    if (fitRouteNonce > 0 && route?.length) {
      map.fitBounds(route, {
        padding: [46, 46],
        maxZoom: 6,
        animate: true,
      });
    }
  }, [map, fitRouteNonce, route]);

  useEffect(() => {
    if (focusTarget) {
      map.setView([focusTarget.lat, focusTarget.lon], focusTarget.zoom ?? 6, {
        animate: true,
      });
    }
  }, [map, focusTarget]);

  useEffect(() => {
    if (resetNonce > 0) {
      map.setView([22, 10], 2, { animate: true });
    }
  }, [map, resetNonce]);

  return null;
}

function FloatingMapToolbar({
  hasRoute,
  onFitRoute,
  onResetWorld,
}: {
  hasRoute: boolean;
  onFitRoute: () => void;
  onResetWorld: () => void;
}) {
  const map = useMap();

  return (
    <div className="map-floating-controls" aria-label="Map view controls">
      {hasRoute && (
        <button
          type="button"
          className="map-ctrl-btn"
          onClick={onFitRoute}
          title="Fit route in view"
          aria-label="Fit route in view"
        >
          <LocateFixed size={14} />
        </button>
      )}
      <button
        type="button"
        className="map-ctrl-btn"
        onClick={onResetWorld}
        title="Reset to world view"
        aria-label="Reset to world view"
      >
        <Globe size={14} />
      </button>
      <button
        type="button"
        className="map-ctrl-btn"
        onClick={() => map.zoomIn()}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        className="map-ctrl-btn"
        onClick={() => map.zoomOut()}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <Minus size={14} />
      </button>
    </div>
  );
}

export default function MapView({
  hexes,
  route,
  stops,
  corridorKm,
  darkMode,
  basemap,
  visibleSeverities,
  highlightedCellIds,
  selectedCellId,
  focusTarget,
  fitRouteNonce,
  resetNonce,
  onSelectStopRole,
  onFitRoute,
  onResetWorld,
}: Props) {
  const isDarkSurface = darkMode || basemap === 'satellite';
  const hasRoute = Boolean(route && route.length >= 2);

  const bufferBand = useMemo(() => {
    if (!route || route.length < 2) return null;
    return corridorPolygon(route, corridorKm);
  }, [route, corridorKm]);

  const legMidpoints = useMemo(() => {
    if (stops.length < 2) return [];
    const items: {
      key: string;
      center: [number, number];
      label: string;
    }[] = [];

    for (let i = 0; i < stops.length - 1; i += 1) {
      const a: [number, number] = [
        stops[i].latitude_deg,
        stops[i].longitude_deg,
      ];
      const b: [number, number] = [
        stops[i + 1].latitude_deg,
        stops[i + 1].longitude_deg,
      ];
      const pts = greatCirclePoints(a, b, 32);
      const mid = pts[Math.floor(pts.length / 2)] ?? a;
      const km = Math.round(haversineKm(a, b));
      const brg = Math.round(initialBearingDeg(a, b));
      items.push({
        key: `${stops[i].iata_code}-${stops[i + 1].iata_code}-${i}`,
        center: mid,
        label: `L${i + 1} · ${km.toLocaleString()} km · ${brg}°`,
      });
    }

    return items;
  }, [stops]);

  return (
    <MapContainer
      center={[22, 10]}
      zoom={2}
      minZoom={2}
      maxZoom={10}
      zoomControl={false}
      worldCopyJump
      preferCanvas
    >
      {basemap === 'satellite' ? (
        <>
          <TileLayer
            key="esri-imagery"
            attribution="Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={18}
          />
          <TileLayer
            key="esri-imagery-labels"
            attribution=""
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            maxZoom={18}
          />
        </>
      ) : basemap === 'topo' ? (
        <TileLayer
          key={`esri-topo-${darkMode ? 'dark' : 'light'}`}
          attribution="Tiles &copy; Esri, HERE, Garmin, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
          maxZoom={18}
        />
      ) : darkMode ? (
        <>
          <TileLayer
            key="esri-dark-base"
            attribution="Tiles &copy; Esri, HERE, Garmin, OpenStreetMap contributors"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            maxZoom={16}
          />
          <TileLayer
            key="esri-dark-reference"
            attribution=""
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
            maxZoom={16}
          />
        </>
      ) : (
        <TileLayer
          key="esri-light"
          attribution="Tiles &copy; <a href='https://www.esri.com/'>Esri</a> | Sources: Esri, HERE, Garmin, USGS, Intermap, NRCAN, METI, and the GIS User Community"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
          maxZoom={18}
        />
      )}

      <InterferenceLayer
        hexes={hexes}
        visibleSeverities={visibleSeverities}
        highlightedCellIds={highlightedCellIds}
        selectedCellId={selectedCellId}
        hasActiveRoute={hasRoute}
        darkMode={isDarkSurface}
      />

      {bufferBand && bufferBand.length > 2 && (
        <Polygon
          positions={bufferBand}
          pathOptions={{
            color: isDarkSurface ? '#60a5fa' : '#1769e0',
            weight: 1,
            opacity: 0.45,
            fillColor: isDarkSurface ? '#3b82f6' : '#2563eb',
            fillOpacity: 0.08,
            interactive: false,
          }}
        />
      )}

      {route && (
        <>
          <Polyline
            positions={route}
            pathOptions={{
              color: isDarkSurface ? '#60a5fa' : '#1769e0',
              weight: 9,
              opacity: 0.24,
            }}
          />
          <Polyline
            positions={route}
            pathOptions={{
              color: isDarkSurface ? '#93c5fd' : '#1769e0',
              weight: 3.5,
              opacity: 0.98,
              dashArray: '8 6',
            }}
          />
        </>
      )}

      {legMidpoints.map((leg) => (
        <CircleMarker
          key={leg.key}
          center={leg.center}
          radius={3.5}
          pathOptions={{
            color: isDarkSurface ? '#93c5fd' : '#1769e0',
            weight: 1.5,
            fillColor: isDarkSurface ? '#0f172a' : '#ffffff',
            fillOpacity: 0.95,
          }}
        >
          <Tooltip direction="bottom" offset={[0, 6]} opacity={0.95}>
            {leg.label}
          </Tooltip>
        </CircleMarker>
      ))}

      {stops.map((stop, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === stops.length - 1;
        const roleLabel = isFirst ? 'Origin' : isLast ? 'Destination' : 'Waypoint';
        const fillColor = isFirst ? '#1769e0' : isLast ? '#0f9d68' : '#d97706';

        return (
          <CircleMarker
            key={`${stop.iata_code}-${idx}`}
            center={[stop.latitude_deg, stop.longitude_deg]}
            radius={isFirst || isLast ? 7.5 : 6}
            pathOptions={{
              color: '#ffffff',
              weight: 2.2,
              fillColor,
              fillOpacity: 1,
            }}
          >
            <Tooltip permanent direction="top">
              {stop.iata_code}
            </Tooltip>
            <Popup>
              <div className="airport-popup">
                <div className="airport-popup-tag">{roleLabel}</div>
                <strong>
                  {stop.iata_code} · {stop.name}
                </strong>
                <div className="airport-popup-coords">
                  {stop.latitude_deg.toFixed(2)}°, {stop.longitude_deg.toFixed(2)}°
                </div>
                <div className="airport-popup-actions">
                  <button
                    type="button"
                    onClick={() => onSelectStopRole('from', stop)}
                  >
                    Set FROM
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectStopRole('to', stop)}
                  >
                    Set TO
                  </button>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      <FloatingMapToolbar
        hasRoute={hasRoute}
        onFitRoute={onFitRoute}
        onResetWorld={onResetWorld}
      />

      <MapController
        route={route}
        focusTarget={focusTarget}
        fitRouteNonce={fitRouteNonce}
        resetNonce={resetNonce}
      />
    </MapContainer>
  );
}
