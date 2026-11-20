
import { useEffect } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';

import type { Airport, InterferenceHex } from '../lib/types';
import InterferenceLayer from './InterferenceLayer';

interface Props {
  hexes: InterferenceHex[];
  route: [number, number][] | null;
  origin: Airport | null;
  destination: Airport | null;
  darkMode: boolean;
}

function FitRoute({
  route,
}: {
  route: [number, number][] | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (route?.length) {
      map.fitBounds(route, {
        padding: [38, 38],
        maxZoom: 6,
        animate: true,
      });
    }
  }, [map, route]);

  return null;
}

export default function MapView({
  hexes,
  route,
  origin,
  destination,
  darkMode,
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
          {/* Dark map background */}
          <TileLayer
            key="esri-dark-base"
            attribution='Tiles &copy; Esri, HERE, Garmin, OpenStreetMap contributors'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            maxZoom={16}
          />

          {/* Dark map labels and boundaries */}
          <TileLayer
            key="esri-dark-reference"
            attribution=""
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
            maxZoom={16}
          />
        </>
      ) : (
        /* Existing working light map */
        <TileLayer
          key="esri-light"
          attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> | Sources: Esri, HERE, Garmin, USGS, Intermap, NRCAN, METI, and the GIS User Community'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
          maxZoom={18}
        />
      )}

      {/* Interference indicators */}
      <InterferenceLayer hexes={hexes} />

      {/* Flight route */}
      {route && (
        <Polyline
          positions={route}
          pathOptions={{
            color: darkMode ? '#58a0ff' : '#1769e0',
            weight: 4,
            opacity: 0.95,
          }}
        />
      )}

      {/* Departure airport */}
      {origin && (
        <CircleMarker
          center={[
            origin.latitude_deg,
            origin.longitude_deg,
          ]}
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

      {/* Arrival airport */}
      {destination && (
        <CircleMarker
          center={[
            destination.latitude_deg,
            destination.longitude_deg,
          ]}
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

      <FitRoute route={route} />
    </MapContainer>
  );
}
