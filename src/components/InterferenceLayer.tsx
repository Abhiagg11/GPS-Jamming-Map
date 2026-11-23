import { useEffect, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { normalizeSeverity } from '../lib/route';
import type { ActiveSeverity, InterferenceHex } from '../lib/types';

interface Props {
  hexes: InterferenceHex[];
  visibleSeverities: Record<ActiveSeverity, boolean>;
  highlightedCellIds?: Set<string>;
  selectedCellId?: string | null;
  hasActiveRoute?: boolean;
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

interface PreparedHexFeature {
  hex: InterferenceHex;
  severity: ActiveSeverity;
  feature: GeoJSON.Feature<GeoJSON.Polygon, InterferenceHex>;
}

export default function InterferenceLayer({
  hexes,
  visibleSeverities,
  highlightedCellIds,
  selectedCellId,
  hasActiveRoute = false,
  darkMode,
}: Props) {
  const map = useMap();

  const preparedAll = useMemo<PreparedHexFeature[]>(() => {
    const list: PreparedHexFeature[] = [];
    for (const hex of hexes) {
      const severity = normalizeSeverity(hex.c);
      if (!severity) continue;
      if (!Array.isArray(hex.poly) || hex.poly.length < 4) continue;

      const ring: [number, number][] = [
        ...hex.poly.map(([lat, lon]): [number, number] => [lon, lat]),
        [hex.poly[0][1], hex.poly[0][0]],
      ];

      list.push({
        hex,
        severity,
        feature: {
          type: 'Feature',
          properties: hex,
          geometry: {
            type: 'Polygon',
            coordinates: [ring],
          },
        },
      });
    }
    return list;
  }, [hexes]);

  const activeFeatures = useMemo(
    () =>
      preparedAll
        .filter((item) => visibleSeverities[item.severity])
        .map((item) => item.feature),
    [preparedAll, visibleSeverities]
  );

  useEffect(() => {
    if (!activeFeatures.length) return;

    const canvasRenderer = L.canvas({ padding: 0.5 });

    const geoJsonData: GeoJSON.FeatureCollection<GeoJSON.Polygon, InterferenceHex> = {
      type: 'FeatureCollection',
      features: activeFeatures,
    };

    const getStyle = (item?: InterferenceHex) => {
      const sev = item ? normalizeSeverity(item.c) ?? 'r' : 'r';
      const colour = colours[sev];
      const isHighlighted = Boolean(item && highlightedCellIds?.has(item.h));
      const isSelected = Boolean(item && selectedCellId === item.h);
      const isDimmed = hasActiveRoute && !isHighlighted && !isSelected;

      return {
        renderer: canvasRenderer,
        color: isSelected
          ? '#38bdf8'
          : isHighlighted
            ? darkMode
              ? '#ffffff'
              : '#0f172a'
            : colour,
        weight: isSelected ? 3 : isHighlighted ? 2.2 : isDimmed ? 0.7 : 1.15,
        opacity: isDimmed ? 0.35 : 1,
        fillColor: colour,
        fillOpacity: isSelected ? 0.9 : isHighlighted ? 0.82 : isDimmed ? 0.16 : 0.6,
        interactive: true,
      };
    };

    const layer = L.geoJSON(geoJsonData, {
      style: (feature) => getStyle(feature?.properties as InterferenceHex | undefined),
      onEachFeature: (feature, polygon) => {
        const item = feature.properties as InterferenceHex;
        const sev = normalizeSeverity(item.c) ?? 'r';
        const colour = colours[sev];
        const isHighlighted = Boolean(highlightedCellIds?.has(item.h));
        const isSelected = selectedCellId === item.h;
        const path = polygon as L.Path;

        polygon.on('mouseover', () => {
          path.setStyle({
            weight: 2.6,
            opacity: 1,
            fillOpacity: 0.88,
          });
          map.getContainer().style.cursor = 'pointer';
        });

        polygon.on('mouseout', () => {
          path.setStyle(getStyle(item));
          map.getContainer().style.cursor = '';
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

        if (isSelected) {
          polygon.openPopup();
        }
      },
    });

    layer.addTo(map);

    return () => {
      map.getContainer().style.cursor = '';
      map.removeLayer(layer);
    };
  }, [
    activeFeatures,
    highlightedCellIds,
    selectedCellId,
    hasActiveRoute,
    darkMode,
    map,
  ]);

  return null;
}
