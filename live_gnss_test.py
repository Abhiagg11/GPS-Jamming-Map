import requests
import h3
from collections import defaultdict

# Test area: COK -> BOM corridor
POINTS = [
    (10.15, 76.40),
    (12.00, 75.50),
    (14.00, 74.50),
    (16.00, 73.80),
    (18.00, 73.90),
    (19.09, 72.87),
]

RADIUS_NM = 100
H3_RESOLUTION = 5

def get_aircraft(lat, lon):
    url = (
        f"https://api.adsb.lol/v2/lat/{lat}/lon/{lon}"
        f"/dist/{RADIUS_NM}"
    )

    response = requests.get(url, timeout=20)
    response.raise_for_status()

    return response.json().get("ac", [])


def analyze_point(lat, lon):
    aircraft = get_aircraft(lat, lon)

    cells = defaultdict(list)

    for aircraft_data in aircraft:
        if "lat" not in aircraft_data or "lon" not in aircraft_data:
            continue

        nac_p = aircraft_data.get("nac_p")

        if nac_p is None:
            continue

        try:
            nac_p = int(nac_p)
        except (TypeError, ValueError):
            continue

        cell = h3.latlng_to_cell(
            float(aircraft_data["lat"]),
            float(aircraft_data["lon"]),
            H3_RESOLUTION
        )

        cells[cell].append(nac_p)

    print()
    print("=" * 70)
    print(f"AREA: {lat}, {lon}")
    print(f"Aircraft returned: {len(aircraft)}")
    print(f"H3 cells with NACp data: {len(cells)}")
    print("-" * 70)

    for cell, nac_values in sorted(
        cells.items(),
        key=lambda item: len(item[1]),
        reverse=True
    ):
        total = len(nac_values)

        reduced = sum(
            1 for value in nac_values
            if value <= 9
        )

        low_accuracy = sum(
            1 for value in nac_values
            if value <= 8
        )

        reduced_pct = (reduced / total) * 100
        low_accuracy_pct = (low_accuracy / total) * 100

        # We need multiple aircraft before considering an anomaly.
        if total < 2:
            continue

        if reduced_pct >= 50:
            level = "POTENTIAL"
        else:
            level = "NORMAL"

        print(
            f"{cell} | "
            f"aircraft={total:2d} | "
            f"NACp={nac_values} | "
            f"<=9={reduced_pct:5.1f}% | "
            f"<=8={low_accuracy_pct:5.1f}% | "
            f"{level}"
        )


def main():
    print("LIVE GNSS DATA TEST")
    print("Source: ADSB.lol")
    print(f"Radius: {RADIUS_NM} NM")
    print(f"H3 resolution: {H3_RESOLUTION}")

    for lat, lon in POINTS:
        try:
            analyze_point(lat, lon)
        except Exception as error:
            print()
            print(f"ERROR at {lat}, {lon}: {error}")


if __name__ == "__main__":
    main()
