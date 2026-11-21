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
  origin: Airport | null;
  destination: Airport | null;
  darkMode: boolean;
  visibleSeverities: Record<ActiveSeverity, boolean>;
  highlightedCellIds?: Set<string>;
  focusTarget: { lat: number; lon: number; nonce: number } | null;
  resetNonce: number;
}

function MapController({
  route,
  focusTarget,
  resetNonce,
}: {
  route: [number, number][] | null;
  focusTarget: { lat: number; lon: number; nonce: number } | null;
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
      map.setView([focusTarget.lat, focusTarget.lon], 6, { animate: true });
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
  origin,
  destination,
  darkMode,
  visibleSeverities,
  highlightedCellIds,
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

      {origin && (
        <CircleMarker
          center={[origin.latitude_deg, origin.longitude_deg]}
          radius={7}
          pathOptions={{
            color: '#ffffff',
            weight: 2,
            fillColor: '#1769e0',
            fillOpacity: 1,
          }}
        >
          <Tooltip permanent direction="top">
            {origin.iata_code}
          </Tooltip>
        </CircleMarker>
      )}

      {destination && (
        <CircleMarker
          center={[destination.latitude_deg, destination.longitude_deg]}
          radius={7}
          pathOptions={{
            color: '#ffffff',
            weight: 2,
            fillColor: '#0f9d68',
            fillOpacity: 1,
          }}
        >
          <Tooltip permanent direction="top">
            {destination.iata_code}
          </Tooltip>
        </CircleMarker>
      )}

      <MapController
        route={route}
        focusTarget={focusTarget}
        resetNonce={resetNonce}
      />
    </MapContainer>
  );
}