"""Review the recipe catalog for things that aren't a meal, and remove them.

Export every recipe with how it was filed (category, breakfast/lunch/dinner/side
scores, cost and ingredients) to cache/recipe_audit.csv:

    python meal_audit.py export

Remove the recipes listed in a CSV with an "id" column (e.g. not_meals.csv). Always
dry-run first; it says how many recipes and meal plans would go:

    python meal_audit.py remove not_meals.csv --dry-run
    python meal_audit.py remove not_meals.csv           # 409 if plans use them
    python meal_audit.py remove not_meals.csv --force   # also deletes those (test) plans

Scores: a recipe can fill a slot at 50 or more and is offered as a side at 50 or more.
"""
import argparse
import csv
import sys

import requests

from common import API_URL, CACHE_DIR, post_json, require_env

FIELDS = ["id", "name", "sourceHost", "category", "keywords", "breakfast", "lunch", "dinner",
          "side", "costPerServing", "ingredients"]


def export() -> None:
    r = requests.get(f"{API_URL}/api/admin/recipes/audit",
                     headers={"X-Admin-Key": require_env("FORKAST_ADMIN_KEY")}, timeout=600)
    if r.status_code >= 400:
        sys.exit(f"{r.status_code}: {r.text[:300]}")
    rows = r.json()
    CACHE_DIR.mkdir(exist_ok=True)
    out = CACHE_DIR / "recipe_audit.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    meals = sum(1 for x in rows if max(x["breakfast"], x["lunch"], x["dinner"]) >= 50)
    sides = sum(1 for x in rows if x["side"] >= 50)
    print(f"{len(rows)} recipes ({meals} can fill a meal, {sides} offered as sides) -> {out}")


def remove(path: str, dry_run: bool, force: bool) -> None:
    with open(path, newline="", encoding="utf-8-sig") as f:
        ids = [row["id"].strip() for row in csv.DictReader(f) if row.get("id", "").strip()]
    if not ids:
        sys.exit(f"No ids in {path} (needs an 'id' column)")
    query = f"?dryRun={str(dry_run).lower()}&force={str(force).lower()}"
    result = post_json(f"/api/admin/recipes/remove{query}", {"ids": ids})
    verb = "Would remove" if result["dryRun"] else "Removed"
    print(f"{verb} {result['recipes']} of {len(ids)} recipes; {result['mealPlans']} meal plans use them as a main.")
    if result["notFound"]:
        print(f"{len(result['notFound'])} ids not found (already removed?): {', '.join(result['notFound'][:5])}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("export", help="write cache/recipe_audit.csv")
    rm = sub.add_parser("remove", help="remove the recipes listed in a CSV")
    rm.add_argument("csv")
    rm.add_argument("--dry-run", action="store_true")
    rm.add_argument("--force", action="store_true", help="also delete meal plans that use them")
    args = parser.parse_args()
    if args.command == "export":
        export()
    else:
        remove(args.csv, args.dry_run, args.force)


if __name__ == "__main__":
    main()
