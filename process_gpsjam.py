import csv
import json
import h3

INPUT_FILE = "data/gpsjam-2026-09-17.csv"
OUTPUT_FILE = "data/gpsjam-2026-09-17.json"

output = []

with open(INPUT_FILE, "r", encoding="utf-8") as f:

    reader = csv.DictReader(f)

    for row in reader:

        cell = row["hex"]

        good = int(row["count_good_aircraft"])
        bad = int(row["count_bad_aircraft"])

        total = good + bad

        if total == 0:
            continue

        bad_percent = round(
            (bad / total) * 100,
            2
        )

        if bad_percent >= 10:
            level = "high"

        elif bad_percent >= 2:
            level = "medium"

        else:
            level = "low"

        lat, lon = h3.cell_to_latlng(cell)

        output.append({
            "hex": cell,
            "lat": lat,
            "lon": lon,
            "count_good_aircraft": good,
            "count_bad_aircraft": bad,
            "bad_percent": bad_percent,
            "level": level
        })

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(output, f)

print(f"Created {OUTPUT_FILE}")
print(f"Cells processed: {len(output)}")