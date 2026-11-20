
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { InterferenceHex } from '../lib/types';

interface Props {
  hexes: InterferenceHex[];
}

const colours: Record<string, string> = {
  y: '#f2c230',
  r: '#ed493f',
  p: '#9638c8',
  purple: '#9638c8',
};

function labelForClass(value: string): string {
  if (value === 'y') return 'Moderate indicator';
  if (value === 'r') return 'High indicator';
  return 'Very high indicator';
}

export default function InterferenceLayer({ hexes }: Props) {
  const map = useMap();

  useEffect(() => {
    // Only display affected areas.
    // Green "g" hexagons are excluded.
    const affectedHexes = hexes.filter(
      (hex) => hex.c !== 'g'
    );

    if (!affectedHexes.length) return;

    const features: GeoJSON.Feature<
      GeoJSON.Polygon,
      InterferenceHex
    >[] = affectedHexes
      .filter(
        (hex) =>
          Array.isArray(hex.poly) &&
          hex.poly.length >= 4
      )
      .map((hex) => ({
        type: 'Feature',
        properties: hex,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            ...hex.poly.map(([lat, lon]) => [lon, lat]),
            [hex.poly[0][1], hex.poly[0][0]],
          ]],
        },
      }));

    const layer = L.geoJSON(
      {
        type: 'FeatureCollection',
        features,
      },
      {
        renderer: L.canvas({ padding: 0.5 }),

        style: (feature) => {
          const properties = feature?.properties as
            | InterferenceHex
            | undefined;

          const colour =
            colours[properties?.c ?? ''] ?? '#ed493f';

          return {
            color: colour,
            weight: 1.25,
            opacity: 1,
            fillColor: colour,
            fillOpacity: 0.62,
            interactive: true,
          };
        },

        onEachFeature: (feature, polygon) => {
          const item = feature.properties as InterferenceHex;
          const colour = colours[item.c] ?? '#ed493f';

          const popup = `
            <div class="hex-popup">
              <strong style="color:${colour}">
                ${labelForClass(item.c)}
              </strong>

              <div class="hex-popup-row">
                <span>Affected aircraft</span>
                <b>${item.b.toLocaleString()}</b>
              </div>

              <div class="hex-popup-row">
                <span>Unaffected aircraft</span>
                <b>${item.g.toLocaleString()}</b>
              </div>

              <div class="hex-popup-row">
                <span>Affected share</span>
                <b>${Number(item.p).toFixed(1)}%</b>
              </div>

              <small>Cell: ${item.h}</small>
            </div>
          `;

          polygon.bindPopup(popup, {
            maxWidth: 240,
          });
        },
      }
    );

    layer.addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [hexes, map]);

  return null;
}
