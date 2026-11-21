import type { ActiveSeverity, Airport, InterferenceHex, RouteAnalysis } from './types';

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export function normalizeSeverity(code: string): ActiveSeverity | null {
  if (code === 'y') return 'y';
  if (code === 'r') return 'r';
  if (code === 'p' || code === 'purple') return 'p';
  return null;
}

export function severityRank(code: ActiveSeverity): number {
  if (code === 'p') return 3;
  if (code === 'r') return 2;
  return 1;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  const distanceKm = omega * EARTH_RADIUS_KM;
  const steps = Math.max(30, Math.min(180, Math.ceil(distanceKm / 45)));

  if (omega < 1e-8) {
    return [
      [from.latitude_deg, from.longitude_deg],
      [to.latitude_deg, to.longitude_deg],
    ];
  }

  const points: [number, number][] = [];
  for (let index = 0; index <= steps; index += 1) {
    const fraction = index / steps;
    const scaleA = Math.sin((1 - fraction) * omega) / Math.sin(omega);
    const scaleB = Math.sin(fraction * omega) / Math.sin(omega);
    const x = scaleA * a[0] + scaleB * b[0];
    const y = scaleA * a[1] + scaleB * b[1];
    const z = scaleA * a[2] + scaleB * b[2];
    points.push([
      toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))),
      toDegrees(Math.atan2(y, x)),
    ]);
  }
  return points;
}

function hexCentroid(hex: InterferenceHex): [number, number] | null {
  if (!Array.isArray(hex.poly) || hex.poly.length === 0) return null;
  let latSum = 0;
  let lonSum = 0;
  for (const [lat, lon] of hex.poly) {
    latSum += lat;
    lonSum += lon;
  }
  return [latSum / hex.poly.length, lonSum / hex.poly.length];
}

function minDistanceToRouteKm(
  lat: number,
  lon: number,
  routePoints: [number, number][]
): number {
  let minKm = Infinity;
  // Sample every 2nd point for fast evaluation on long routes
  for (let i = 0; i < routePoints.length; i += 2) {
    const d = haversineKm(lat, lon, routePoints[i][0], routePoints[i][1]);
    if (d < minKm) minKm = d;
  }
  const last = routePoints[routePoints.length - 1];
  const dLast = haversineKm(lat, lon, last[0], last[1]);
  return Math.min(minKm, dLast);
}

export function analyzeRouteInterference(
  origin: Airport,
  destination: Airport,
  routePoints: [number, number][],
  hexes: InterferenceHex[],
  corridorKm: number
): RouteAnalysis {
  const distanceKm = Math.round(
    haversineKm(
      origin.latitude_deg,
      origin.longitude_deg,
      destination.latitude_deg,
      destination.longitude_deg
    )
  );

  let moderateCount = 0;
  let highCount = 0;
  let veryHighCount = 0;
  let maxSeverity: ActiveSeverity | null = null;
  let hottestHex: InterferenceHex | null = null;
  let bestScore = -1;
  const nearbyHexes: InterferenceHex[] = [];

  for (const hex of hexes) {
    const sev = normalizeSeverity(hex.c);
    if (!sev) continue;
    const center = hexCentroid(hex);
    if (!center) continue;

    const distKm = minDistanceToRouteKm(center[0], center[1], routePoints);
    if (distKm <= corridorKm) {
      nearbyHexes.push(hex);
      if (sev === 'y') moderateCount += 1;
      if (sev === 'r') highCount += 1;
      if (sev === 'p') veryHighCount += 1;

      if (!maxSeverity || severityRank(sev) > severityRank(maxSeverity)) {
        maxSeverity = sev;
      }

      const score = severityRank(sev) * 1000 + Number(hex.p || 0) * 10 + Number(hex.b || 0);
      if (score > bestScore) {
        bestScore = score;
        hottestHex = hex;
      }
    }
  }

  return {
    distanceKm,
    corridorKm,
    nearbyHexes,
    moderateCount,
    highCount,
    veryHighCount,
    maxSeverity,
    hottestHex,
  };
}