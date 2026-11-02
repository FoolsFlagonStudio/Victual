"""Fill in FoodData Central ids for ingredients_seed.csv.

Every row with a blank fdc_id is searched in FDC (SR Legacy first, Foundation as a
fallback). The top hit goes into fdc_id and fdc_description, and the top 5 hits for
each row are written to cache/fdc_candidates.csv so you can swap in a better match.

Rows that already have an fdc_id are skipped, so you can add new rows (or clear a
bad fdc_id and tweak its query) and rerun at any time.

Usage (from data_pipeline/, venv active):
    python find_fdc.py
"""
import csv
import sys
import time
from pathlib import Path

import requests

from common import CACHE_DIR, require_env

FDC_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"
SEED_PATH = Path(__file__).parent / "ingredients_seed.csv"
CANDIDATES_PATH = Path(CACHE_DIR) / "fdc_candidates.csv"
FIELDS = ["name", "query", "fdc_id",
          "fdc_description", "aliases", "tags", "pantry"]
VALID_TAGS = {
    "MEAT", "POULTRY", "FISH", "SHELLFISH", "DAIRY", "EGG", "GLUTEN",
    "TREE_NUT", "PEANUT", "SOY", "HONEY", "GELATIN",
}
DELAY_SECONDS = 0.25  # 1000 requests/hour limit; a full run is ~150 requests


def split_list(value):
    return [part.strip().lower() for part in (value or "").split("|") if part.strip()]


def validate(rows):
    """Catch problems that would make the backend import fail, before spending API calls."""
    problems = []
    owner = {}  # every name and alias -> the row that claims it
    # every fdc_id -> the row that claims it (the backend upserts by fdc_id)
    id_owner = {}

    for line_no, row in enumerate(rows, start=2):  # line 1 is the header
        name = (row.get("name") or "").strip()
        if not name:
            problems.append(f"line {line_no}: missing name")
            continue
        if name != name.lower():
            problems.append(
                f"line {line_no}: name '{name}' should be lowercase")

        fdc_id = (row.get("fdc_id") or "").strip()
        if fdc_id:
            if fdc_id in id_owner:
                problems.append(
                    f"line {line_no}: fdc_id {fdc_id} is already used by '{id_owner[fdc_id]}'")
            id_owner[fdc_id] = name

        for term in [name.lower(), *split_list(row.get("aliases"))]:
            if term in owner and owner[term] != name:
                problems.append(
                    f"line {line_no}: '{term}' is already used by '{owner[term]}'")
            owner[term] = name

        for tag in (row.get("tags") or "").split("|"):
            tag = tag.strip()
            if tag and tag not in VALID_TAGS:
                problems.append(
                    f"line {line_no}: unknown tag '{tag}' on '{name}'")

    return problems


def search(session, api_key, query):
    """Return up to 5 hits, preferring SR Legacy (better portions) over Foundation."""
    for data_type in ("SR Legacy", "Foundation"):
        resp = session.get(
            FDC_URL,
            params={"api_key": api_key, "query": query,
                    "dataType": data_type, "pageSize": 5},
            timeout=30,
        )
        time.sleep(DELAY_SECONDS)
        if resp.status_code == 400:
            # FDC rejects some query text outright (a "/" for example). Treat it as no match.
            return []
        if resp.status_code == 429:
            raise RuntimeError(
                "FDC rate limit hit (429). Wait an hour and rerun; progress is saved.")
        if not resp.ok:
            # Never print resp.url: it contains the API key.
            raise RuntimeError(
                f"FDC returned {resp.status_code} for query '{query}'")
        foods = resp.json().get("foods", [])
        if foods:
            return foods
    return []


def read_rows():
    with SEED_PATH.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_rows(rows):
    tmp = SEED_PATH.with_suffix(".tmp")
    with tmp.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(SEED_PATH)  # swap in only after a complete write


def write_candidates(candidates, searched_names):
    """Replace candidates for the names searched this run; keep everything else from earlier runs."""
    CANDIDATES_PATH.parent.mkdir(parents=True, exist_ok=True)
    kept = []
    if CANDIDATES_PATH.exists():
        with CANDIDATES_PATH.open(newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            next(reader, None)  # header
            kept = [r for r in reader if r and r[0] not in searched_names]

    with CANDIDATES_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "rank", "fdc_id", "data_type", "description"])
        writer.writerows(kept + candidates)


def main():
    rows = read_rows()

    problems = validate(rows)
    if problems:
        print("Fix these in ingredients_seed.csv first:")
        for problem in problems:
            print("  " + problem)
        sys.exit(1)

    todo = [row for row in rows if not (row.get("fdc_id") or "").strip()]
    if not todo:
        print("Every row already has an fdc_id. Nothing to do.")
        return

    api_key = require_env("DATA_GOV_API_KEY")
    session = requests.Session()
    candidates, missing, searched = [], [], set()

    print(f"Looking up {len(todo)} of {len(rows)} ingredients...")
    try:
        for i, row in enumerate(todo, start=1):
            searched.add(row["name"])
            query = (row.get("query") or "").strip() or row["name"]
            foods = search(session, api_key, query)
            if not foods:
                missing.append(row["name"])
                print(f"  [{i}/{len(todo)}] {row['name']}: NO MATCH")
                continue

            top = foods[0]
            row["fdc_id"] = str(top["fdcId"])
            row["fdc_description"] = top["description"]
            for rank, food in enumerate(foods, start=1):
                candidates.append(
                    [row["name"], rank, food["fdcId"], food["dataType"], food["description"]])
            print(
                f"  [{i}/{len(todo)}] {row['name']} -> {top['fdcId']} {top['description']}")
    except (RuntimeError, requests.RequestException) as e:
        print(f"\nStopped early: {e}")
    except KeyboardInterrupt:
        print("\nInterrupted.")
    finally:
        # Save whatever was found so a rerun picks up where this one stopped.
        write_rows(rows)
        write_candidates(candidates, searched)

    print(
        f"\nUpdated {SEED_PATH.name}. Alternatives are in {CANDIDATES_PATH}.")
    if missing:
        print("No match (edit the query column and rerun): " + ", ".join(missing))
    # Two rows on one FDC food would import as ONE ingredient (the backend upserts
    # by fdc_id), renaming the older one. seed_ingredients.py refuses to run until fixed.
    clashes = [problem for problem in validate(rows) if "fdc_id" in problem]
    if clashes:
        print("\nSame FDC food on two rows. Pick another fdc_id from the candidates file, "
              "or make one row an alias of the other:")
        for problem in clashes:
            print("  " + problem)


if __name__ == "__main__":
    main()
