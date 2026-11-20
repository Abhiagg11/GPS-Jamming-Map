import Papa from 'papaparse';
import type { Airport } from './types';

let airportCache: Airport[] | null = null;
let airportRequest: Promise<Airport[]> | null = null;

export async function getAirports(): Promise<Airport[]> {
  if (airportCache) return airportCache;
  if (airportRequest) return airportRequest;

  airportRequest = (async () => {
    const response = await fetch('/api/airports.csv');
    if (!response.ok) throw new Error(`Airport directory request failed (${response.status})`);
    const csv = await response.text();
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    const loadedAirports: Airport[] = parsed.data
      .filter((row) =>
        Boolean(row.iata_code?.trim()) &&
        ['large_airport', 'medium_airport', 'small_airport'].includes(row.type) &&
        row.scheduled_service === 'yes' &&
        Number.isFinite(Number(row.latitude_deg)) &&
        Number.isFinite(Number(row.longitude_deg)),
      )
      .map((row) => ({
        iata_code: row.iata_code.trim().toUpperCase(),
        name: row.name,
        latitude_deg: Number(row.latitude_deg),
        longitude_deg: Number(row.longitude_deg),
        type: row.type,
        scheduled_service: row.scheduled_service,
        iso_country: row.iso_country,
      }));

    if (!loadedAirports.length) throw new Error('The airport directory returned no usable airports.');
    airportCache = loadedAirports;
    return loadedAirports;
  })();

  try {
    return await airportRequest;
  } finally {
    airportRequest = null;
  }
}

export async function findAirport(code: string): Promise<Airport | undefined> {
  const airports = await getAirports();
  const normalized = code.trim().toUpperCase();
  return airports.find((airport) => airport.iata_code === normalized);
}
