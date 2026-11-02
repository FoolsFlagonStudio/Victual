"""Everything after a catalog or price change, in order, in one command.

    python finish_round.py            # all steps
    python finish_round.py --from 4   # pick up at a step after a failure

  1. seed_ingredients.py         new catalog rows, aliases and portions
  2. find_product.py --post      Kroger product mappings
  3. import_prices.py seed       hand prices from prices_seed.csv
  4. prices/refresh              re-price every active Kroger product
  5. recipes/reprocess           re-match recipe lines against the catalog
  6. prices/recalculate          recipe costs
  7. catalog_report.py           what's still missing (cache/catalog_gaps.csv)

The backend calls can take several minutes each with ~800 recipes; this waits for them
(no 2-minute timeout). Backend must be running, and restarted if you pulled Java changes.
"""
import argparse
import json
import subprocess
import sys
import time

import requests

from common import API_URL, require_env

STEPS = [
    ("seed catalog", ["seed_ingredients.py"]),
    ("post Kroger products", ["find_product.py", "--post"]),
    ("import hand prices", ["import_prices.py", "seed"]),
    ("refresh Kroger prices", "/api/admin/prices/refresh"),
    ("reprocess recipes", "/api/admin/recipes/reprocess"),
    ("recalculate costs", "/api/admin/prices/recalculate"),
    ("catalog report", ["catalog_report.py"]),
]


def run(step):
    label, what = step
    if isinstance(what, list):
        result = subprocess.run([sys.executable, *what])
        return result.returncode == 0
    resp = requests.post(f"{API_URL}{what}", headers={"X-Admin-Key": require_env("FORKAST_ADMIN_KEY")},
                         timeout=None)
    if resp.status_code >= 400:
        print(f"  {resp.status_code}: {resp.text[:300]}")
        return False
    print("  " + json.dumps(resp.json())[:400])
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--from", dest="start", type=int, default=1, help="step number to start at")
    args = parser.parse_args()
    try:
        requests.get(f"{API_URL}/actuator/health", timeout=5)
    except requests.RequestException:
        sys.exit(f"Can't reach the backend at {API_URL}. Start it first.")

    for number, step in enumerate(STEPS, start=1):
        if number < args.start:
            continue
        print(f"\n[{number}/{len(STEPS)}] {step[0]}")
        started = time.time()
        if not run(step):
            sys.exit(f"\nStep {number} failed. Fix it, then: python finish_round.py --from {number}")
        print(f"  done in {time.time() - started:.0f}s")
    print("\nAll steps done. Send cache/catalog_gaps.csv for the next pass.")


if __name__ == "__main__":
    main()
