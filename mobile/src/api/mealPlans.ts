// Meal plans and grocery lists. Screens use the app-side shapes below; this file
// talks to the backend's MealPlanController / GroceryListController and maps their
// JSON (selections + calendar days, toBuy + pantry) into those shapes.
//
// With EXPO_PUBLIC_MOCK_PLANS=1 or demo mode the same calls go to the in-app mock
// (src/api/mock), which already speaks the app-side shapes; `normalizeMock` fills in
// the fields the backend adds (selections, sides, started days).
import { features } from '@/config/features';
import { guessAisle } from '@/lib/aisles';
import { dayOfWeek, todayISO } from '@/lib/dates';
import type { DayOfWeek, MealSlot } from './preferences';
import type { RecipeSummary } from './recipes';
import { query } from './client';

// ---------- App-side shapes ----------

export type PlannedMeal = {
  /** Unique per calendar slot: selection + date + slot. */
  id: string;
  /** The recipe choice this meal is eaten from. Lock, swap and sides act on it, so on every day it covers. */
  selectionId: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  dayOfWeek: DayOfWeek;
  slot: MealSlot;
  recipe: RecipeSummary;
  /** Servings for this one meal (the household). */
  servings: number;
  /** True when this is a repeat of a recipe cooked earlier in the week. */
  leftover: boolean;
  /** Locked meals survive regenerate. Applies to every day the recipe covers. */
  locked: boolean;
  /** First cooked on an earlier day: it can't be swapped any more (it can still be locked). Today's can. */
  started: boolean;
  /** Cooked alongside the main (a slaw with roast chicken), or null. */
  side: RecipeSummary | null;
  /** You picked the side, so it stays when the main is swapped or regenerated. */
  sideChosen?: boolean;
};

export type MealPlanSummary = {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  budgetTarget: number;
  estimatedTotalCost: number;
  costComplete: boolean;
};

export type MealPlan = MealPlanSummary & {
  costBySlot: Partial<Record<MealSlot, number>>;
  meals: PlannedMeal[];
  /** Days and slots from today on that nothing covers. */
  openMeals: { date: string; slot: MealSlot }[];
  generatedAt: string | null;
};

export type Aisle = 'PRODUCE' | 'MEAT' | 'SEAFOOD' | 'DAIRY' | 'EGGS' | 'BAKERY' | 'FROZEN' | 'PANTRY' | 'OTHER';

export type GroceryListItem = {
  id: string;
  name: string;
  aisle: Aisle;
  totalAmount: number | null;
  displayAmount: string | null;
  unit: string | null;
  estimatedCost: number | null;
  purchased: boolean;
  /** A staple you probably have ("check your pantry"): not in the total unless needToBuy. */
  pantry: boolean;
  needToBuy: boolean;
  /** What to pick up, e.g. "2 x 15 oz can". */
  packageText: string | null;
};

export type GroceryList = {
  mealPlanId: string;
  estimatedTotalCost: number;
  items: GroceryListItem[];
};

/** A recipe that could replace a meal (or be its side), with what it changes. */
export type Suggestion = { recipe: RecipeSummary; costChange: number | null };

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Authed = <T>(path: string, opts?: { method?: Method; body?: unknown }) => Promise<T>;

// ---------- Backend JSON ----------

type Num = number | string | null;
type BPlanRecipe = { id: string; name: string; imageUrl: string | null; totalMinutes: number | null; caloriesPerServing: Num; costPerServing: Num; mealPrepScore: number };
type BSelection = {
  id: string;
  slot: MealSlot;
  position: number;
  startDate: string;
  daysCovered: number;
  servings: number;
  estimatedCost: Num;
  locked: boolean;
  recipe: BPlanRecipe;
  side?: BPlanRecipe | null;
  sideEstimatedCost?: Num;
  sideChosen?: boolean;
};
type BMeal = { slot: MealSlot; selectionId: string; leftover: boolean };
type BPlan = {
  id: string;
  weekStart: string;
  weekEnd: string;
  budget: Num;
  usageCost: Num;
  groceryCost: Num;
  overBudget: boolean;
  generatedAt: string | null;
  selections: BSelection[];
  days: { date: string; meals: BMeal[] }[];
  open: { date: string; slot: MealSlot }[];
};
type BSummary = { id: string; weekStart: string; weekEnd: string; budget: Num; usageCost: Num; groceryCost: Num };
type BItem = {
  id: string;
  name: string;
  amount: Num;
  unit: string | null;
  displayAmount: string | null;
  packageCount: number | null;
  packageLabel: string | null;
  cost: Num;
  purchased: boolean;
  needToBuy: boolean;
};
type BGrocery = { planId: string; usageCost: Num; groceryCost: Num; toBuy: BItem[]; pantry: BItem[] };
type BSuggestion = { recipe: BPlanRecipe; estimatedCost: Num; costChange: Num };

const num = (v: Num | undefined): number | null => (v == null || v === '' ? null : Number(v));

/** A plan card's recipe as a summary. Macros other than calories aren't in plans; recipe detail has them. */
export function planRecipe(r: BPlanRecipe): RecipeSummary {
  return {
    id: r.id,
    name: r.name,
    imageUrl: r.imageUrl,
    totalTimeMinutes: r.totalMinutes,
    baseServings: 0,
    caloriesPerServing: num(r.caloriesPerServing),
    proteinGPerServing: null,
    carbsGPerServing: null,
    fatGPerServing: null,
    nutritionComplete: false,
    costPerServing: num(r.costPerServing),
    costComplete: true,
    mealPrepScore: r.mealPrepScore,
    labels: [],
    flags: [],
    favorite: false,
  };
}

export function fromBackendPlan(p: BPlan, today = todayISO()): MealPlan {
  const selections = new Map(p.selections.map((s) => [s.id, s]));
  const mealCount = new Map<string, number>();
  p.days.forEach((d) => d.meals.forEach((m) => mealCount.set(m.selectionId, (mealCount.get(m.selectionId) ?? 0) + 1)));

  const meals: PlannedMeal[] = p.days.flatMap((d) =>
    d.meals.flatMap((m) => {
      const s = selections.get(m.selectionId);
      if (!s) return [];
      return [
        {
          id: `${m.selectionId}|${d.date}|${m.slot}`,
          selectionId: m.selectionId,
          date: d.date,
          dayOfWeek: dayOfWeek(d.date),
          slot: m.slot,
          recipe: planRecipe(s.recipe),
          servings: Math.max(1, Math.round(s.servings / (mealCount.get(m.selectionId) ?? 1))),
          leftover: m.leftover,
          locked: s.locked,
          started: s.startDate < today,
          side: s.side ? planRecipe(s.side) : null,
          sideChosen: !!s.sideChosen,
        },
      ];
    }),
  );

  const costBySlot: Partial<Record<MealSlot, number>> = {};
  for (const s of p.selections) costBySlot[s.slot] = (costBySlot[s.slot] ?? 0) + (num(s.estimatedCost) ?? 0) + (num(s.sideEstimatedCost) ?? 0);

  return {
    id: p.id,
    weekStartDate: p.weekStart,
    weekEndDate: p.weekEnd,
    budgetTarget: num(p.budget) ?? 0,
    estimatedTotalCost: num(p.groceryCost) ?? num(p.usageCost) ?? 0,
    costComplete: true,
    costBySlot,
    meals,
    openMeals: p.open.filter((o) => o.date >= today),
    generatedAt: p.generatedAt,
  };
}

const fromBackendSummary = (s: BSummary): MealPlanSummary => ({
  id: s.id,
  weekStartDate: s.weekStart,
  weekEndDate: s.weekEnd,
  budgetTarget: num(s.budget) ?? 0,
  estimatedTotalCost: num(s.groceryCost) ?? num(s.usageCost) ?? 0,
  costComplete: true,
});

function fromBackendItem(i: BItem, pantry: boolean): GroceryListItem {
  return {
    id: i.id,
    name: i.name,
    aisle: guessAisle(i.name),
    totalAmount: num(i.amount),
    // The backend's display amount already has its unit ("12 oz", "1.5 lb"); grams are stored, not shown.
    displayAmount: i.displayAmount,
    unit: i.displayAmount ? null : i.unit,
    estimatedCost: num(i.cost),
    purchased: i.purchased,
    pantry,
    needToBuy: i.needToBuy,
    packageText: i.packageLabel ? (i.packageCount ? `${i.packageCount} x ${i.packageLabel}` : i.packageLabel) : null,
  };
}

const fromBackendGrocery = (g: BGrocery): GroceryList => ({
  mealPlanId: g.planId,
  estimatedTotalCost: num(g.groceryCost) ?? num(g.usageCost) ?? 0,
  items: [...g.toBuy.map((i) => fromBackendItem(i, false)), ...g.pantry.map((i) => fromBackendItem(i, true))],
});

const fromSuggestion = (s: BSuggestion): Suggestion => ({ recipe: planRecipe(s.recipe), costChange: num(s.costChange) });

// ---------- Mock (legacy app-side shapes) ----------

// Mock plans speak the app-side shapes; plans saved by an older build may lack the
// newer fields, so fill them in (a selection = a run of one recipe in one slot).
type MockPlan = Omit<MealPlan, 'meals' | 'openMeals'> & { meals: (Omit<PlannedMeal, 'selectionId' | 'started' | 'side'> & Partial<PlannedMeal>)[]; openMeals?: MealPlan['openMeals'] };
type MockItem = Omit<GroceryListItem, 'pantry' | 'needToBuy' | 'packageText'> & Partial<GroceryListItem>;

function normalizeMock(p: MockPlan): MealPlan {
  const last = new Map<MealSlot, PlannedMeal>();
  const meals = p.meals.map((m) => {
    const prev = last.get(m.slot);
    const selectionId = m.selectionId ?? (m.leftover && prev && prev.recipe.id === m.recipe.id ? prev.selectionId : m.id);
    const meal: PlannedMeal = { ...m, selectionId, started: m.started ?? false, side: m.side ?? null };
    last.set(m.slot, meal);
    return meal;
  });
  return { ...p, meals, openMeals: p.openMeals ?? [], generatedAt: p.generatedAt ?? null };
}

const normalizeMockGrocery = (g: Omit<GroceryList, 'items'> & { items: MockItem[] }): GroceryList => ({
  ...g,
  items: g.items.map((i) => ({ ...i, pantry: i.pantry ?? false, needToBuy: i.needToBuy ?? false, packageText: i.packageText ?? null })),
});

const mock = () => features.demoMode || features.mockMealPlans;

// ---------- API ----------

export const mealPlansApi = {
  /** 404 when no plan covers today. */
  current: async (authed: Authed): Promise<MealPlan> =>
    mock() ? normalizeMock(await authed<MockPlan>('/api/meal-plans/current')) : fromBackendPlan(await authed<BPlan>('/api/meal-plans/current')),

  list: async (authed: Authed): Promise<MealPlanSummary[]> =>
    mock()
      ? authed<MealPlanSummary[]>('/api/meal-plans')
      : (await authed<{ items: BSummary[] }>(`/api/meal-plans${query({ page: 0, size: 52 })}`)).items.map(fromBackendSummary),

  get: async (authed: Authed, id: string): Promise<MealPlan> =>
    mock() ? normalizeMock(await authed<MockPlan>(`/api/meal-plans/${id}`)) : fromBackendPlan(await authed<BPlan>(`/api/meal-plans/${id}`)),

  /** weekStart: the week's first day (this week's, even if it has started; days already over aren't planned). */
  generate: async (authed: Authed, weekStart?: string): Promise<MealPlan> =>
    mock()
      ? normalizeMock(await authed<MockPlan>('/api/meal-plans/generate', { method: 'POST', body: { weekStartDate: weekStart } }))
      : fromBackendPlan(await authed<BPlan>('/api/meal-plans/generate', { method: 'POST', body: { weekStart } })),

  regenerate: async (authed: Authed, id: string): Promise<MealPlan> =>
    mock()
      ? normalizeMock(await authed<MockPlan>(`/api/meal-plans/${id}/regenerate`, { method: 'POST' }))
      : fromBackendPlan(await authed<BPlan>(`/api/meal-plans/${id}/regenerate`, { method: 'POST' })),

  setLocked: async (authed: Authed, plan: MealPlan, meal: PlannedMeal, locked: boolean): Promise<MealPlan> =>
    mock()
      ? normalizeMock(await authed<MockPlan>(`/api/meal-plans/${plan.id}/meals/${meal.id}`, { method: 'PATCH', body: { locked } }))
      : fromBackendPlan(await authed<BPlan>(`/api/meal-plans/${plan.id}/selections/${meal.selectionId}`, { method: 'PATCH', body: { locked } })),

  /** Replaces the meal's recipe on every day it covers. */
  swap: async (authed: Authed, plan: MealPlan, meal: PlannedMeal, recipeId: string): Promise<MealPlan> =>
    mock()
      ? normalizeMock(await authed<MockPlan>(`/api/meal-plans/${plan.id}/meals/${meal.id}`, { method: 'PATCH', body: { recipeId } }))
      : fromBackendPlan(await authed<BPlan>(`/api/meal-plans/${plan.id}/selections/${meal.selectionId}/swap`, { method: 'POST', body: { recipeId } })),

  suggestions: async (authed: Authed, plan: MealPlan, meal: PlannedMeal): Promise<Suggestion[]> => {
    if (mock()) {
      const list = await authed<RecipeSummary[]>(`/api/meal-plans/${plan.id}/meals/${meal.id}/alternatives${query({ limit: 10 })}`);
      return list.map((recipe) => ({ recipe, costChange: null }));
    }
    return (await authed<BSuggestion[]>(`/api/meal-plans/${plan.id}/selections/${meal.selectionId}/suggestions`)).map(fromSuggestion);
  },

  // Sides are a backend feature; the mock plans don't have them.
  sidesSupported: () => !mock(),
  sideSuggestions: async (authed: Authed, plan: MealPlan, meal: PlannedMeal): Promise<Suggestion[]> =>
    (await authed<BSuggestion[]>(`/api/meal-plans/${plan.id}/selections/${meal.selectionId}/side-suggestions`)).map(fromSuggestion),
  /** recipeId null: pick one for me. */
  setSide: async (authed: Authed, plan: MealPlan, meal: PlannedMeal, recipeId: string | null): Promise<MealPlan> =>
    fromBackendPlan(await authed<BPlan>(`/api/meal-plans/${plan.id}/selections/${meal.selectionId}/side`, { method: 'POST', body: recipeId ? { recipeId } : {} })),
  removeSide: async (authed: Authed, plan: MealPlan, meal: PlannedMeal): Promise<MealPlan> =>
    fromBackendPlan(await authed<BPlan>(`/api/meal-plans/${plan.id}/selections/${meal.selectionId}/side`, { method: 'DELETE' })),

  /** Puts a recipe on an open day and slot, creating that week's plan if there isn't one. Returns that week's plan. */
  addMeal: async (authed: Authed, body: { date: string; slot: MealSlot; recipeId: string }): Promise<MealPlan> =>
    mock()
      ? normalizeMock(await authed<MockPlan>('/api/meal-plans/meals', { method: 'POST', body }))
      : fromBackendPlan(await authed<BPlan>('/api/meal-plans/meals', { method: 'POST', body })),

  groceryList: async (authed: Authed, planId: string): Promise<GroceryList> =>
    mock()
      ? normalizeMockGrocery(await authed<Omit<GroceryList, 'items'> & { items: MockItem[] }>(`/api/meal-plans/${planId}/grocery-list`))
      : fromBackendGrocery(await authed<BGrocery>(`/api/meal-plans/${planId}/grocery-list`)),

  setPurchased: (authed: Authed, itemId: string, purchased: boolean) =>
    authed<unknown>(`/api/grocery-list-items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: { purchased } }),

  /** Pantry staples only: put it on the shopping list (and in the total) after all. */
  setNeedToBuy: (authed: Authed, itemId: string, needToBuy: boolean) =>
    authed<unknown>(`/api/grocery-list-items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: { needToBuy } }),
};
