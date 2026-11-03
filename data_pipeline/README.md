# Victual Data Pipeline

Python scripts that build Victual's ingredient catalog from USDA FoodData Central, scrape recipe pages with [`recipe-scrapers`](https://github.com/hhursev/recipe-scrapers), and set up prices (Kroger product mapping, BLS average prices, seed prices), then send everything to the backend's admin API.

> **Status:** working. The catalog has 153 ingredients, the first scrape imported 17 recipes from 2 sites, and 152 ingredients are mapped to Kroger products.

## Responsibilities

The scripts only **fetch and forward**. They never parse ingredient lines, match ingredients, compute nutrition or unit prices, or assign dietary labels; the backend owns all of that (see [../backend/README.md](../backend/README.md#recipe-ingestion)).

Keeping the scripts thin means parsing rules live in one place, and the backend can re-process saved recipes after a fix without re-scraping.

## Files

| File                         | Purpose                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common.py`                  | Loads `.env`, the backend URL, cache and log folders, the User-Agent, and `post_json` (adds the `X-Admin-Key` header)                                               |
| `ingredients_seed.csv`       | The curated ingredient catalog: `name, query, fdc_id, fdc_description, aliases, tags, pantry` (aliases and tags are `\|`-separated; `pantry` is `true` for staples) |
| `set_pantry.py`              | Marks the pantry staples (salt, oils, vinegars, dried spices, flour, sugar, leaveners) in `ingredients_seed.csv`; safe to re-run                                    |
| `find_fdc.py`                | Fills in blank `fdc_id`s by searching FDC; writes alternatives to `cache/fdc_candidates.csv`                                                                        |
| `fdc_lookup.py`              | Prints the FDC description for one or more ids, to check a hand-picked id                                                                                           |
| `seed_ingredients.py`        | Fetches each food from FDC, extracts macros and portions, posts to the import route                                                                                 |
| `urls.txt`                   | Recipe URLs, one per line; `#` lines are comments                                                                                                                   |
| `urls_breakfast_lunch.txt`   | 44 Budget Bytes breakfast and lunch URLs, scraped so every meal slot has candidates                                                                                 |
| `scrape_recipes.py`          | Fetches, caches, scrapes and posts recipes; writes a JSON log to `logs/`                                                                                            |
| `samples/ingest_sample.json` | A hand-written batch for testing the ingest route                                                                                                                   |
| `import_prices.py`           | `bls` imports the latest BLS average prices for `bls_series.csv`; `seed` imports `prices_seed.csv`                                                                  |
| `bls_series.csv`             | Catalog ingredient to BLS series id and size (23 series that BLS still publishes)                                                                                   |
| `prices_seed.csv`            | Hand-entered prices for ingredients no other source covers; `#` lines are comments                                                                                  |
| `kroger.py`                  | Kroger app token and product search                                                                                                                                 |
| `find_product.py`            | Maps catalog ingredients to Kroger products in `kroger_products.csv`; `--post` sends the mapping                                                                    |
| `kroger_products.csv`        | `ingredient, product_id, label, size, sold_by, price, active`: the reviewed mapping the weekly refresh re-prices                                                    |
| `cache/`, `logs/`            | Cached FDC responses and HTML, run logs; both gitignored                                                                                                            |

## Setup

From `data_pipeline/` in Git Bash:

```bash
python -m venv .venv
source .venv/Scripts/activate      # run this in every new terminal
pip install -r requirements.txt
cp .env.example .env               # then fill in the values
```

| `.env` setting                             | Value                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `FORKAST_API_URL`                          | `http://localhost:8080`                                                                                                        |
| `FORKAST_ADMIN_KEY`                        | `openssl rand -hex 32`; the same value goes in the backend's `forkast.admin.api-key`                                           |
| `DATA_GOV_API_KEY`                         | A free key from [api.data.gov](https://api.data.gov/signup) (1,000 FDC requests per hour)                                      |
| `SCRAPER_CONTACT_EMAIL`                    | An address site owners can reach you at; sent in every request's User-Agent                                                    |
| `BLS_API_KEY`                              | Optional free key from [BLS](https://data.bls.gov/registrationEngine/); raises the request limits                              |
| `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET` | From your app at [developer.kroger.com](https://developer.kroger.com); same values as the backend's `forkast.pricing.kroger.*` |
| `KROGER_BASE_URL`                          | `https://api-ce.kroger.com` for a certification app; `https://api.kroger.com` in production                                    |
| `KROGER_LOCATION_ID`                       | `01400513` (Kroger On the Rhine, Cincinnati); must match the backend's store                                                   |

`.env` is gitignored. `.env.example` is committed with blank values; never put real keys in it.

## Ingredient catalog

```bash
python find_fdc.py            # fill blank fdc_ids, then review the matches
python fdc_lookup.py 174036   # check a hand-picked id
python set_pantry.py          # mark pantry staples (only writes when something changed)
python seed_ingredients.py --dry-run
python seed_ingredients.py    # 0 created / N updated on a re-run
```

**Pantry staples.** A row with `pantry=true` goes in the grocery list's "check your pantry" group and counts at what the week uses (the teaspoon, not the jar) unless the user marks it "need to buy". `set_pantry.py` keeps the list of staples in one place; the flag only reaches the backend when `seed_ingredients.py` runs with the backend up. Check with `select count(*) from ingredients where pantry_staple;`.

**Picking FDC foods.** `find_fdc.py` searches SR Legacy first, because its household portions ("1 large", "1 cup, chopped", "1 clove") are what recipe conversion needs; Foundation is the fallback. FDC search ranking is unreliable, so read every `fdc_description`. Watch for restaurant brands, cooked versions, branded items, and the wrong animal ("ground beef" matched ground turkey). Fix a row by pasting an id from `cache/fdc_candidates.csv`, or by clearing `fdc_id`, editing `query`, and re-running. A word starting with `-` in a query excludes that word, and `/` makes FDC return 400.

**Checks before any API call.** Names must be lowercase and unique, aliases can't repeat across rows, tags must be valid, and two rows can't share an `fdc_id` (the backend updates by it).

**Extraction** (`seed_ingredients.py`):

| Value               | From                                                                                                                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calories            | Nutrient 208; 958, then 957 (Atwater) for Foundation foods that lack 208                                                                                                                                                                  |
| Protein, carbs, fat | Nutrients 203, 205, 204                                                                                                                                                                                                                   |
| Portions            | `foodPortions`: Foundation keeps the unit in `measureUnit.name`; SR Legacy sets it to "undetermined" and puts it in `modifier`. Stored as the weight of ONE unit (0.5 cup = 44 g becomes cup = 88 g). RACC and NLEA servings are skipped. |

All values are per 100 g. Negative values (carbs "by difference" can come out slightly below zero) are clamped to 0.

**Tags** drive dietary labels: MEAT, POULTRY, FISH, SHELLFISH, DAIRY, EGG, GLUTEN, TREE_NUT, PEANUT, SOY, HONEY, GELATIN. Broths carry POULTRY or MEAT; Worcestershire carries FISH (anchovies).

## Scraping recipes

```bash
python scrape_recipes.py --dry-run   # fetch and cache, print one payload, post nothing
python scrape_recipes.py             # post (reads the cache, so the sites aren't hit again)
```

### Rules the script follows

- Checks each site's `robots.txt` and skips disallowed paths. A missing robots.txt allows everything; 401/403 or an unreachable one means the site is skipped.
- One request at a time, 3 to 5 seconds apart per site, or the site's `Crawl-delay` if longer.
- Identifies itself with `VictualRecipeBot/0.1 (personal project; contact <email>)`.
- Caches every page in `cache/html/`, so re-runs never download a page twice.
- Never works around logins, paywalls or bot protection. Damn Delicious returns 403 to automated requests, so it is not used.
- Read a site's terms of use before adding it to `urls.txt`.

**Sites in use:** sipandfeast.com and budgetbytes.com (both supported by `recipe-scrapers`). Unsupported sites fall back to schema.org data (`supported_only=False`).

### Copyright

Ingredient lists are facts and generally not protected; instructions, descriptions and photos usually are. Storing them for local development and a portfolio demo is fine. Before a public release, choose one: show ingredients, nutrition and cost with a link to the source for instructions; use a licensed recipe API; use recipes you have rights to; or ask sources for permission. Keep `source_url` and show attribution either way. This is not legal advice.

## Prices

The backend owns all pricing math (see [../backend/README.md](../backend/README.md#pricing)). These scripts choose products and send raw prices.

### BLS average prices

```bash
python import_prices.py bls --dry-run   # fetch and print, post nothing
python import_prices.py bls             # post; already-stored months are skipped
```

Each price is dated at the end of its month, so the backend's 60-day window keeps the newest month current until the next is published (about two weeks after a month ends). BLS stopped publishing many series (onions, carrots, celery, peppers, broccoli, mushrooms, apples...); those were removed from `bls_series.csv` and Kroger covers them. The raw response is cached in `cache/bls/`.

### Kroger product mapping

```bash
python find_product.py                     # search for every ingredient without a row
python find_product.py --only "lime" --query "fresh limes"   # redo one with other words
python find_product.py --post              # send kroger_products.csv to the backend
curl -X POST -H "X-Admin-Key: $KEY" http://localhost:8080/api/admin/prices/refresh
```

`find_product.py` searches the configured store and keeps the best guess, in this order: has a price; most words of the ingredient name; not organic unless asked and not a drink or snack; the fewest other words, so "garlic" picks fresh garlic over Parmesan Garlic Knots and "onion" a yellow onion over onion rings (brand words don't count); then Kroger's store brand. The top 5 per ingredient go to `cache/kroger_candidates.csv`. Searches are cached in `cache/kroger/search/` (`--only` always searches again).

**Review before posting.** Search ranking is a first guess:

- "lemon" and "lime" return lemon-lime soda first; "cashews" returned cashew milk.
- Prefer products with a weight in the size ("16 oz", "3 lb") or sold by weight. "1 each" or "1 ct" items get a price per 100 g only when Kroger gives the package weight; otherwise only a price per item, and cup or teaspoon lines stay unpriced.
- Fresh herbs at this store come in 0.5 oz packages, which makes herb-heavy recipes expensive. Look for larger packages or use dried.
- Watch for premium brands and case listings ("24 ct / 14.5 oz" priced per can). When the store brand doesn't come up, search with the words it uses: `--query "long grain white rice"`, `--query "roma tomatoes"`.
- The grocery list buys from these products in whole packages, so a wrong pick shows up there first (onion rings for onion, sherry vinegar for olive oil).

Fix a pick by pasting a `product_id` from the candidates, add a second row as a backup (the cheaper one per 100 g wins), or set `active` to `false`. When `--only` finds a new match it keeps the old row with `active=false`, so `--post` switches it off in the backend and its old prices stop counting; delete those rows after posting. A search that finds nothing leaves the existing row alone.

### Seed prices

For ingredients neither Kroger nor BLS covers. Add rows to `prices_seed.csv` (`ingredient,price,size,note`, size like a store label: `1 lb`, `16 oz`, `1 dozen`), then `python import_prices.py seed`. Editing a price and re-running adds a new row; unchanged rows are skipped.

### Checking prices

```sql
-- Latest price per active Kroger product, highest per 100 g first (spices at the top are normal)
with latest as (
  select distinct on (p.ingredient_id, p.external_id)
         i.name, p.price_per_100g, p.price_per_item, p.size_text, p.price
  from ingredient_prices p
  join ingredients i on i.id = p.ingredient_id
  join ingredient_products m on m.ingredient_id = p.ingredient_id
       and m.external_id = p.external_id and m.source = 'KROGER' and m.active
  where p.source = 'KROGER'
  order by p.ingredient_id, p.external_id, p.recorded_at desc
)
select * from latest order by price_per_100g desc nulls last;

-- Recipe costs
select name, cost_per_serving, cost_complete from recipes order by cost_per_serving nulls last;
```

## Backend contract

All routes require the `X-Admin-Key` header.

### `POST /api/admin/ingredients/import` (up to 50)

```json
{
  "ingredients": [
    {
      "fdcId": 171077,
      "name": "chicken breast",
      "aliases": ["chicken breasts"],
      "tags": ["POULTRY"],
      "pantryStaple": false,
      "caloriesPer100g": 120.0,
      "proteinGPer100g": 22.5,
      "carbsGPer100g": 0.0,
      "fatGPer100g": 2.62,
      "portions": [{ "description": "piece", "gramWeight": 272.0 }]
    }
  ]
}
```

Response: `{ "created": 50, "updated": 0 }`. Matching on `fdcId` makes re-runs safe.

### `POST /api/admin/recipes/ingest` (up to 25)

```json
{
  "recipes": [
    {
      "sourceUrl": "https://www.sipandfeast.com/chicken-riggies/",
      "host": "sipandfeast.com",
      "name": "Chicken Riggies",
      "description": "...",
      "prepTimeMinutes": 5,
      "cookTimeMinutes": 40,
      "yields": "6 servings",
      "rawIngredients": [
        "1 pound (454g) rigatoni",
        "8 cloves garlic (chopped)"
      ],
      "rawInstructions": ["Bring a large pot of salted water to boil.", "..."],
      "imageUrl": "https://...",
      "category": "Main Course",
      "cuisine": "Italian",
      "keywords": ["chicken riggies"]
    }
  ]
}
```

Response: `{ "created": 17, "skippedDuplicate": 0, "failed": [{ "sourceUrl": "...", "reason": "..." }], "needsReview": 41 }`. A bad recipe is listed in `failed` without affecting the rest. `yields` is sent raw and parsed by the backend; missing fields are sent as `null`. Nutrition is never sent: the backend computes it.

### `POST /api/admin/prices/import` (up to 200)

```json
{
  "prices": [
    {
      "ingredient": "chicken breast",
      "source": "BLS",
      "price": 4.17,
      "size": "1 lb",
      "externalId": "APU0000FF1101",
      "recordedAt": "2026-09-01T00:00:00Z",
      "storeName": "BLS U.S. city average"
    }
  ]
}
```

`ingredient` is a catalog name or alias. `source` is `BLS`, `SEED`, `MANUAL` or `OPEN_PRICES` (Kroger prices only come from the refresh). `recordedAt` defaults to now. Response: `{ "imported": 23, "skipped": 0, "failed": [{ "ingredient": "...", "reason": "..." }], "recipesRecosted": 19 }`.

### `POST /api/admin/prices/products` (up to 500)

```json
{
  "products": [
    {
      "ingredient": "onion",
      "source": "KROGER",
      "externalId": "0001111091682",
      "label": "Kroger Yellow Onion 3 lb Bag",
      "active": true
    }
  ]
}
```

Matches on ingredient + source + product id, so re-posting updates labels and `active` instead of duplicating. Response: `{ "created": 3, "updated": 3, "unchanged": 149, "failed": [] }`.

### Review and re-processing

| Route                                                           | Use                                                                                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/admin/recipe-ingredients/needs-review?page=0&size=50` | Lines that didn't match confidently, grouped by parsed name                                                                                     |
| `PATCH /api/admin/recipe-ingredients/{id}`                      | `{ "ingredientId": "...", "saveAlias": true }` matches the line, saves its name as an alias, and matches every other queued line with that name |
| `POST /api/admin/recipes/reprocess`                             | Re-parses saved recipes after a parser or catalog change (`?rematchAll=true` also re-matches already-matched lines)                             |

```bash
KEY=$(grep FORKAST_ADMIN_KEY .env | cut -d= -f2 | tr -d '\r')
curl -s "http://localhost:8080/api/admin/recipe-ingredients/needs-review?size=100" -H "X-Admin-Key: $KEY" | python -m json.tool
curl -s -X POST "http://localhost:8080/api/admin/recipes/reprocess" -H "X-Admin-Key: $KEY"
```

## Cleanup: getting every recipe a complete cost

**Fast path for the long tail:** `python bulk_gaps.py build` turns every UNMATCHED name in the last report into `bulk_review.csv` with a suggested action (alias of an existing row, new row with FDC food, tags and a Kroger product, or skip). Review it in a spreadsheet, `python bulk_gaps.py apply`, then `python finish_round.py`, which runs seed, product post, hand prices, price refresh, reprocess, recalculate and the report in one go (`--from N` resumes after a failure).


`catalog_report.py` lists everything that keeps recipes from a complete cost, biggest fixes first, and writes the full list with a next step per row to `cache/catalog_gaps.csv`.

```bash
python catalog_report.py                    # summary + top 30
python catalog_report.py --reason NO_PRICE --top 100
```

| Gap | Means | Fix |
| --- | --- | --- |
| `UNMATCHED` | No catalog ingredient matched the line ("paccheri") | A new row or alias in `ingredients_seed.csv` (then `find_fdc.py`, `seed_ingredients.py`), or a match in the review queue |
| `NO_PRICE` | The ingredient has no current price | `find_product.py --only "name"` (review, then `--post` and refresh), a BLS series, or a row in `prices_seed.csv` |
| `NO_CONVERSION` | There's a price, but it doesn't fit the line's unit ("1 bunch" with only a price per 100 g and no bunch weight) | A portion for that unit (FDC household portions), or a per-item price |

`completes` is how many recipes that one fix finishes on its own, so start at the top. The loop:

1. `python catalog_report.py`, then fix a batch from the top of the list.
2. Catalog changes (new rows, aliases): `seed_ingredients.py`, then `POST /api/admin/recipes/reprocess` so saved recipes re-match.
3. Price changes: `find_product.py --post` + `POST /api/admin/prices/refresh`, or `import_prices.py seed`. Imports re-cost recipes themselves; otherwise `POST /api/admin/prices/recalculate`.
4. Run the report again.

When it's down to rare one-off ingredients, run `POST /api/admin/recipes/rescore` and then the plan sweep (`sweep_plans.py --fresh --write-app`).

## Improving the catalog over time

1. Scrape more recipes.
2. Find what didn't match, most common first:
   ```sql
   select ri.parsed_name, count(*) as times, max(ri.match_score) as best_score, min(ri.raw_text) as example
   from recipe_ingredients ri
   where ri.needs_review
   group by ri.parsed_name
   order by times desc;
   ```
3. Fix the cause: a parser pattern (backend), a new alias or row in `ingredients_seed.csv`, or a manual match in the review queue.
4. Re-run `find_fdc.py` and `seed_ingredients.py` for catalog changes, then `POST /api/admin/recipes/reprocess`.

Planned for the next catalog pass: cooked rice, pasta and grains ("cooked white rice" currently matches raw rice, inflating calories); white wine, pecorino, capers, olives, pine nuts, molasses and canned green chiles; aliases for pasta shapes (paccheri, pappardelle, pastina). "cooking oil" was resolved through the review queue and is already an alias of vegetable oil. Find cooked lines with `select ri.raw_text, i.name from recipe_ingredients ri join ingredients i on i.id = ri.ingredient_id where ri.raw_text ilike '%cooked%';`.

## Default recipe counts (plan sweep)

`sweep_plans.py` finds good default "recipes per week" for each budget. For every set of meals (breakfast / lunch / dinner), count per meal (1 to 5) and household size (1, 2, 4), it generates real plans through the API with no budget pressure, so the grocery total is what a typical week with that setting costs. Then, for each budget from $40 to $300, it picks the setting with the most recipes whose typical week still fits with 15% headroom (more dinners and lunches win ties). Onboarding uses the result to prefill "How many recipes would you like?" until the user changes a count.

It needs the backend running and a verified app account used only for this (its preferences are overwritten; it makes and deletes plans for a week in 2031). Put `SWEEP_EMAIL` and `SWEEP_PASSWORD` in `.env`.

```bash
python sweep_plans.py --households 2 --max-count 4 --seeds 1   # quick look, a few minutes
python sweep_plans.py --write-app                               # full sweep (~1,300 plans), then copy into the app
python sweep_plans.py --from-csv --headroom 0.9 --write-app     # re-pick from the last results without re-running
```

`--mode floor` uses a $1 budget instead (the cheapest week), but that's a poor guide: squeezed, the planner leans on recipes with incomplete prices or mostly pantry staples, so everything looks nearly free. Raw runs go to `sweep_results_typical.csv` (or `sweep_results.csv` for floor mode, git-ignored); the picks to `plan_defaults.json` and, with `--write-app`, `mobile/src/onboarding/plan-defaults.json`. Re-run it after a big recipe import or price refresh.
