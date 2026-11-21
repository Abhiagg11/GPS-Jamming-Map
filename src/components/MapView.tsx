import { useEffect } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import type { ActiveSeverity, Airport, InterferenceHex } from '../lib/types';
import InterferenceLayer from './InterferenceLayer';

interface Props {
  hexes: InterferenceHex[];
  route: [number, number][] | null;
  stops: Airport[];
  darkMode: boolean;
  visibleSeverities: Record<ActiveSeverity, boolean>;
  highlightedCellIds?: Set<string>;
  selectedCellId?: string | null;
  focusTarget: { lat: number; lon: number; zoom?: number; nonce: number } | null;
  resetNonce: number;
}

function MapController({
  route,
  focusTarget,
  resetNonce,
}: {
  route: [number, number][] | null;
  focusTarget: { lat: number; lon: number; zoom?: number; nonce: number } | null;
  resetNonce: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (route?.length) {
      map.fitBounds(route, {
        padding: [42, 42],
        maxZoom: 6,
        animate: true,
      });
    }
  }, [map, route]);

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

export default function MapView({
  hexes,
  route,
  stops,
  darkMode,
  visibleSeverities,
  highlightedCellIds,
  selectedCellId,
  focusTarget,
  resetNonce,
}: Props) {
  return (
    <MapContainer
      center={[22, 10]}
      zoom={2}
      minZoom={2}
      maxZoom={10}
      worldCopyJump
      preferCanvas
    >
      {darkMode ? (
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
        darkMode={darkMode}
      />

      {route && (
        <>
          <Polyline
            positions={route}
            pathOptions={{
              color: darkMode ? '#58a0ff' : '#1769e0',
              weight: 8,
              opacity: 0.22,
            }}
          />
          <Polyline
            positions={route}
            pathOptions={{
              color: darkMode ? '#75b2ff' : '#1769e0',
              weight: 3.5,
              opacity: 0.96,
              dashArray: '8 6',
            }}
          />
        </>
      )}

      {stops.map((stop, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === stops.length - 1;
        const fillColor = isFirst ? '#1769e0' : isLast ? '#0f9d68' : '#d97706';

        return (
          <CircleMarker
            key={`${stop.iata_code}-${idx}`}
            center={[stop.latitude_deg, stop.longitude_deg]}
            radius={isFirst || isLast ? 7 : 6}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor,
              fillOpacity: 1,
            }}
          >
            <Tooltip permanent direction="top">
              {stop.iata_code}
            </Tooltip>
          </CircleMarker>
        );
      })}

      <MapController
        route={route}
        focusTarget={focusTarget}
        resetNonce={resetNonce}
      />
    </MapContainer>
  );
}