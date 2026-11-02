"""Sweep meal plan settings to find good default recipe counts per budget.

For every combination of planned meals (breakfast / lunch / dinner), recipes per week
(1 to --max-count each) and household size, it generates real plans through the API with
no budget pressure (a $100,000 budget), so the planner picks the way it normally does: the
grocery total is what a typical week with that setting costs. It writes every run to
sweep_results.csv, then picks, for each budget, the setting with the most recipes (the most
variety) whose typical week still leaves headroom under that budget.

(--mode floor sets the budget to $1 instead. That turned out to be a poor guide: squeezed,
the planner leans on recipes whose prices are incomplete or that are mostly pantry
staples, so every setting looks nearly free.) Those go to
plan_defaults.json, which onboarding uses to prefill "How many recipes would you like?".

It needs a verified app account that's only used for this: its preferences are
overwritten and it makes and deletes plans for a week in 2031.

    SWEEP_EMAIL=... SWEEP_PASSWORD=... in data_pipeline/.env
    python sweep_plans.py                       # full sweep (households 1, 2, 4; counts 1-5; 2 seeds)
    python sweep_plans.py --households 2 --max-count 4 --seeds 1   # quick look
    python sweep_plans.py --from-csv             # re-pick defaults from the last results
    python sweep_plans.py --write-app            # also copy plan_defaults.json into the app

If it stops (the computer sleeps, the backend restarts), run the same command again: it
picks up where it left off. --fresh starts over.

Each run takes a few seconds; the full sweep is about 1,300 runs (typical mode is faster
than floor mode, which re-plans up to 3 times per run to chase the $1 budget).
"""
import argparse
import csv
import itertools
import json
import statistics
import sys
import time
from datetime import datetime, timezone

import requests

from common import API_URL, PIPELINE_DIR, require_env

def results_file(mode):
    """Each mode keeps its own runs (the first sweeps were floor mode, in sweep_results.csv)."""
    return PIPELINE_DIR / ("sweep_results.csv" if mode == "floor" else f"sweep_results_{mode}.csv")
DEFAULTS = PIPELINE_DIR / "plan_defaults.json"
APP_DEFAULTS = PIPELINE_DIR.parent / "mobile" / "src" / "onboarding" / "plan-defaults.json"

SLOTS = ["BREAKFAST", "LUNCH", "DINNER"]
LETTER = {"BREAKFAST": "B", "LUNCH": "L", "DINNER": "D"}
WEEK_START = "2031-01-06"  # a Monday far ahead, so it never meets a real plan
BANDS = list(range(40, 301, 20))  # weekly budgets to recommend for, in USD


class Api:
    """Signed-in calls as the sweep account, logging in again when the token runs out."""

    def __init__(self):
        self.email = require_env("SWEEP_EMAIL")
        self.password = require_env("SWEEP_PASSWORD")
        self.token = None
        self.login()

    def login(self):
        for wait in [5, 15, 30, 60, 60, 60, 60, None]:
            try:
                r = requests.post(f"{API_URL}/api/auth/login", json={"email": self.email, "password": self.password},
                                  timeout=30)
                break
            except (requests.ConnectionError, requests.Timeout):
                if wait is None:
                    sys.exit(f"Can't reach the backend at {API_URL}. Is it running?")
                print(f"  backend unreachable, retrying login in {wait}s...")
                time.sleep(wait)
        if r.status_code >= 400:
            sys.exit(f"Login failed ({r.status_code}): {r.text}")
        self.token = r.json()["accessToken"]

    def call(self, method, path, body=None, ok=(200, 201, 204)):
        """One API call. Rides out the backend being briefly unreachable (the computer
        slept, the backend restarted) by waiting and trying again, up to ~5 minutes."""
        waits = [5, 15, 30, 60, 60, 60, 60]
        for attempt in range(len(waits) + 1):
            try:
                r = requests.request(method, f"{API_URL}{path}", json=body, timeout=120,
                                     headers={"Authorization": f"Bearer {self.token}"})
            except (requests.ConnectionError, requests.Timeout) as e:
                if attempt == len(waits):
                    raise RuntimeError(f"{method} {path}: backend unreachable ({e.__class__.__name__})")
                print(f"  backend unreachable, retrying in {waits[attempt]}s...")
                time.sleep(waits[attempt])
                continue
            if r.status_code == 401:
                self.login()
                continue
            if r.status_code not in ok:
                raise RuntimeError(f"{method} {path} -> {r.status_code}: {r.text[:300]}")
            return r.json() if r.content else None
        raise RuntimeError(f"{method} {path}: gave up")


def preferences(counts, household, budget, leftovers):
    return {
        "weeklyBudget": budget,
        "householdServingSize": household,
        "repeatAvoidanceDays": 0,
        "planStartDay": "MONDAY",
        "prefersMealPrep": False,
        "leftoversForLunch": leftovers,
        "autoPlanEnabled": False,
        "dietaryLabelIds": [],
        "mealSlots": counts,
    }


def clear_week(api):
    """Delete a plan left in the sweep week by an interrupted run."""
    for plan in api.call("GET", "/api/meal-plans?page=0&size=50")["items"]:
        if plan["weekStart"] == WEEK_START:
            api.call("DELETE", f"/api/meal-plans/{plan['id']}")


BUDGET_FOR_MODE = {"typical": 100000.00, "floor": 1.00}


def run_one(api, counts, household, leftovers, mode):
    body = preferences(counts, household, BUDGET_FOR_MODE[mode], leftovers)
    try:
        api.call("PUT", "/api/users/me/preferences", body)
    except RuntimeError as e:
        if "404" not in str(e):
            raise
        api.call("POST", "/api/users/me/preferences", body)
    try:
        plan = api.call("POST", "/api/meal-plans/generate", {"weekStart": WEEK_START})
    except RuntimeError as e:
        if "409" not in str(e):
            raise
        # A plan left behind (a delete that never landed): clear the week and go again.
        clear_week(api)
        plan = api.call("POST", "/api/meal-plans/generate", {"weekStart": WEEK_START})
    result = {
        "usage": float(plan["usageCost"] or 0),
        "grocery": float(plan["groceryCost"] or plan["usageCost"] or 0),
        "open": plan["openMeals"],
        "recipes": len(plan["selections"]),
    }
    try:
        api.call("DELETE", f"/api/meal-plans/{plan['id']}")
    except RuntimeError:
        clear_week(api)  # tried again at the start of the next run if this fails too
    return result


def combos(max_count):
    """Every non-empty set of slots with every count from 1 to max_count."""
    for size in (1, 2, 3):
        for slots in itertools.combinations(SLOTS, size):
            for counts in itertools.product(range(1, max_count + 1), repeat=size):
                yield dict(zip(slots, counts))


HEADER = ["meals", "breakfast", "lunch", "dinner", "household", "leftovers", "mode", "seed", "usage", "grocery", "open", "recipes"]


def done_runs(path):
    """Runs already in the results file, so a sweep can pick up where it stopped."""
    if not path.exists():
        return set()
    return {(r["breakfast"], r["lunch"], r["dinner"], r["household"], r["seed"]) for r in csv.DictReader(path.open())}


def sweep(args):
    api = Api()
    clear_week(api)
    path = results_file(args.mode)
    if args.fresh and path.exists():
        path.unlink()
    done = done_runs(path)
    todo = [(c, h, s) for c in combos(args.max_count) for h in args.households for s in range(args.seeds)
            if (str(c.get("BREAKFAST", 0)), str(c.get("LUNCH", 0)), str(c.get("DINNER", 0)), str(h), str(s)) not in done]
    print(f"{len(todo)} plans to generate" + (f" ({len(done)} already done, picking up where it stopped)" if done else ""))
    started = time.time()
    skipped = 0
    in_a_row = 0
    new_file = not path.exists()
    with path.open("a", newline="") as f:
        out = csv.writer(f)
        if new_file:
            out.writerow(HEADER)
        for i, (counts, household, seed) in enumerate(todo, 1):
            try:
                r = run_one(api, counts, household, args.leftovers, args.mode)
                in_a_row = 0
            except RuntimeError as e:
                skipped += 1
                in_a_row += 1
                print(f"  skipped {counts} x{household}: {e}")
                if in_a_row >= 10:
                    sys.exit("10 failures in a row: stopping. Fix the problem and run the same command again; "
                             "it picks up where it stopped.")
                continue
            key = "".join(LETTER[s] for s in SLOTS if s in counts)
            out.writerow([key, counts.get("BREAKFAST", 0), counts.get("LUNCH", 0), counts.get("DINNER", 0), household,
                          args.leftovers, args.mode, seed, r["usage"], r["grocery"], r["open"], r["recipes"]])
            f.flush()
            if i % 25 == 0:
                left = (time.time() - started) / i * (len(todo) - i)
                print(f"  {i}/{len(todo)}, about {left / 60:.0f} min left")
    if skipped:
        sys.exit(f"{skipped} runs failed. Run the same command again to fill them in before picking defaults.")


def pick_defaults(headroom, mode):
    """For each meal set, household and budget: the most recipes whose week (typical or cheapest) fits."""
    path = results_file(mode)
    if not path.exists():
        sys.exit(f"No {path.name} yet; run the sweep with --mode {mode} first.")
    rows = [r for r in csv.DictReader(path.open()) if r.get("mode", "floor") == mode]
    if not rows:
        sys.exit(f"No {mode} results in {path.name}; run the sweep with --mode {mode} first.")
    by_setting = {}
    for r in rows:
        k = (r["meals"], int(r["household"]), int(r["breakfast"]), int(r["lunch"]), int(r["dinner"]))
        by_setting.setdefault(k, []).append(r)

    floors = {}  # (meals, household) -> [(floor, recipes, counts)]
    for (meals, household, b, l, d), runs in by_setting.items():
        if any(int(r["open"]) > 0 for r in runs):
            continue  # not enough recipes to cover the week this way
        floor = statistics.mean(float(r["grocery"]) for r in runs)
        counts = {s: n for s, n in zip(SLOTS, (b, l, d)) if n}
        floors.setdefault((meals, household), []).append((floor, sum(counts.values()), counts))

    defaults = {}
    for (meals, household), options in sorted(floors.items()):
        table = []
        for budget in BANDS:
            fits = [o for o in options if o[0] <= budget * headroom]
            if fits:
                # most variety; among equals, more dinners, then lunches (breakfast variety
                # matters least), then the cheaper
                floor, _, counts = max(fits, key=lambda o: (o[1], o[2].get("DINNER", 0), o[2].get("LUNCH", 0), -o[0]))
                table.append({"budget": budget, "counts": counts, "floor": round(floor, 2)})
            else:
                floor, _, counts = min(options, key=lambda o: o[0])
                table.append({"budget": budget, "counts": counts, "floor": round(floor, 2), "tight": True})
        defaults.setdefault(meals, {})[str(household)] = table

    return {
        "note": f"Made by data_pipeline/sweep_plans.py ({mode} mode). floor = the mean grocery total for those counts.",
        "mode": mode,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "headroom": headroom,
        "defaults": defaults,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--households", type=int, nargs="+", default=[1, 2, 4])
    p.add_argument("--max-count", type=int, default=5, help="most recipes per week to try for each meal (1-7)")
    p.add_argument("--seeds", type=int, default=2, help="plans per setting (the planner draws at random)")
    p.add_argument("--leftovers", action="store_true", help="sweep with leftovers for lunch on")
    p.add_argument("--mode", choices=["typical", "floor"], default="typical",
                   help="typical: no budget pressure (what a normal week costs); floor: a $1 budget (the cheapest week)")
    p.add_argument("--headroom", type=float, default=0.85,
                   help="a setting fits a budget when its cheapest week is under budget x this")
    p.add_argument("--from-csv", action="store_true", help="skip the sweep; pick defaults from the results file")
    p.add_argument("--fresh", action="store_true", help="start over instead of picking up where the last sweep stopped")
    p.add_argument("--write-app", action="store_true", help="also write the defaults into the mobile app")
    args = p.parse_args()

    if not args.from_csv:
        sweep(args)
    result = pick_defaults(args.headroom, args.mode)
    DEFAULTS.write_text(json.dumps(result, indent=2))
    print(f"Wrote {DEFAULTS}")
    if args.write_app:
        APP_DEFAULTS.write_text(json.dumps(result, indent=2))
        print(f"Wrote {APP_DEFAULTS}")


if __name__ == "__main__":
    main()
