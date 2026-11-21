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

export type BasemapStyle = 'street' | 'topo' | 'satellite';

interface Props {
  hexes: InterferenceHex[];
  route: [number, number][] | null;
  stops: Airport[];
  darkMode: boolean;
  basemap: BasemapStyle;
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
        padding: [44, 44],
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
  basemap,
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
        darkMode={darkMode || basemap === 'satellite'}
      />

      {route && (
        <>
          <Polyline
            positions={route}
            pathOptions={{
              color: darkMode || basemap === 'satellite' ? '#60a5fa' : '#1769e0',
              weight: 9,
              opacity: 0.24,
            }}
          />
          <Polyline
            positions={route}
            pathOptions={{
              color: darkMode || basemap === 'satellite' ? '#93c5fd' : '#1769e0',
              weight: 3.5,
              opacity: 0.98,
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
