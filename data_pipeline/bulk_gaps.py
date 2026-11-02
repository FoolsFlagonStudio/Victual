"""Clear the catalog report's UNMATCHED names in one sweep instead of one round per batch.

    python bulk_gaps.py build    # cache/catalog_gaps.csv -> bulk_review.csv, with suggestions
    python bulk_gaps.py apply    # bulk_review.csv -> ingredients_seed.csv + kroger_products.csv

build reads every UNMATCHED row from the last catalog_report.py run and suggests one
action per name:

  alias  the name is a variant of an ingredient we have ("crumbled feta" -> feta cheese);
         alias_of says which. Also suggested when the FDC food it found is already used
         by a catalog row, since two rows can't share one.
  new    a new catalog row: name, FDC food (with two alternatives), allergen tags, pantry
         flag and the best Kroger product are filled in
  skip   not an ingredient ("wooden skewers", "recipe carne asada") or too vague
         ("fresh herbs", "seasoning of choice")

Open bulk_review.csv in a spreadsheet and fix what's wrong: change action, alias_of,
name, fdc_id (an id from fdc_alternatives), tags or kroger_product_id (blank = no Kroger
product, price it in prices_seed.csv instead). Then apply. The reported name always
becomes an alias of the row it lands on, so the recipe line matches.

FDC and Kroger searches are cached (cache/bulk_fdc/, cache/kroger/), so build is quick
to rerun and only searches names it hasn't seen.

After apply: python seed_ingredients.py, then python finish_round.py.
"""
import argparse
import csv
import json
import re
import sys
from pathlib import Path

import requests

import find_fdc
import find_product
from common import CACHE_DIR, PIPELINE_DIR, require_env

GAPS_PATH = Path(CACHE_DIR) / "catalog_gaps.csv"
REVIEW_PATH = PIPELINE_DIR / "bulk_review.csv"
FDC_CACHE = Path(CACHE_DIR) / "bulk_fdc"
SEED_PATH = PIPELINE_DIR / "ingredients_seed.csv"

REVIEW_FIELDS = ["action", "reported_name", "name", "alias_of", "lines", "completes",
                 "fdc_id", "fdc_description", "fdc_alternatives", "tags", "pantry",
                 "kroger_product_id", "kroger_label", "kroger_size", "kroger_price", "note",
                 "example"]

# Not ingredients, or too vague to price.
SKIP_PATTERNS = [r"\brecipe\b", r"skewer", r"\bplank\b", r"of choice", r"to taste", r"for garnish",
                 r"^cold$", r"good-quality", r"high-quality", r"^fresh herbs$", r"sprigs fresh herbs",
                 r"chopped fresh herbs", r"seasoning of choice", r"spice blend", r"turns on a",
                 r"seasonal produce", r"hearty vegetables", r"^bone-in$", r"^skin-on$", r"drippings",
                 r"cooking water", r"brine$", r"^to \d", r"homemade", r"\bbatch\b"]

# Words that describe a form of the ingredient, not a different ingredient.
DESCRIPTORS = {"fresh", "dried", "dry", "chopped", "minced", "sliced", "diced", "whole", "large",
               "small", "medium", "frozen", "raw", "cooked", "uncooked", "shredded", "grated",
               "crumbled", "thin", "thick", "slice", "cut", "peeled", "pitted", "boneless",
               "skinless", "bone", "skin", "organic", "plain", "unsalted", "salted", "low",
               "sodium", "reduced", "fat", "free", "extra", "virgin", "baby", "package", "bag",
               "can", "jar", "link", "piece", "inch", "ounce", "oz", "lb", "pound", "block",
               "loaf", "head", "bunch", "chilled", "softened", "melted", "room", "temperature",
               "well", "stirred", "shaken", "quality", "store", "bought", "homemade", "favorite",
               "deli", "style", "size", "about", "packed", "lightly", "firmly", "fine", "finely",
               "coarse", "coarsely", "roughly", "drained", "rinsed", "a", "an", "the", "of", "and",
               "for", "or", "with", "in", "to", "on", "total", "shelled", "prepared", "precooked"}

DESCRIPTOR_STEMS = {w for d in DESCRIPTORS for w in find_product.words(d)}

# Allergen and diet tags, guessed from words in the name; review them.
TAG_WORDS = {
    "DAIRY": ["cheese", "milk", "cream", "butter", "yogurt", "ricotta", "mozzarella", "brie",
              "gouda", "gorgonzola", "burrata", "fraiche", "buttermilk", "parmesan", "camembert",
              "mascarpone", "ghee", "whey", "fromage", "caciocavallo", "scamorza", "queso"],
    "GLUTEN": ["flour", "bread", "pasta", "noodle", "roll", "bagel", "biscuit", "cracker", "pita",
               "tortellini", "wrapper", "barley", "farro", "bulgur", "couscous", "semolina", "wheat",
               "panko", "beer", "cookie", "muffin", "bun", "lasagna", "ramen", "orzo", "ciabatta",
               "sourdough", "croissant", "pretzel", "seitan", "granola", "cereal"],
    "EGG": ["egg", "mayonnaise", "mayo", "aioli", "meringue"],
    "FISH": ["salmon", "tuna", "cod", "trout", "anchov", "branzino", "halibut", "snapper", "bonito",
             "fish", "sardine", "mackerel", "tilapia", "haddock", "swordfish"],
    "SHELLFISH": ["shrimp", "crab", "clam", "lobster", "scallop", "mussel", "oyster", "calamari",
                  "squid", "prawn", "crawfish"],
    "TREE_NUT": ["almond", "cashew", "pecan", "walnut", "pistachio", "macadamia", "hazelnut",
                 "pine nut", "brazil nut", "praline", "marzipan", "amaretti"],
    "PEANUT": ["peanut"],
    "SOY": ["soy", "tofu", "edamame", "miso", "tamari", "tempeh"],
    "MEAT": ["beef", "pork", "ham", "bacon", "sausage", "chorizo", "lamb", "prosciutto", "salami",
             "pepperoni", "steak", "ribs", "carnitas", "short rib", "chuck", "guanciale", "veal",
             "venison", "bratwurst", "kielbasa", "lard", "meatball", "brisket", "knuckle"],
    "POULTRY": ["chicken", "turkey", "duck", "quail"],
    "HONEY": ["honey"],
    "GELATIN": ["gelatin", "marshmallow", "gummy", "gummies"],
}
NOT_DAIRY = ["coconut", "almond", "oat", "soy", "dairy-free", "peanut", "cashew", "cream of tartar",
             "ice cream cone", "eggplant"]
PANTRY_WORDS = ["spice", "seasoning", "extract", "flour", "sugar", "oil", "vinegar", "syrup", "salt",
                "powder", "seed", "dried", "baking", "starch", "bouillon", "sauce", "paste", "jam",
                "preserves", "honey", "molasses"]


# ---------- helpers ----------

def words(text):
    return find_product.words(text)


def core_words(text):
    """The words that say what it is: '1 lb. thin sliced deli ham' -> {ham}."""
    text = re.sub(r"\s+(packed|in|for|or|with)\s.*$", "", text.lower())  # "anchovies packed in oil"
    return {w for w in words(text) if w not in DESCRIPTOR_STEMS and not w.isdigit()}


def guess_tags(name):
    lower = name.lower()
    tags = []
    for tag, needles in TAG_WORDS.items():
        if any(n in lower for n in needles):
            if tag == "DAIRY" and any(n in lower for n in NOT_DAIRY):
                continue
            if tag == "EGG" and "eggplant" in lower:
                continue
            tags.append(tag)
    return "|".join(tags)


def guess_pantry(name):
    return "true" if any(w in name.lower() for w in PANTRY_WORDS) else ""


def read_catalog():
    with open(SEED_PATH, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def catalog_terms(rows):
    """Every name and alias -> the catalog row name it belongs to."""
    terms = {}
    for r in rows:
        for term in [r["name"], *find_fdc.split_list(r.get("aliases"))]:
            terms[term.lower()] = r["name"]
    return terms


def suggest_alias(name, terms):
    """(catalog row, loose) for the catalog term whose words are all in this name and whose
    last word is the name's last word. loose = the name has words the term doesn't, so it may
    be a different thing ("ginger beer" -> beer): flagged in the note for review."""
    mine = core_words(name)
    if not mine:
        return None
    last = sorted(words(re.sub(r"\s+(packed|in|for|or|with)\s.*$", "", name.lower())) & mine,
                  key=lambda w: name.lower().rfind(w[:4]))[-1:]
    best, best_size = None, 0
    for term, owner in terms.items():
        theirs = core_words(term)
        if theirs and theirs <= mine and (not last or last[0] in theirs) and len(theirs) > best_size:
            best, best_size = owner, len(theirs)
    return (best, best_size < len(mine)) if best else (None, False)


def fdc_search(session, api_key, query):
    FDC_CACHE.mkdir(parents=True, exist_ok=True)
    path = FDC_CACHE / (re.sub(r"[^a-z0-9]+", "_", query.lower()).strip("_")[:80] + ".json")
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    foods = find_fdc.search(session, api_key, query)
    slim = [{"fdcId": f["fdcId"], "description": f["description"], "dataType": f.get("dataType")}
            for f in foods]
    path.write_text(json.dumps(slim), encoding="utf-8")
    return slim


def kroger_pick(name):
    """Best Kroger product for a name, scored like find_product.py."""
    results = find_product.search_cached(name, name, refresh=False)
    scored = [(find_product.score(name, p), i, p) for i, p in enumerate(results)]
    priced = sorted([s for s in scored if s[0] is not None and s[0][0] > 0],
                    key=lambda s: tuple(-x for x in s[0]) + (s[1],))
    return find_product.as_row(name, priced[0][2]) if priced else None


def clean_name(name):
    """A tidier row name: drop leading sizes and packaging ("6-oz. pieces atlantic salmon")."""
    n = name.lower().strip(" )(")
    n = re.sub(r"^[\d\-/.\"']+\s*(oz\.?|ounce|pound|lb\.?|inch)?\s*", "", n)
    n = re.sub(r"^(package|packages|bag|can|cans|jar|links|link|pieces|piece|block|bottle|"
               r"thin slices|thick slices|slices|ounce|pound)\s+(of\s+)?", "", n)
    n = re.sub(r"\s+(packed|for|or)\s.*$", "", n)
    parts = n.split()
    while len(parts) > 1 and parts[0].strip(",") in DESCRIPTORS | {"skin-on", "bone-in", "boneless", "low-moisture"}:
        parts.pop(0)  # "crumbled gorgonzola cheese" -> "gorgonzola cheese"
    return " ".join(parts).strip() or name.lower()


# ---------- build ----------

def build():
    if not GAPS_PATH.exists():
        sys.exit(f"No {GAPS_PATH}. Run python catalog_report.py first.")
    with open(GAPS_PATH, newline="", encoding="utf-8") as f:
        gaps = [g for g in csv.DictReader(f) if g["reason"] == "UNMATCHED"]

    catalog = read_catalog()
    terms = catalog_terms(catalog)
    used_ids = {r["fdc_id"].strip(): r["name"] for r in catalog if r.get("fdc_id", "").strip()}
    previous = {}
    if REVIEW_PATH.exists():  # keep edits from an earlier build
        with open(REVIEW_PATH, newline="", encoding="utf-8") as f:
            previous = {r["reported_name"]: r for r in csv.DictReader(f)}

    api_key = require_env("DATA_GOV_API_KEY")
    session = requests.Session()
    out, counts = [], {"alias": 0, "new": 0, "skip": 0, "kept": 0}
    print(f"Building suggestions for {len(gaps)} unmatched names...")
    try:
        for i, gap in enumerate(gaps, start=1):
            reported = gap["name"].strip().lower()
            if reported in previous:
                out.append({**previous[reported], "lines": gap["lines"], "completes": gap["completes"]})
                counts["kept"] += 1
                continue
            row = {f: "" for f in REVIEW_FIELDS}
            row.update(reported_name=reported, lines=gap["lines"], completes=gap["completes"],
                       example=gap.get("example", ""), name=clean_name(reported))

            if any(re.search(p, reported) for p in SKIP_PATTERNS):
                row["action"] = "skip"
            elif (match := suggest_alias(reported, terms))[0]:
                row.update(action="alias", alias_of=match[0],
                           note="loose match: check it's the same thing" if match[1] else "")
            else:
                foods = fdc_search(session, api_key, row["name"])
                if foods:
                    top = foods[0]
                    row.update(fdc_id=str(top["fdcId"]), fdc_description=top["description"],
                               fdc_alternatives=" | ".join(f'{f["fdcId"]} {f["description"]}'
                                                           for f in foods[1:4]))
                owner = used_ids.get(row["fdc_id"])
                if owner:
                    row.update(action="alias", alias_of=owner,
                               note=f"FDC food already used by '{owner}'")
                elif not foods:
                    row.update(action="skip", note="no FDC match: set fdc_id by hand to keep it")
                else:
                    row.update(action="new", tags=guess_tags(row["name"]), pantry=guess_pantry(row["name"]))
                    # later variants of this ingredient ("gorgonzola dolce") alias onto it
                    used_ids[row["fdc_id"]] = row["name"]
                    terms[row["name"]] = row["name"]
                    try:
                        pick = kroger_pick(row["name"])
                    except RuntimeError as e:
                        pick, row["note"] = None, f"Kroger search failed: {e}"
                    if pick:
                        row.update(kroger_product_id=pick["product_id"], kroger_label=pick["label"],
                                   kroger_size=pick["size"], kroger_price=pick["price"])
                    else:
                        row["note"] = (row["note"] + "; " if row["note"] else "") + \
                            "no Kroger product: add a prices_seed.csv row"
            counts[row["action"]] += 1
            out.append(row)
            print(f"  [{i}/{len(gaps)}] {row['action']:<5} {reported[:40]:<40} "
                  f"{row['alias_of'] or row['fdc_description'][:40]}")
    except (RuntimeError, requests.RequestException) as e:
        print(f"\nStopped early: {e}\nWhat's done is saved; rerun build to continue.")
    except KeyboardInterrupt:
        print("\nInterrupted. What's done is saved; rerun build to continue.")
    finally:
        # biggest wins first
        out.sort(key=lambda r: (-int(r["completes"] or 0), -int(r["lines"] or 0), r["reported_name"]))
        with open(REVIEW_PATH, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=REVIEW_FIELDS, extrasaction="ignore")
            w.writeheader()
            w.writerows(out)

    print(f"\nWrote {REVIEW_PATH.name}: {counts['alias']} alias, {counts['new']} new, "
          f"{counts['skip']} skip ({counts['kept']} kept from your earlier edits).")
    print("Review it (action, alias_of, name, fdc_id, tags, kroger_product_id), then: python bulk_gaps.py apply")


# ---------- apply ----------

def apply():
    if not REVIEW_PATH.exists():
        sys.exit("No bulk_review.csv. Run python bulk_gaps.py build first.")
    with open(REVIEW_PATH, newline="", encoding="utf-8-sig") as f:  # -sig: Excel adds a BOM
        review = list(csv.DictReader(f))

    catalog = read_catalog()
    by_name = {r["name"]: r for r in catalog}
    terms = catalog_terms(catalog)
    mapping = find_product.read_mapping()
    problems, added_alias, added_rows, added_products = [], 0, 0, 0

    def add_alias(row_name, term):
        nonlocal added_alias
        term = term.strip().lower()
        if not term or term == row_name or term in terms:
            return
        target = by_name[row_name]
        target["aliases"] = "|".join([*find_fdc.split_list(target["aliases"]), term])
        terms[term] = row_name
        added_alias += 1

    # new rows first, so aliases can point at them
    review.sort(key=lambda r: (r.get("action") or "").strip().lower() != "new")
    for r in review:
        action = (r.get("action") or "").strip().lower()
        reported = (r.get("reported_name") or "").strip().lower()
        if action in ("", "skip"):
            continue
        if action == "alias":
            owner = (r.get("alias_of") or "").strip().lower()
            if owner not in by_name:
                problems.append(f"'{reported}': alias_of '{owner}' is not a catalog name")
                continue
            add_alias(owner, reported)
        elif action == "new":
            name = (r.get("name") or reported).strip().lower()
            fdc_id = (r.get("fdc_id") or "").strip()
            if not fdc_id:
                problems.append(f"'{reported}': new row needs an fdc_id")
                continue
            if name in by_name:  # two reported names cleaned to the same row: just alias
                add_alias(name, reported)
                continue
            if name in terms:
                problems.append(f"'{reported}': name '{name}' is already an alias of '{terms[name]}'")
                continue
            new = {"name": name, "query": name, "fdc_id": fdc_id,
                   "fdc_description": (r.get("fdc_description") or "").strip(),
                   "aliases": "", "tags": (r.get("tags") or "").strip(),
                   "pantry": "true" if (r.get("pantry") or "").strip().lower() == "true" else ""}
            catalog.append(new)
            by_name[name] = new
            terms[name] = name
            added_rows += 1
            add_alias(name, reported)
            product = (r.get("kroger_product_id") or "").strip()
            if product and not any(m["ingredient"] == name and m["product_id"] == product for m in mapping):
                mapping.append({"ingredient": name, "product_id": product,
                                "label": r.get("kroger_label", ""), "size": r.get("kroger_size", ""),
                                "sold_by": "", "price": r.get("kroger_price", ""), "active": "true"})
                added_products += 1
        else:
            problems.append(f"'{reported}': unknown action '{action}' (use alias, new or skip)")

    problems += find_fdc.validate(catalog)
    if problems:
        print("Nothing written. Fix these in bulk_review.csv:")
        for p in problems:
            print("  " + p)
        sys.exit(1)

    find_fdc.write_rows(catalog)
    find_product.write_mapping(mapping)
    print(f"Added {added_rows} catalog rows, {added_alias} aliases, {added_products} Kroger products.")
    print("Next: python seed_ingredients.py, then python finish_round.py")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["build", "apply"])
    args = parser.parse_args()
    build() if args.command == "build" else apply()


if __name__ == "__main__":
    main()
