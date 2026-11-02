"""Import the ingredient catalog into the backend.

Reads ingredients_seed.csv, fetches each food from FoodData Central (cached in
cache/fdc/ so reruns don't use API calls), pulls out macros per 100 g and portion
weights, and posts batches to POST /api/admin/ingredients/import. The backend
matches on fdc_id, so rerunning updates ingredients instead of duplicating them.

Usage (from data_pipeline/, venv active, backend running):
    python seed_ingredients.py            # import everything
    python seed_ingredients.py --dry-run  # print one payload, post nothing
"""
import csv
import json
import sys
import time
from pathlib import Path

import requests

from common import CACHE_DIR, post_json, require_env

FDC_FOODS_URL = "https://api.nal.usda.gov/fdc/v1/foods"
SEED_PATH = Path(__file__).parent / "ingredients_seed.csv"
EXTRA_PORTIONS_PATH = Path(__file__).parent / "portions_extra.csv"
FDC_CACHE = Path(CACHE_DIR) / "fdc"
FDC_IDS_PER_REQUEST = 20   # FDC's limit for the multi-food endpoint
IMPORT_BATCH_SIZE = 50     # the backend's limit per call

# Nutrient numbers (confirmed against real responses). Calories fall back to the
# Atwater values because some Foundation foods don't report 208.
CALORIE_NUMBERS = ("208", "958", "957")
PROTEIN, CARBS, FAT = "203", "205", "204"

# Label-reference servings, not something a recipe would ask for.
SKIP_UNITS = {"racc"}
SKIP_MODIFIER_PREFIXES = ("nlea serving",)


# ---------- FDC ----------

def fetch_foods(fdc_ids):
    """Return {fdc_id: food}, reading from the cache and fetching only what's missing."""
    FDC_CACHE.mkdir(parents=True, exist_ok=True)
    foods, missing = {}, []
    for fdc_id in fdc_ids:
        path = FDC_CACHE / f"{fdc_id}.json"
        if path.exists():
            foods[fdc_id] = json.loads(path.read_text(encoding="utf-8"))
        else:
            missing.append(fdc_id)

    if missing:
        api_key = require_env("DATA_GOV_API_KEY")
        print(
            f"Fetching {len(missing)} foods from FDC ({len(foods)} cached)...")
        for start in range(0, len(missing), FDC_IDS_PER_REQUEST):
            chunk = missing[start:start + FDC_IDS_PER_REQUEST]
            resp = requests.get(
                FDC_FOODS_URL,
                params={"api_key": api_key, "fdcIds": ",".join(
                    map(str, chunk)), "format": "full"},
                timeout=60,
            )
            if not resp.ok:
                # never print resp.url, it has the key
                sys.exit(f"FDC returned {resp.status_code}")
            for food in resp.json():
                fdc_id = food["fdcId"]
                (FDC_CACHE /
                 f"{fdc_id}.json").write_text(json.dumps(food), encoding="utf-8")
                foods[fdc_id] = food
            time.sleep(0.25)

    not_found = [i for i in fdc_ids if i not in foods]
    if not_found:
        sys.exit(f"FDC has no food for these ids: {not_found}")
    return foods


def nutrient_amounts(food):
    """Map nutrient number -> amount per 100 g."""
    amounts = {}
    for entry in food.get("foodNutrients", []):
        number = str((entry.get("nutrient") or {}).get("number", ""))
        if number and entry.get("amount") is not None:
            amounts[number] = entry["amount"]
    return amounts


def per_100g(value):
    """FDC can report small negatives (carbs 'by difference'); clamp to 0 and round."""
    if value is None:
        return None
    return round(max(float(value), 0.0), 2)


def extract_macros(food):
    amounts = nutrient_amounts(food)
    calories = next((amounts[n]
                    for n in CALORIE_NUMBERS if n in amounts), None)
    return {
        "caloriesPer100g": per_100g(calories),
        "proteinGPer100g": per_100g(amounts.get(PROTEIN)),
        "carbsGPer100g": per_100g(amounts.get(CARBS)),
        "fatGPer100g": per_100g(amounts.get(FAT)),
    }


def describe_portion(portion):
    """Build a description for ONE unit of the portion, e.g. 'cup, chopped' or 'large'.

    Foundation foods put the unit in measureUnit.name and use modifier as a note.
    SR Legacy sets the unit to 'undetermined' and puts everything in modifier.
    """
    unit = ((portion.get("measureUnit") or {}).get("name") or "").strip()
    modifier = (portion.get("modifier") or "").strip()
    fallback = (portion.get("portionDescription") or "").strip()

    if unit.lower() in SKIP_UNITS or modifier.lower().startswith(SKIP_MODIFIER_PREFIXES):
        return None
    if unit and unit.lower() != "undetermined":
        return f"{unit}, {modifier}" if modifier else unit
    return modifier or fallback or None


def extract_portions(food):
    """Portions as weight per ONE unit, deduplicated by description."""
    portions = {}
    for portion in food.get("foodPortions", []):
        description = describe_portion(portion)
        grams = portion.get("gramWeight")
        amount = portion.get("amount") or 1
        if not description or not grams or grams <= 0 or amount <= 0:
            continue
        key = description.lower()
        if key not in portions:  # keep the first one FDC lists
            portions[key] = {
                "description": description[:255],
                "gramWeight": round(grams / amount, 2),
            }
    return list(portions.values())


# ---------- seed file ----------

def split_list(value):
    return [part.strip() for part in (value or "").split("|") if part.strip()]


def read_seed():
    with SEED_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    blank = [r["name"] for r in rows if not (r.get("fdc_id") or "").strip()]
    if blank:
        sys.exit(f"These rows have no fdc_id yet (run find_fdc.py): {blank}")
    # The backend upserts by fdc_id, so a shared id would rename one ingredient to the other.
    seen, clashes = {}, []
    for r in rows:
        fdc_id = r["fdc_id"].strip()
        if fdc_id in seen:
            clashes.append(f"{fdc_id}: '{seen[fdc_id]}' and '{r['name']}'")
        seen.setdefault(fdc_id, r["name"])
    if clashes:
        sys.exit("Two rows share an FDC food (pick another fdc_id from cache/fdc_candidates.csv, "
                 "or make one an alias of the other):\n  " + "\n  ".join(clashes))
    return rows


def read_extra_portions():
    """{ingredient name: [portion, ...]} from portions_extra.csv (lines starting with # are notes)."""
    if not EXTRA_PORTIONS_PATH.exists():
        return {}
    with EXTRA_PORTIONS_PATH.open(newline="", encoding="utf-8") as f:
        lines = [line for line in f if line.strip() and not line.lstrip().startswith("#")]
    extra = {}
    for row in csv.DictReader(lines):
        name = row["name"].strip().lower()
        extra.setdefault(name, []).append({
            "description": row["description"].strip()[:255],
            "gramWeight": round(float(row["grams"]), 2),
        })
    return extra


def merge_portions(fdc_portions, manual):
    """Manual portions first (the converter takes the first match), then FDC's others."""
    taken = {p["description"].lower() for p in manual}
    return manual + [p for p in fdc_portions if p["description"].lower() not in taken]


def build_payload(row, food, extra=None):
    name = row["name"].strip().lower()
    return {
        "fdcId": int(row["fdc_id"]),
        "name": name,
        "aliases": split_list(row.get("aliases")),
        "tags": split_list(row.get("tags")),
        "pantryStaple": (row.get("pantry") or "").strip().lower() == "true",
        **extract_macros(food),
        "portions": merge_portions(extract_portions(food), (extra or {}).get(name, [])),
    }


def main():
    dry_run = "--dry-run" in sys.argv
    rows = read_seed()
    foods = fetch_foods([int(r["fdc_id"]) for r in rows])
    extra = read_extra_portions()
    unknown = sorted(set(extra) - {r["name"].strip().lower() for r in rows})
    if unknown:
        sys.exit(f"portions_extra.csv names not in ingredients_seed.csv: {unknown}")
    payloads = [build_payload(r, foods[int(r["fdc_id"])], extra) for r in rows]

    no_calories = [p["name"] for p in payloads if p["caloriesPer100g"] is None]
    no_portions = [p["name"] for p in payloads if not p["portions"]]
    if no_calories:
        print(f"Warning: no calories for {no_calories}")
    if no_portions:
        print(
            f"Note: no portions (weight units only) for {len(no_portions)}: {', '.join(no_portions)}")

    if dry_run:
        print(json.dumps(payloads[0], indent=2))
        print(f"\nDry run: {len(payloads)} ingredients ready, nothing posted.")
        return

    created = updated = 0
    for start in range(0, len(payloads), IMPORT_BATCH_SIZE):
        batch = payloads[start:start + IMPORT_BATCH_SIZE]
        result = post_json("/api/admin/ingredients/import",
                           {"ingredients": batch})
        created += result["created"]
        updated += result["updated"]
        print(f"  batch {start // IMPORT_BATCH_SIZE + 1}: {result}")

    print(f"\nDone: {created} created, {updated} updated.")


if __name__ == "__main__":
    main()
