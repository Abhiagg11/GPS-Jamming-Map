import type { Airport } from './types';

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

// Interpolate points along the great-circle arc between two airports.
export function greatCircleRoute(from: Airport, to: Airport): [number, number][] {
  const lat1 = toRadians(from.latitude_deg);
  const lon1 = toRadians(from.longitude_deg);
  const lat2 = toRadians(to.latitude_deg);
  const lon2 = toRadians(to.longitude_deg);

  const vector = (lat: number, lon: number) => [
    Math.cos(lat) * Math.cos(lon),
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
  ];
  const a = vector(lat1, lon1);
  const b = vector(lat2, lon2);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  const distanceKm = omega * 6371;
  const steps = Math.max(30, Math.min(180, Math.ceil(distanceKm / 45)));

  if (omega < 1e-8) return [[from.latitude_deg, from.longitude_deg], [to.latitude_deg, to.longitude_deg]];

  const points: [number, number][] = [];
  for (let index = 0; index <= steps; index += 1) {
    const fraction = index / steps;
    const scaleA = Math.sin((1 - fraction) * omega) / Math.sin(omega);
    const scaleB = Math.sin(fraction * omega) / Math.sin(omega);
    const x = scaleA * a[0] + scaleB * b[0];
    const y = scaleA * a[1] + scaleB * b[1];
    const z = scaleA * a[2] + scaleB * b[2];
    points.push([toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))), toDegrees(Math.atan2(y, x))]);
  }
  return points;
}
