"""What's keeping recipes from a complete cost, biggest fixes first.

Asks the backend (GET /api/admin/recipes/catalog-report) for every required recipe line
it can't price, grouped into gaps:

  UNMATCHED      no catalog ingredient matched the line ("paccheri")
  NO_PRICE       the ingredient has no current price
  NO_CONVERSION  there's a price, but not one that fits the line's unit ("1 bunch", "1 cup"
                 with only a per-item price)

For each gap: how many recipes have it, and how many it's the ONLY gap in (fixing it
makes those recipes complete). Writes cache/catalog_gaps.csv with a suggested next
step per row, and prints a summary and the top of the list.

    python catalog_report.py             # summary + top 30
    python catalog_report.py --top 100
    python catalog_report.py --reason NO_PRICE
"""
import argparse
import csv
import sys

import requests

from common import API_URL, CACHE_DIR, require_env

OUT = CACHE_DIR / "catalog_gaps.csv"


def next_step(gap):
    name = gap["name"]
    if gap["reason"] == "UNMATCHED":
        return (f'add "{name}" to ingredients_seed.csv (new row, or an alias of an existing one), '
                f"or match it in the review queue")
    if gap["reason"] == "NO_PRICE":
        return f'python find_product.py --only "{name}"  (or a row in prices_seed.csv)'
    return (f'"{gap["unit"]}" of {name} has no gram weight for its price: add an FDC portion for it, '
            f"or a per-item price")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--top", type=int, default=30)
    p.add_argument("--reason", choices=["UNMATCHED", "NO_PRICE", "NO_CONVERSION"])
    args = p.parse_args()

    r = requests.get(f"{API_URL}/api/admin/recipes/catalog-report",
                     headers={"X-Admin-Key": require_env("FORKAST_ADMIN_KEY")}, timeout=600)
    if r.status_code >= 400:
        sys.exit(f"{r.status_code}: {r.text[:300]}")
    report = r.json()
    gaps = [g for g in report["gaps"] if not args.reason or g["reason"] == args.reason]

    CACHE_DIR.mkdir(exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        out = csv.writer(f)
        out.writerow(["reason", "name", "unit", "completes", "recipes", "lines", "pantry", "example", "next_step"])
        for g in gaps:
            out.writerow([g["reason"], g["name"], g["unit"] or "", g["completes"], g["recipes"], g["lines"],
                          "yes" if g["pantry"] else "", g["example"], next_step(g)])

    total = report["recipes"]
    print(f"{report['complete']} of {total} recipes have a complete cost "
          f"({report['complete'] / max(total, 1):.0%}); {report['incomplete']} are missing something.")
    for reason in ("UNMATCHED", "NO_PRICE", "NO_CONVERSION"):
        these = [g for g in report["gaps"] if g["reason"] == reason]
        print(f"  {reason:<14} {len(these):>4} gaps, {sum(g['lines'] for g in these):>5} recipe lines")
    print(f"\nTop {min(args.top, len(gaps))} (completes = recipes that fix alone would finish):")
    print(f"  {'completes':>9} {'recipes':>7}  reason          name")
    for g in gaps[: args.top]:
        unit = f" ({g['unit']})" if g["unit"] else ""
        print(f"  {g['completes']:>9} {g['recipes']:>7}  {g['reason']:<14}  {g['name']}{unit}")
    print(f"\nFull list with next steps: {OUT}")


if __name__ == "__main__":
    main()
