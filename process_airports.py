import csv
import json

INPUT_FILE = "data/airports.csv"
OUTPUT_FILE = "data/airports.json"

airports = []

with open(INPUT_FILE, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)

    for row in reader:

        if row.get("type") not in [
            "large_airport",
            "medium_airport",
            "small_airport"
        ]:
            continue

        lat = row.get("latitude_deg")
        lon = row.get("longitude_deg")

        if not lat or not lon:
            continue

        airports.append({
            "name": row.get("name", ""),
            "iata": row.get("iata_code", ""),
            "icao": row.get("ident", ""),
            "country": row.get("iso_country", ""),
            "latitude": float(lat),
            "longitude": float(lon),
            "lat": float(lat),
            "lon": float(lon)
        })

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(airports, f)

print(f"Created {OUTPUT_FILE}")
print(f"Airports processed: {len(airports)}")