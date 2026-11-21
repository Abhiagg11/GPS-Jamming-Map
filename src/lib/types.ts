export type SeverityCode = 'g' | 'y' | 'r' | 'p' | 'purple';
export type ActiveSeverity = 'y' | 'r' | 'p';

export interface Airport {
  iata_code: string;
  name: string;
  latitude_deg: number;
  longitude_deg: number;
  type: string;
  scheduled_service: string;
  iso_country: string;
}

export interface InterferenceHex {
  h: string;
  g: number; // unaffected aircraft
  b: number; // affected aircraft
  p: number; // affected share, percent
  c: string; // provider colour class
  poly: [number, number][]; // [latitude, longitude]
}

export interface InterferenceResponse {
  history_date?: string;
  updated?: string;
  attribution?: string;
  hexes: InterferenceHex[];
}

export interface RouteHotspot {
  hex: InterferenceHex;
  severity: ActiveSeverity;
  minDistanceKm: number;
  score: number;
}

export interface RouteAnalysis {
  waypoints: Airport[];
  distanceKm: number;
  corridorKm: number;
  nearbyHexes: InterferenceHex[];
  hotspots: RouteHotspot[];
  moderateCount: number;
  highCount: number;
  veryHighCount: number;
  maxSeverity: ActiveSeverity | null;
  hottestHex: InterferenceHex | null;
}