"""Collects recipe URLs from sites' sitemaps into a file scrape_recipes.py can read.

    python collect_urls.py budgetbytes.com sipandfeast.com --per-site 100 --out urls_batch1.txt
    python collect_urls.py --sites my_sites.txt --per-site 150 --out urls_batch2.txt
    python collect_urls.py budgetbytes.com --per-site 100 --out urls_batch3.txt --seed 2   # a different 100
    python collect_urls.py budgetbytes.com simplyrecipes.com --match breakfast --per-site 40 --out urls_breakfast2.txt

Per site it reads robots.txt and the site's sitemaps (the same polite rules as the scraper and
probe_sites.py: one request at a time, 3-5 s apart, our User-Agent, nothing robots.txt
disallows), keeps URLs that look like single recipes, and takes --per-site of them spread
across the whole site rather than the newest posts, so the batch has variety.

Left out:
  - URLs already in any urls*.txt in this folder, so a second batch never repeats the first
  - roundups, articles and site pages ("party-food-recipes", "how-to-...", author pages)
  - desserts, baked sweets and drinks, which never fill a meal slot (--keep-desserts keeps them)
  - sauces, dressings and seasonings ("red-enchilada-sauce"), which are parts of meals
  - per site: Simply Recipes and Downshiftology articles, Home Chef add-ons (protein packs)

--match keeps only URLs whose slug fits a pattern, to aim a batch at a short slot:
"breakfast" is a preset (oats, pancakes, eggs, frittata, muffins...); "lunch" another
(salads, sandwiches, wraps, soups, bowls); anything else is used as a regular expression.

The output interleaves the sites (one from each in turn), so the scraper's per-site wait
rarely holds it up. Review the file, delete anything you don't want, then:

    python scrape_recipes.py urls_batch1.txt --dry-run
    python scrape_recipes.py urls_batch1.txt
"""
import argparse
import random
import re
import sys
from datetime import datetime
from itertools import zip_longest
from urllib.parse import urldefrag, urlparse

import requests

from common import PIPELINE_DIR
from probe_sites import (FALLBACK_SITEMAPS, NOT_RECIPE_SITEMAP, ROUNDUP, Site, looks_like_recipe,
                         parse_sitemap, read_robots)

MAX_SITEMAPS = 25          # per site; a big site splits its posts over many sitemap files
# stop reading sitemaps once there are this many times --per-site URLs
ENOUGH = 8

# Slugs of desserts and drinks, which never fill breakfast, lunch or dinner. A plain "pie"
# isn't here on purpose: pot pie and shepherd's pie are dinners; sweet pies are listed.
NOT_A_MEAL = re.compile(
    r"(^|-)(cookies?|cakes?|cupcakes?|cheesecakes?|brownies?|blondies?|frosting|icing|fudge|"
    r"truffles?|macarons?|macaroons?|cobbler|crumble|crisp|tarts?|pudding|mousse|ice-cream|nice-cream|"
    r"sorbet|gelato|popsicles?|candy|caramel|bark|gummies|flan|panna-cotta|creme-brulee|pavlova|"
    r"shortcake|pizzelle|cuccidati|biscotti|bars|energy-balls|dunkaroos|bananas-foster|"
    r"(strawberry|pecan|pumpkin|apple|cherry|blueberry|peach|lemon|lemon-cream|coconut-cream|"
    r"key-lime|chocolate|sweet-potato)-pie|"
    r"cocktails?|margaritas?|sangria|mojito|martini|manhattan|spritz|toddy|bellini|mocktail|shrub|"
    r"gin-and-tonic|dark-and-stormy|lemonade|latte|juice|float|"
    r"dessert|desserts|sweets)(-|$)", re.I)

# The last word of a slug that makes it a component, not a meal: "red-enchilada-sauce",
# "lemon-tahini-dressing", "homemade-ranch-seasoning-mix". Only for short slugs with no main
# ingredient and no "with/and/in", so "clams-in-red-sauce" and "skirt-steak-with-chimichurri"
# stay, and "salsa-verde-chicken" never matches.
COMPONENT_END = {"sauce", "dressing", "vinaigrette", "seasoning", "mix", "blend", "marinade", "dip",
                 "rub", "salsa", "aioli", "broth", "croutons", "chips", "brine", "compote", "jam",
                 "syrup", "spread", "hummus", "guacamole", "milk", "glaze", "paste", "gremolata",
                 "chimichurri", "pico-de-gallo", "giardiniera"}
MEAL_WORDS = {"chicken", "beef", "pork", "steak", "salmon", "shrimp", "clams", "mussels", "fish", "cod",
              "tuna", "turkey", "ribs", "lamb", "ham", "sausage", "tofu", "pasta", "noodles", "salad",
              "soup", "stew", "chili", "pancakes", "waffles", "eggs", "sandwich", "tacos", "bowl", "rice",
              "potatoes", "asparagus", "beans", "cauliflower", "pizza", "burgers"}

# Articles and site pages rather than recipes
ARTICLE = re.compile(
    r"^(how(?!-to-make)|what|why|when|where|should|is|are|do|does|can|never|our|my|the-best-way|"
    r"one-ingredient|start|tested)-|"
    r"(^|-)(tips?|tricks?|hacks?|upgrade|expert|experts|chefs|giveaway|sweepstakes|survey|interview|"
    r"recalls?|sued|lawsuit|review|reviews|testers|havenly|bedroom|living-room|minimalist|ebook|"
    r"results|theory|swap|secret|label|celebrations|by-state|containers|taste-test)(-|$)", re.I)

# Per-site rules: where a site keeps its recipes, and what else it lists in its sitemaps
SITE_KEEP = {
    # the rest are articles and site pages
    "downshiftology.com": re.compile(r"^/recipes/"),
}
SITE_DROP = {
    # meal-kit add-ons: protein packs, plain fillets, drinks, chocolates
    "homechef.com": re.compile(r"protein-pack|fillets|^steak-strips|^ground-beef-[0-9a-f]{8}|"
                               r"^chicken-breasts?-[0-9a-f]{8}|latte|chocolates(-|$)|"
                               r"^shrimp-[0-9a-f]{8}|^salmon-[0-9a-f]{8}"),
}


def plain_slug(url):
    """The slug with underscores as dashes and a trailing "recipe" or numeric id removed."""
    name = slug(url).lower().replace("_", "-")
    name = re.sub(r"-\d{4,}$", "", name)           # simplyrecipes ids
    return re.sub(r"(-recipe|-recipes)$", "", name)


def not_wanted(url, host, keep_desserts):
    """Why a URL is left out, or None to keep it."""
    path = urlparse(url).path
    keep = SITE_KEEP.get(host.replace("www.", ""))
    if keep and not keep.search(path):
        return "not a recipe page"
    name = plain_slug(url)
    drop = SITE_DROP.get(host.replace("www.", ""))
    if drop and drop.search(name):
        return "not a meal"
    if ROUNDUP.search(name) or ARTICLE.search(name):
        return "roundup or article"
    if not keep_desserts and NOT_A_MEAL.search(name):
        return "dessert or drink"
    words = name.split("-")
    is_component = words[-1] in COMPONENT_END or any(
        name.endswith(c) for c in COMPONENT_END if "-" in c)
    if (is_component and len(words) <= 5 and not {"with", "and", "in"} & set(words)
            and not MEAL_WORDS & set(words)):
        return "sauce, dressing or seasoning"
    return None


# Whole words only, so "egg" doesn't match "veggie" or "eggplant"
MATCH_PRESETS = {
    "breakfast": r"(^|-)(breakfast|brunch|oats|oatmeal|granola|pancakes?|waffles?|french-toast|crepes?|"
                 r"eggs?|omelet|omelette|frittata|quiche|scrambles?|hash|hash-browns|muffins?|biscuits?|"
                 r"scones?|smoothie|parfait|chia|yogurt|bagels?|burritos?|shakshuka|toast)(-|$)",
    "lunch": r"(^|-)(salads?|sandwich|sandwiches|wraps?|panini|pitas?|quesadillas?|soups?|chowder|"
             r"bowls?|lunch|meal-prep|slaw)(-|$)",
}


def already_listed():
    """Every URL in the folder's urls*.txt files."""
    seen = set()
    for path in PIPELINE_DIR.glob("urls*.txt"):
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                seen.add(urldefrag(line)[0].rstrip("/"))
    return seen


def slug(url):
    return urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]


def site_urls(host, want, keep_desserts, match=None):
    """(recipe-looking URLs from the site's sitemaps, a note on what happened)."""
    site = Site(host)
    stop = read_robots(site)
    if stop:
        return [], stop
    named = site.robots.site_maps() if site.robots else None
    queue = list(named or []) + [site.base +
                                 path for path in FALLBACK_SITEMAPS]
    seen, found, read = set(), [], 0
    while queue and read < MAX_SITEMAPS and len(found) < want * ENOUGH:
        url = queue.pop(0)
        if url in seen or not site.allowed(url):
            continue
        seen.add(url)
        try:
            resp, body = site.get(url)
            read += 1
            if resp.status_code != 200:
                continue
            tag, locs = parse_sitemap(body, url)
        except (requests.RequestException, OSError, ValueError) as e:
            print(f"  {host}: skipped {url} ({type(e).__name__})")
            continue
        if tag == "sitemapindex":
            children = [u for u in locs if not NOT_RECIPE_SITEMAP.search(u)]
            # recipe sitemaps first, then post sitemaps, then the rest
            children.sort(key=lambda u: (not re.search(
                r"recipe", u, re.I), not re.search(r"post", u, re.I)))
            queue = children + queue
            continue
        for loc in locs:
            if not looks_like_recipe(loc, host) or not site.allowed(loc):
                continue
            if not_wanted(loc, host, keep_desserts):
                continue
            if match and not match.search(plain_slug(loc)):
                continue
            found.append(loc)
    found = list(dict.fromkeys(found))
    return found, f"{read} sitemaps, {len(found)} recipe URLs"


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("hosts", nargs="*", help="sites, e.g. budgetbytes.com")
    parser.add_argument("--sites", help="a text file of sites, one per line")
    parser.add_argument("--per-site", type=int, default=100,
                        help="URLs to take from each site (default 100)")
    parser.add_argument("--out", required=True,
                        help="file to write, e.g. urls_batch1.txt")
    parser.add_argument("--seed", type=int, default=1,
                        help="change it for a different sample")
    parser.add_argument("--keep-desserts", action="store_true",
                        help="keep desserts and drinks")
    parser.add_argument(
        "--match", help="keep only matching slugs: breakfast, lunch, or a regex")
    args = parser.parse_args()

    hosts = [h.strip().lower() for h in args.hosts]
    if args.sites:
        with open(args.sites, encoding="utf-8") as f:
            hosts += [line.strip().lower()
                      for line in f if line.strip() and not line.startswith("#")]
    hosts = list(dict.fromkeys(hosts))
    if not hosts:
        sys.exit("Name at least one site, or --sites a file of them.")
    out = PIPELINE_DIR / args.out
    if out.exists():
        sys.exit(
            f"{out.name} already exists; pick another --out so earlier batches stay as they were.")

    match = None
    if args.match:
        match = re.compile(MATCH_PRESETS.get(
            args.match.lower(), args.match), re.I)
    listed = already_listed()
    rng = random.Random(args.seed)
    picked = {}
    for host in hosts:
        print(f"{host}: reading sitemaps...")
        try:
            urls, note = site_urls(host, args.per_site,
                                   args.keep_desserts, match)
        except requests.RequestException as e:
            urls, note = [], f"failed ({type(e).__name__})"
        fresh = [u for u in urls if urldefrag(u)[0].rstrip("/") not in listed]
        sample = rng.sample(fresh, min(args.per_site, len(fresh)))
        picked[host] = sample
        print(
            f"  {host}: {note}; {len(urls) - len(fresh)} already listed; took {len(sample)}")

    # one from each site in turn
    ordered = [u for group in zip_longest(
        *picked.values()) for u in group if u]
    header = [f"# collected {datetime.now():%Y-%m-%d %H:%M} by collect_urls.py, seed {args.seed}"
              + (f", match {args.match}" if args.match else "")]
    header += [f"# {host}: {len(urls)}" for host, urls in picked.items()]
    out.write_text("\n".join(header + ordered) + "\n", encoding="utf-8")
    print(
        f"\nWrote {len(ordered)} URLs to {out.name}. Skim it, then: python scrape_recipes.py {out.name}")


if __name__ == "__main__":
    main()
