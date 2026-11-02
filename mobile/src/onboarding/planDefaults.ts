// Suggested recipes per week for a budget, from data_pipeline/sweep_plans.py: for each
// set of meals and household size, the most recipes (most variety) whose cheapest week
// the planner could find still fits the budget with some headroom.
import type { MealSlot } from '@/api/preferences';
import data from './plan-defaults.json';

type Entry = { budget: number; counts: Partial<Record<MealSlot, number>>; floor: number; tight?: boolean };
const DEFAULTS = (data as { defaults: Record<string, Record<string, Entry[]>> }).defaults;

const ORDER: MealSlot[] = ['BREAKFAST', 'LUNCH', 'DINNER'];
const LETTER: Record<MealSlot, string> = { BREAKFAST: 'B', LUNCH: 'L', DINNER: 'D' };

/** Counts for these meals, household and weekly budget, or null when the sweep hasn't been run. */
export function suggestedCounts(meals: MealSlot[], household: number, budget: number): Entry | null {
  const key = ORDER.filter((s) => meals.includes(s)).map((s) => LETTER[s]).join('');
  const byHousehold = DEFAULTS[key];
  if (!byHousehold || budget <= 0) return null;
  // The nearest household size the sweep covered, scaling the budget to it per person.
  const sizes = Object.keys(byHousehold).map(Number);
  if (!sizes.length) return null;
  const size = sizes.reduce((best, n) => (Math.abs(n - household) < Math.abs(best - household) ? n : best));
  const scaled = (budget / household) * size;
  const table = byHousehold[String(size)];
  return [...table].reverse().find((e) => e.budget <= scaled) ?? table[0] ?? null;
}
