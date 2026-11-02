"""Map catalog ingredients to Kroger products, like find_fdc.py does for FoodData Central.

    python find_product.py                     # search for every ingredient with no row yet
    python find_product.py --only "olive oil"  # search again for these (comma-separated)
    python find_product.py --only "olive oil" --query "extra virgin olive oil"
    python find_product.py --requery           # search again for everything in kroger_queries.csv
    python find_product.py --off "dill,mint"   # switch off every product row for these
    python find_product.py --post              # send kroger_products.csv to the backend

kroger_queries.csv holds search words for names that find the wrong thing on their own
("dill" finds dill relish, so it searches "fresh dill"). Every search uses them.

Searching adds the best match for each ingredient to kroger_products.csv and writes the
top 5 to cache/kroger_candidates.csv. Review kroger_products.csv: fix a wrong product by
pasting a product_id from the candidates, add a second row for a backup product (the
cheaper one per 100 g wins), or set active to false to stop refreshing one. Then --post.
The backend's weekly refresh re-prices every active row; nothing here stores prices.

Best match = has a price at the store, then the most words of the ingredient name in the
description, then not organic unless the name says so and not a drink or snack ("lemon"
shouldn't be lemon-lime soda), then the fewest other words (so "garlic" picks fresh garlic, not
Parmesan Garlic Knots, and "onion" a yellow onion, not onion rings; brand words don't count),
then Kroger's store brand, then Kroger's own order. It's a first guess: the review is the real
step.

When --only finds a new match, it keeps the rows it replaces but sets them to active=false,
so after --post the backend stops counting the old product's prices. Delete those rows once
you've posted. When it finds nothing, the existing rows are left alone.
"""
import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path

import kroger
from common import CACHE_DIR, PIPELINE_DIR, post_json

CATALOG_PATH = PIPELINE_DIR / "ingredients_seed.csv"
MAPPING_PATH = PIPELINE_DIR / "kroger_products.csv"
CANDIDATES_PATH = Path(CACHE_DIR) / "kroger_candidates.csv"
QUERIES_PATH = PIPELINE_DIR / "kroger_queries.csv"
SEARCH_CACHE = Path(CACHE_DIR) / "kroger" / "search"
MAPPING_FIELDS = ["ingredient", "product_id",
                  "label", "size", "sold_by", "price", "active"]
CANDIDATE_FIELDS = ["ingredient", "rank", "product_id",
                    "label", "size", "sold_by", "price", "promo", "categories"]
SKIP = {"water"}          # free, never priced
# Kroger categories that are almost never a cooking ingredient
UNLIKELY_CATEGORIES = {"beverages", "snacks",
                       "candy", "beer, wine & spirits", "adult beverage"}
# Kroger categories that are never food ("mint" shouldn't be mouthwash): dropped outright
NOT_FOOD_WORDS = ("health", "beauty", "personal care", "pet", "cleaning", "household",
                  "baby", "pharmacy", "garden", "office", "home decor", "kitchen & dining")
SEARCH_LIMIT = 50         # Kroger's maximum; the first 10 are often unpriced at the store
SEARCH_DELAY_SECONDS = 0.3
POST_BATCH_SIZE = 500     # the backend's limit per call


# ---------- files ----------

def catalog_names():
    with open(CATALOG_PATH, newline="", encoding="utf-8") as f:
        return [row["name"].strip().lower() for row in csv.DictReader(f) if row["name"].strip()]


def read_queries(known):
    """{ingredient: search words} from kroger_queries.csv (lines starting with # are notes)."""
    if not QUERIES_PATH.exists():
        return {}
    with open(QUERIES_PATH, newline="", encoding="utf-8") as f:
        lines = [line for line in f if line.strip() and not line.lstrip().startswith("#")]
    queries = {r["ingredient"].strip().lower(): r["query"].strip()
               for r in csv.DictReader(lines) if r["query"].strip()}
    unknown = sorted(set(queries) - known)
    if unknown:
        sys.exit(f"kroger_queries.csv names not in the catalog: {', '.join(unknown)}")
    return queries


def read_mapping():
    if not MAPPING_PATH.exists():
        return []
    with open(MAPPING_PATH, newline="", encoding="utf-8") as f:
        return [row for row in csv.DictReader(f) if (row.get("ingredient") or "").strip()]


def write_mapping(rows):
    rows = sorted(rows, key=lambda r: (
        r["ingredient"], r.get("product_id", "")))
    with open(MAPPING_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f, fieldnames=MAPPING_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def validate(rows, known):
    problems = []
    seen = set()
    for row in rows:
        name, product_id = row["ingredient"].strip(
        ).lower(), (row.get("product_id") or "").strip()
        if name not in known:
            problems.append(f"'{name}' isn't in the catalog")
        if not product_id:
            problems.append(f"'{name}' has no product_id")
        if (name, product_id) in seen:
            problems.append(f"'{name}' lists product {product_id} twice")
        seen.add((name, product_id))
        if (row.get("active") or "true").strip().lower() not in ("true", "false"):
            problems.append(f"'{name}' active must be true or false")
    if problems:
        sys.exit("kroger_products.csv has problems:\n  " +
                 "\n  ".join(problems))


# ---------- choosing ----------

def words(text):
    # plural and singular end up the same: oranges/orange -> orang, tomatoes/tomato -> tomato
    return {re.sub(r"e$", "", re.sub(r"(es|s)$", "", w)) for w in re.findall(r"[a-z]+", text.lower())}


def score(ingredient, product, term=None):
    """Higher is better (compared in order); None when the store has no price for it or
    it isn't food. term is the search words when they differ from the name ("fresh dill"):
    the name's words count first, so "dill" still beats "dill pickle chips"."""
    item = kroger.first_priced_item(product)
    if item is None:
        return None
    categories = {c.lower() for c in product.get("categories") or []}
    if any(word in c for c in categories for word in NOT_FOOD_WORDS):
        return None
    label = kroger.clean_label(product.get("description")).lower()
    brand = (product.get("brand") or "").lower()
    name_words = words(ingredient)
    term_words = words(term or ingredient)
    label_words = words(label)
    matched = len(name_words & label_words)
    term_matched = len(term_words & label_words)
    # words that make it a different product: "parmesan ... knots", "crispy ... rings"
    extra = len(label_words - name_words - term_words - words(brand))
    store_brand = 1 if brand == "kroger" else 0
    wanted = ingredient + " " + (term or "")
    organic_penalty = -1 if "organic" in label and "organic" not in wanted else 0
    category_penalty = -2 if categories & UNLIKELY_CATEGORIES else 0
    return (matched, organic_penalty + category_penalty, -extra, term_matched, store_brand)


def search_cached(ingredient, term, refresh):
    SEARCH_CACHE.mkdir(parents=True, exist_ok=True)
    path = SEARCH_CACHE / \
        (re.sub(r"[^a-z0-9]+", "_", term.lower()).strip("_") + f"__{SEARCH_LIMIT}.json")
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding="utf-8"))
    results = kroger.search(term, limit=SEARCH_LIMIT)
    path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    time.sleep(SEARCH_DELAY_SECONDS)
    return results


def as_row(ingredient, product):
    item = kroger.first_priced_item(product) or {}
    price = item.get("price") or {}
    return {
        "ingredient": ingredient,
        "product_id": product.get("productId", ""),
        "label": kroger.clean_label(product.get("description")),
        "size": item.get("size", ""),
        "sold_by": item.get("soldBy", ""),
        "price": price.get("regular", ""),
        "promo": price.get("promo", "") or "",
        "categories": "|".join(product.get("categories") or []),
        "active": "true",
    }


# ---------- commands ----------

def find(only, query, requery=False):
    known = set(catalog_names())
    mapping = read_mapping()
    validate(mapping, known)
    queries = read_queries(known)

    if requery:
        only = ",".join(queries)
    if only:
        targets = [n.strip().lower() for n in only.split(",") if n.strip()]
        unknown = [t for t in targets if t not in known]
        if unknown:
            sys.exit(f"Not in the catalog: {', '.join(unknown)}")
    else:
        mapped = {r["ingredient"]
                  for r in mapping if (r.get("active") or "true") == "true"}
        targets = [n for n in catalog_names(
        ) if n not in mapped and n not in SKIP]
    if query and len(targets) != 1:
        sys.exit("--query works with exactly one ingredient in --only")

    print(
        f"Searching Kroger store {kroger.LOCATION_ID} for {len(targets)} ingredients...")
    candidates, no_match = [], []
    for ingredient in targets:
        term = query or queries.get(ingredient) or ingredient
        try:
            results = search_cached(ingredient, term, refresh=bool(only))
        except RuntimeError as e:
            print(f"  {ingredient:<24} search failed: {e}")
            no_match.append(ingredient)
            continue
        # scored against the search words, so "fresh dill" prefers fresh over relish
        scored = [(score(ingredient, p, term), i, p) for i, p in enumerate(results)]
        priced = sorted([s for s in scored if s[0] is not None],
                        key=lambda s: tuple(-x for x in s[0]) + (s[1],))
        for rank, (_, _, product) in enumerate(priced[:5], start=1):
            candidates.append({**as_row(ingredient, product), "rank": rank})
        if not priced:
            print(f"  {ingredient:<24} no priced results")
            no_match.append(ingredient)
            continue
        best = as_row(ingredient, priced[0][2])
        # a replacement switches the old picks off (kept, so --post tells the backend to stop
        # counting them); a search that finds nothing leaves them as they were
        for r in mapping:
            if r["ingredient"] == ingredient:
                r["active"] = "false"
        mapping = [r for r in mapping if not (
            r["ingredient"] == ingredient and r["product_id"] == best["product_id"])]
        mapping.append(best)
        print(
            f"  {ingredient:<24} {best['label'][:48]:<48} {best['size']:<10} ${best['price']}")

    write_mapping(mapping)
    CANDIDATES_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CANDIDATES_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f, fieldnames=CANDIDATE_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(candidates)

    print(
        f"\nkroger_products.csv now has {len(mapping)} rows. Top 5 per ingredient: {CANDIDATES_PATH}")
    if no_match:
        print(f"No priced match for {len(no_match)}: {', '.join(no_match)}")
        print("Try --only \"<name>\" --query \"<other words>\", or leave them for prices_seed.csv.")


def switch_off(names):
    """Set active=false on every product row for these ingredients (a wrong pick with no
    better one yet). After --post the backend stops pricing them; use prices_seed.csv."""
    known = set(catalog_names())
    targets = [n.strip().lower() for n in names.split(",") if n.strip()]
    unknown = [t for t in targets if t not in known]
    if unknown:
        sys.exit(f"Not in the catalog: {', '.join(unknown)}")
    mapping = read_mapping()
    count = 0
    for r in mapping:
        if r["ingredient"] in targets and (r.get("active") or "true") == "true":
            r["active"] = "false"
            count += 1
    write_mapping(mapping)
    print(f"Switched off {count} rows for {len(targets)} ingredients. --post to send it.")


def post(dry_run):
    mapping = read_mapping()
    validate(mapping, set(catalog_names()))
    products = [{
        "ingredient": r["ingredient"].strip(),
        "source": "KROGER",
        "externalId": r["product_id"].strip(),
        "label": (r.get("label") or "").strip() or None,
        "active": (r.get("active") or "true").strip().lower() == "true",
    } for r in mapping]
    if dry_run:
        print(
            f"Dry run: would post {len(products)} mappings. First one:\n{json.dumps(products[0], indent=2)}")
        return

    created = updated = unchanged = 0
    failed = []
    for start in range(0, len(products), POST_BATCH_SIZE):
        result = post_json("/api/admin/prices/products",
                           {"products": products[start:start + POST_BATCH_SIZE]})
        created += result["created"]
        updated += result["updated"]
        unchanged += result["unchanged"]
        failed.extend(result["failed"])
    print(f"Created {created}, updated {updated}, unchanged {unchanged}.")
    for f in failed:
        print(f"  failed: {f['ingredient']}: {f['reason']}")
    print("Next: POST /api/admin/prices/refresh to price them.")


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--only", help="comma-separated ingredient names to search again")
    parser.add_argument(
        "--query", help="search words to use instead of the name (one ingredient)")
    parser.add_argument("--requery", action="store_true",
                        help="search again for every ingredient in kroger_queries.csv")
    parser.add_argument("--off", help="comma-separated ingredients to switch every product off for")
    parser.add_argument("--post", action="store_true",
                        help="send kroger_products.csv to the backend")
    parser.add_argument("--dry-run", action="store_true",
                        help="with --post: print, don't send")
    args = parser.parse_args()

    if args.off:
        switch_off(args.off)
    elif args.post:
        post(args.dry_run)
    else:
        find(args.only, args.query, args.requery)


if __name__ == "__main__":
    main()
