import { useEffect, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { normalizeSeverity } from '../lib/route';
import type { ActiveSeverity, InterferenceHex } from '../lib/types';

interface Props {
  hexes: InterferenceHex[];
  visibleSeverities: Record<ActiveSeverity, boolean>;
  highlightedCellIds?: Set<string>;
  darkMode: boolean;
}

const colours: Record<ActiveSeverity, string> = {
  y: '#f2c230',
  r: '#ed493f',
  p: '#9638c8',
};

function labelForSeverity(sev: ActiveSeverity): string {
  if (sev === 'y') return 'Moderate indicator';
  if (sev === 'r') return 'High indicator';
  return 'Very high indicator';
}

export default function InterferenceLayer({
  hexes,
  visibleSeverities,
  highlightedCellIds,
  darkMode,
}: Props) {
  const map = useMap();

  const filteredHexes = useMemo(
    () =>
      hexes.filter((hex) => {
        const sev = normalizeSeverity(hex.c);
        return sev !== null && visibleSeverities[sev];
      }),
    [hexes, visibleSeverities]
  );

  useEffect(() => {
    if (!filteredHexes.length) return;

    const canvasRenderer = L.canvas({ padding: 0.5 });

    const features: GeoJSON.Feature<GeoJSON.Polygon, InterferenceHex>[] = filteredHexes
      .filter((hex) => Array.isArray(hex.poly) && hex.poly.length >= 4)
      .map((hex) => ({
        type: 'Feature',
        properties: hex,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              ...hex.poly.map(([lat, lon]) => [lon, lat]),
              [hex.poly[0][1], hex.poly[0][0]],
            ],
          ],
        },
      }));

    const geoJsonData: GeoJSON.FeatureCollection<GeoJSON.Polygon, InterferenceHex> = {
      type: 'FeatureCollection',
      features,
    };

    const layer = L.geoJSON(geoJsonData, {
      style: (feature) => {
        const item = feature?.properties as InterferenceHex | undefined;
        const sev = item ? normalizeSeverity(item.c) ?? 'r' : 'r';
        const colour = colours[sev];
        const isHighlighted = Boolean(item && highlightedCellIds?.has(item.h));

        return {
          renderer: canvasRenderer,
          color: isHighlighted ? (darkMode ? '#ffffff' : '#0f172a') : colour,
          weight: isHighlighted ? 2.2 : 1.15,
          opacity: 1,
          fillColor: colour,
          fillOpacity: isHighlighted ? 0.82 : 0.6,
          interactive: true,
        };
      },
      onEachFeature: (feature, polygon) => {
        const item = feature.properties as InterferenceHex;
        const sev = normalizeSeverity(item.c) ?? 'r';
        const colour = colours[sev];
        const isHighlighted = Boolean(highlightedCellIds?.has(item.h));
        const path = polygon as L.Path;

        polygon.on('mouseover', () => {
          path.setStyle({
            weight: 2.4,
            fillOpacity: 0.86,
          });
          const container = map.getContainer();
          container.style.cursor = 'pointer';
        });

        polygon.on('mouseout', () => {
          path.setStyle({
            weight: isHighlighted ? 2.2 : 1.15,
            fillOpacity: isHighlighted ? 0.82 : 0.6,
          });
          const container = map.getContainer();
          container.style.cursor = '';
        });

        const popup = `
          <div class="hex-popup">
            <strong style="color:${colour}">
              ${labelForSeverity(sev)}${isHighlighted ? ' · Along route' : ''}
            </strong>
            <div class="hex-popup-row">
              <span>Affected aircraft</span>
              <b>${Number(item.b || 0).toLocaleString()}</b>
            </div>
            <div class="hex-popup-row">
              <span>Unaffected aircraft</span>
              <b>${Number(item.g || 0).toLocaleString()}</b>
            </div>
            <div class="hex-popup-row">
              <span>Affected share</span>
              <b>${Number(item.p || 0).toFixed(1)}%</b>
            </div>
            <small>Cell: ${item.h}</small>
          </div>
        `;

        polygon.bindPopup(popup, { maxWidth: 240 });
      },
    });

    layer.addTo(map);

    return () => {
      map.getContainer().style.cursor = '';
      map.removeLayer(layer);
    };
  }, [filteredHexes, visibleSeverities, highlightedCellIds, darkMode, map]);

  return null;
}
