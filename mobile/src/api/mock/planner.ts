// Client-side stand-in for the backend's MealPlanGeneratorService. Mirrors the
// rules the real generator is meant to follow so the UI behaves the same once
// it's live:
// - every included slot covers all 7 days; N recipes per week split the days
//   into N runs, cooked on the first day and eaten as leftovers after
// - a week that has already started is only planned from today on (no meals or
//   groceries for days that are over); regenerating mid-week keeps past days as they were
// - locked meals keep their recipe through regenerate
// - picks are shuffled per seed, then the priciest picks are swapped for
//   cheaper ones until the week fits the budget
import type { Aisle, GroceryList, GroceryListItem, MealPlan, PlannedMeal } from '@/api/mealPlans';
import type { MealSlot, PreferencesResponse } from '@/api/preferences';
import type { RecipeDetail, RecipeSummary } from '@/api/recipes';
import { addDays, dayOfWeek, fromISO } from '@/lib/dates';
import { amount as formatAmount } from '@/lib/format';
import { guessAisle } from '@/lib/aisles';

export { guessAisle };

export type PoolEntry = { recipe: RecipeSummary; slot?: MealSlot };

const SLOTS: MealSlot[] = ['BREAKFAST', 'LUNCH', 'DINNER'];
const BREAKFAST_WORDS = /oat|egg|pancake|waffle|yogurt|parfait|smoothie|toast|muffin|granola|breakfast|frittata|omelet|hash|burrito/i;

/** Small seeded PRNG so a given seed always produces the same plan. */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function candidatesFor(slot: MealSlot, pool: PoolEntry[]): RecipeSummary[] {
  const hinted = pool.filter((p) => p.slot);
  if (hinted.length) return hinted.filter((p) => p.slot === slot).map((p) => p.recipe);
  // Real recipes have no slot in search results: guess breakfast by name.
  const isBreakfast = (r: RecipeSummary) => BREAKFAST_WORDS.test(r.name);
  const matches = pool.map((p) => p.recipe).filter((r) => (slot === 'BREAKFAST' ? isBreakfast(r) : !isBreakfast(r)));
  return matches.length ? matches : pool.map((p) => p.recipe);
}

/** Split `total` days (starting at day `from`) into `n` runs, longest first: 3 -> [3, 2, 2]. */
export function runs(n: number, total = 7, from = 0): number[][] {
  n = Math.min(n, total);
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const extra = total % n;
  const out: number[][] = [];
  let day = from;
  for (let i = 0; i < n; i++) {
    const len = base + (i < extra ? 1 : 0);
    out.push(Array.from({ length: len }, (_, k) => day + k));
    day += len;
  }
  return out;
}

const daysBetween = (a: string, b: string) => Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000);

const mealCost = (r: RecipeSummary, servings: number) => (r.costPerServing ?? 0) * servings;

type Selection = { slot: MealSlot; days: number[]; recipe: RecipeSummary; locked: boolean };

export function buildPlan(opts: {
  id: string;
  weekStartDate: string;
  prefs: PreferencesResponse;
  pool: PoolEntry[];
  seed: string;
  /** Existing plan to regenerate; its locked meals are kept. */
  previous?: MealPlan;
  /** Skip budget fitting (used for sample history so some weeks run over). */
  ignoreBudget?: boolean;
  /** Plan only from this date on (today, for a week that's already started). */
  fromDate?: string;
}): MealPlan {
  const { prefs, pool, weekStartDate, previous } = opts;
  // Days of the week already over: 0 for a future week, up to 6 on its last day.
  const firstDay = opts.fromDate ? Math.min(Math.max(daysBetween(weekStartDate, opts.fromDate), 0), 6) : 0;
  const pastDate = addDays(weekStartDate, firstDay);
  const rand = rng(opts.seed);
  const servings = prefs.householdServingSize;
  const used = new Set<string>();
  const selections: Selection[] = [];

  for (const slot of SLOTS) {
    const count = prefs.mealSlots[slot];
    if (!count) continue;
    // ignoreBudget (sample history) picks the priciest recipes so a few demo weeks run over.
    const candidates = opts.ignoreBudget
      ? [...candidatesFor(slot, pool)].sort((a, b) => (b.costPerServing ?? 0) - (a.costPerServing ?? 0))
      : shuffle(candidatesFor(slot, pool), rand);
    // Fewer days left than recipes asked for: one recipe per remaining day.
    for (const days of runs(count, 7 - firstDay, firstDay)) {
      const kept = previous?.meals.find((m) => m.slot === slot && m.locked && m.date === addDays(weekStartDate, days[0]));
      const recipe = kept?.recipe ?? candidates.find((r) => !used.has(r.id)) ?? candidates[0];
      if (!recipe) continue;
      used.add(recipe.id);
      selections.push({ slot, days, recipe, locked: !!kept });
    }
  }

  if (!opts.ignoreBudget) {
    const total = () => selections.reduce((sum, s) => sum + mealCost(s.recipe, servings) * s.days.length, 0);
    for (let i = 0; i < 30 && total() > prefs.weeklyBudget; i++) {
      const swappable = selections.filter((s) => !s.locked).sort((a, b) => mealCost(b.recipe, servings) * b.days.length - mealCost(a.recipe, servings) * a.days.length);
      let improved = false;
      for (const sel of swappable) {
        const cheaper = candidatesFor(sel.slot, pool)
          .filter((r) => !used.has(r.id) && (r.costPerServing ?? Infinity) < (sel.recipe.costPerServing ?? 0))
          .sort((a, b) => (a.costPerServing ?? 0) - (b.costPerServing ?? 0))[0];
        if (cheaper) {
          used.delete(sel.recipe.id);
          used.add(cheaper.id);
          sel.recipe = cheaper;
          improved = true;
          break;
        }
      }
      if (!improved) break;
    }
  }

  const meals: PlannedMeal[] = selections.flatMap((s) =>
    s.days.map((d, i) => {
      const date = addDays(weekStartDate, d);
      const selectionId = `${opts.id}_${addDays(weekStartDate, s.days[0])}_${s.slot}`;
      return { id: `${opts.id}_${date}_${s.slot}`, selectionId, date, dayOfWeek: dayOfWeek(date), slot: s.slot, recipe: s.recipe, servings, leftover: i > 0, locked: s.locked, started: false, side: null };
    }),
  );
  // Regenerating mid-week: days already over stay as they were.
  if (previous && firstDay > 0) meals.push(...previous.meals.filter((m) => m.date < pastDate));
  meals.sort((a, b) => (a.date === b.date ? SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) : a.date < b.date ? -1 : 1));

  return withTotals({
    id: opts.id,
    weekStartDate,
    weekEndDate: addDays(weekStartDate, 6),
    budgetTarget: prefs.weeklyBudget,
    estimatedTotalCost: 0,
    costComplete: true,
    costBySlot: {},
    meals,
    openMeals: [],
    generatedAt: new Date().toISOString(),
  });
}

export function withTotals(plan: MealPlan): MealPlan {
  const costBySlot: Partial<Record<MealSlot, number>> = {};
  for (const m of plan.meals) costBySlot[m.slot] = (costBySlot[m.slot] ?? 0) + mealCost(m.recipe, m.servings);
  const total = Object.values(costBySlot).reduce((a, b) => a + (b ?? 0), 0);
  return {
    ...plan,
    costBySlot,
    estimatedTotalCost: Math.round(total * 100) / 100,
    costComplete: plan.meals.every((m) => m.recipe.costComplete),
  };
}

/** The run of days a meal belongs to (same slot, same recipe, consecutive). */
export function runOf(plan: MealPlan, mealId: string): PlannedMeal[] {
  const meal = plan.meals.find((m) => m.id === mealId);
  if (!meal) return [];
  const sameSlot = plan.meals.filter((m) => m.slot === meal.slot);
  const i = sameSlot.indexOf(meal);
  let start = i;
  while (start > 0 && sameSlot[start - 1].recipe.id === meal.recipe.id && sameSlot[start].leftover) start--;
  let end = i;
  while (end < sameSlot.length - 1 && sameSlot[end + 1].recipe.id === meal.recipe.id && sameSlot[end + 1].leftover) end++;
  return sameSlot.slice(start, end + 1);
}

// ---------- Grocery list ----------

const WHOLE_UNITS = new Set(['count', 'can', 'clove']);


export async function buildGroceryList(
  plan: MealPlan,
  detail: (recipeId: string, servings: number) => Promise<RecipeDetail & { aisles?: Record<string, Aisle> }>,
  purchased: Record<string, boolean>,
): Promise<GroceryList> {
  // One cook per run of days, scaled to cover every day in the run.
  const cooks = new Map<string, { recipeId: string; servings: number }>();
  for (const m of plan.meals) {
    if (m.leftover) continue;
    const run = runOf(plan, m.id);
    cooks.set(m.id, { recipeId: m.recipe.id, servings: m.servings * run.length });
  }

  const items = new Map<string, GroceryListItem>();
  for (const { recipeId, servings } of cooks.values()) {
    const d = await detail(recipeId, servings);
    for (const line of d.ingredients) {
      if (line.optional || line.unit === 'to_taste') continue;
      // "bell pepper" and "bell peppers" are the same item.
      const key = `${line.name.toLowerCase().replace(/(es|s)$/, '')}|${line.unit ?? ''}`;
      const existing = items.get(key);
      if (existing) {
        existing.totalAmount = (existing.totalAmount ?? 0) + (line.amount ?? 0);
        if (line.name.endsWith('s') && !existing.name.endsWith('s')) existing.name = line.name;
      } else {
        items.set(key, {
          id: `${plan.id}__${key}`,
          name: line.name,
          aisle: d.aisles?.[line.name] ?? guessAisle(line.name),
          totalAmount: line.amount,
          displayAmount: line.amount != null ? formatAmount(line.amount) : null,
          unit: line.unit,
          estimatedCost: null,
          purchased: !!purchased[`${plan.id}__${key}`],
          pantry: false,
          needToBuy: false,
          packageText: null,
        });
      }
    }
  }

  // You can't buy a third of a carrot: whole-unit items round up, everything else is shown as a kitchen fraction.
  for (const item of items.values()) {
    if (item.totalAmount == null) continue;
    if (WHOLE_UNITS.has(item.unit ?? '')) item.totalAmount = Math.ceil(item.totalAmount - 0.05);
    item.displayAmount = formatAmount(item.totalAmount);
  }

  return {
    mealPlanId: plan.id,
    estimatedTotalCost: plan.estimatedTotalCost,
    items: [...items.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
