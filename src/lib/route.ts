import type { ActiveSeverity, Airport, InterferenceHex } from './types';

export const EARTH_RADIUS_KM = 6371;

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineKm(
  a: [number, number],
  b: [number, number]
): number {
  const dLat = toRadians(b[0] - a[0]);
  const dLon = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function initialBearingDeg(
  from: [number, number],
  to: [number, number]
): number {
  const lat1 = toRadians(from[0]);
  const lat2 = toRadians(to[0]);
  const dLon = toRadians(to[1] - from[1]);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function greatCirclePoints(
  from: [number, number],
  to: [number, number],
  steps = 64
): [number, number][] {
  const lat1 = toRadians(from[0]);
  const lon1 = toRadians(from[1]);
  const lat2 = toRadians(to[0]);
  const lon2 = toRadians(to[1]);

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const delta = 2 * Math.asin(Math.min(1, Math.sqrt(a)));

  if (delta < 1e-9) {
    return [from, to];
  }

  const sinDelta = Math.sin(delta);
  const pts: [number, number][] = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const A = Math.sin((1 - t) * delta) / sinDelta;
    const B = Math.sin(t * delta) / sinDelta;

    const x =
      A * Math.cos(lat1) * Math.cos(lon1) +
      B * Math.cos(lat2) * Math.cos(lon2);
    const y =
      A * Math.cos(lat1) * Math.sin(lon1) +
      B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);

    const lat = Math.atan2(z, Math.hypot(x, y));
    const lon = Math.atan2(y, x);
    pts.push([toDegrees(lat), toDegrees(lon)]);
  }

  return pts;
}

export function multiLegRoute(stops: Airport[]): [number, number][] {
  if (stops.length < 2) return [];
  const combined: [number, number][] = [];

  for (let i = 0; i < stops.length - 1; i += 1) {
    const start: [number, number] = [
      stops[i].latitude_deg,
      stops[i].longitude_deg,
    ];
    const end: [number, number] = [
      stops[i + 1].latitude_deg,
      stops[i + 1].longitude_deg,
    ];
    const segment = greatCirclePoints(start, end, 64);
    if (i > 0 && segment.length > 0) {
      combined.push(...segment.slice(1));
    } else {
      combined.push(...segment);
    }
  }

  return combined;
}

export function corridorPolygon(
  routePoints: [number, number][],
  bufferKm: number
): [number, number][] {
  if (routePoints.length < 2 || bufferKm <= 0) return [];

  const leftSide: [number, number][] = [];
  const rightSide: [number, number][] = [];

  for (let i = 0; i < routePoints.length; i += 1) {
    const [lat, lon] = routePoints[i];
    const prev = routePoints[Math.max(0, i - 1)];
    const next = routePoints[Math.min(routePoints.length - 1, i + 1)];

    const dLat = toRadians(next[0] - prev[0]);
    const dLon = toRadians(next[1] - prev[1]) * Math.cos(toRadians(lat));
    const norm = Math.hypot(dLat, dLon) || 1;

    const perpLat = -dLon / norm;
    const perpLon = dLat / norm;

    const angularOffset = bufferKm / EARTH_RADIUS_KM;
    const cosLat = Math.max(0.15, Math.cos(toRadians(lat)));

    const latL = toDegrees(toRadians(lat) + perpLat * angularOffset);
    const lonL = toDegrees(toRadians(lon) + (perpLon * angularOffset) / cosLat);

    const latR = toDegrees(toRadians(lat) - perpLat * angularOffset);
    const lonR = toDegrees(toRadians(lon) - (perpLon * angularOffset) / cosLat);

    leftSide.push([latL, lonL]);
    rightSide.unshift([latR, lonR]);
  }

  return [...leftSide, ...rightSide];
}

export function normalizeSeverity(raw: unknown): ActiveSeverity | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toLowerCase();
  if (code === 'y' || code === 'r' || code === 'p') return code;
  return null;
}

export function hexCentroid(hex: InterferenceHex): [number, number] | null {
  if (!Array.isArray(hex.poly) || hex.poly.length === 0) return null;
  let sumLat = 0;
  let sumLon = 0;
  let count = 0;
  for (const pt of hex.poly) {
    if (Array.isArray(pt) && pt.length >= 2) {
      sumLat += pt[0];
      sumLon += pt[1];
      count += 1;
    }
  }
  if (!count) return null;
  return [sumLat / count, sumLon / count];
}

export function distanceToPolylineKm(
  point: [number, number],
  line: [number, number][]
): number {
  let minKm = Infinity;
  for (let i = 0; i < line.length; i += 1) {
    const d = haversineKm(point, line[i]);
    if (d < minKm) minKm = d;
    if (i < line.length - 1) {
      const mid: [number, number] = [
        (line[i][0] + line[i + 1][0]) / 2,
        (line[i][1] + line[i + 1][1]) / 2,
      ];
      const dm = haversineKm(point, mid);
      if (dm < minKm) minKm = dm;
    }
  }
  return minKm;
}

export interface RouteHotspot {
  hex: InterferenceHex;
  severity: ActiveSeverity;
  minDistanceKm: number;
  score: number;
}

export interface RouteInterferenceSummary {
  waypoints: Airport[];
  distanceKm: number;
  corridorKm: number;
  nearbyHexes: InterferenceHex[];
  moderateCount: number;
  highCount: number;
  veryHighCount: number;
  maxSeverity: ActiveSeverity | null;
  hottestHex: InterferenceHex | null;
  hotspots: RouteHotspot[];
}

function severityRank(sev: ActiveSeverity): number {
  if (sev === 'p') return 3;
  if (sev === 'r') return 2;
  return 1;
}

export function analyzeRouteInterference(
  waypoints: Airport[],
  routeLine: [number, number][],
  hexes: InterferenceHex[],
  corridorKm: number
): RouteInterferenceSummary {
  let distanceKm = 0;
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    distanceKm += haversineKm(
      [waypoints[i].latitude_deg, waypoints[i].longitude_deg],
      [waypoints[i + 1].latitude_deg, waypoints[i + 1].longitude_deg]
    );
  }

  const nearbyHexes: InterferenceHex[] = [];
  const hotspots: RouteHotspot[] = [];
  let moderateCount = 0;
  let highCount = 0;
  let veryHighCount = 0;
  let maxSeverity: ActiveSeverity | null = null;
  let hottestHex: InterferenceHex | null = null;
  let bestScore = -1;

  for (const hex of hexes) {
    const sev = normalizeSeverity(hex.c);
    if (!sev) continue;
    const center = hexCentroid(hex);
    if (!center) continue;

    const dist = distanceToPolylineKm(center, routeLine);
    if (dist <= corridorKm) {
      nearbyHexes.push(hex);
      if (sev === 'y') moderateCount += 1;
      if (sev === 'r') highCount += 1;
      if (sev === 'p') veryHighCount += 1;

      if (!maxSeverity || severityRank(sev) > severityRank(maxSeverity)) {
        maxSeverity = sev;
      }

      const share = Number(hex.p || 0);
      const proximityBonus = Math.max(0, 1 - dist / Math.max(1, corridorKm));
      const score = severityRank(sev) * 100 + share + proximityBonus * 25;

      hotspots.push({
        hex,
        severity: sev,
        minDistanceKm: Math.round(dist),
        score,
      });

      if (score > bestScore) {
        bestScore = score;
        hottestHex = hex;
      }
    }
  }

  hotspots.sort((a, b) => b.score - a.score);

  return {
    waypoints,
    distanceKm: Math.round(distanceKm),
    corridorKm,
    nearbyHexes,
    moderateCount,
    highCount,
    veryHighCount,
    maxSeverity,
    hottestHex,
    hotspots: hotspots.slice(0, 5),
  };
}
