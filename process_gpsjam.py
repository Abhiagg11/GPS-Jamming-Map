import csv
import json
import os
import h3

INPUT_DIR = "data/gpsjam"
OUTPUT_DIR = "data/gpsjam"

os.makedirs(OUTPUT_DIR, exist_ok=True)

for filename in sorted(os.listdir(INPUT_DIR)):
    if not filename.endswith(".csv"):
        continue

    input_file = os.path.join(INPUT_DIR, filename)

    # Skip empty files
    if os.path.getsize(input_file) == 0:
        print(f"Skipping empty file: {filename}")
        continue

    date = filename.replace(".csv", "")
    output_file = os.path.join(OUTPUT_DIR, f"{date}.json")

    cells = []

    with open(input_file, "r", newline="") as f:
        reader = csv.DictReader(f)

        for row in reader:
            cell = row["hex"]

            good = int(row["count_good_aircraft"])
            bad = int(row["count_bad_aircraft"])

            total = good + bad

            if total == 0:
                bad_percent = 0
            else:
                bad_percent = round((bad / total) * 100, 2)

            lat, lon = h3.cell_to_latlng(cell)

            cells.append({
                "hex": cell,
                "lat": lat,
                "lon": lon,
                "good": good,
                "bad": bad,
                "bad_percent": bad_percent,
                "level": 4
            })

    with open(output_file, "w") as f:
        json.dump(cells, f, separators=(",", ":"))

    print(f"{date}: {len(cells)} cells -> {output_file}")