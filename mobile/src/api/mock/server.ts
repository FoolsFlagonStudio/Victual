// In-app stand-in for backend routes that don't exist yet (meal plans, grocery
// lists), and - in demo mode - for the whole API. See src/config/features.ts.
import type { AuthResponse, User } from '@/api/auth';
import type { GroceryList, MealPlan, MealPlanSummary } from '@/api/mealPlans';
import type { DietaryLabel, MealSlot, PreferencesRequest, PreferencesResponse } from '@/api/preferences';
import type { FitFlag, Page, RecipeDetail, RecipeSummary } from '@/api/recipes';
import { features } from '@/config/features';
import { addDays, dayOfWeek, todayISO, weekStartFor } from '@/lib/dates';
import { ApiError, httpRequest, type RequestOptions } from '../http';
import { DIETARY_LABEL_NAMES, FIXTURES, type FixtureRecipe } from './fixtures';
import { buildGroceryList, buildPlan, candidatesFor, runOf, withTotals, type PoolEntry } from './planner';
import * as store from './store';

const PLAN_ROUTES = /^\/api\/(meal-plans|grocery-list-items)(\/|$|\?)/;
export const mockHandles = (path: string) => PLAN_ROUTES.test(path);

const delay = (ms = 220) => new Promise((r) => setTimeout(r, ms));

function parse(path: string) {
  const [pathname, qs = ''] = path.split('?');
  const params: Record<string, string> = {};
  for (const part of qs.split('&').filter(Boolean)) {
    const [k, v = ''] = part.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return { pathname, params };
}

// ---------- Context: where recipes and preferences come from ----------

type Ctx = {
  ns: string;
  prefs: () => Promise<PreferencesResponse>;
  pool: () => Promise<PoolEntry[]>;
  detail: (id: string, servings: number) => Promise<RecipeDetail & { aisles?: Record<string, string> }>;
  favorites: () => Promise<Set<string>>;
};

const userIdByToken = new Map<string, string>();
let realPool: { at: number; token: string; entries: PoolEntry[] } | null = null;

async function realCtx(token: string | null | undefined): Promise<Ctx> {
  const get = <T,>(p: string) => httpRequest<T>(p, { accessToken: token });
  let ns = token ? userIdByToken.get(token) : undefined;
  if (!ns) {
    ns = (await get<User>('/api/users/me')).id;
    if (token) userIdByToken.set(token, ns);
  }
  return {
    ns,
    prefs: () => get<PreferencesResponse>('/api/users/me/preferences'),
    pool: async () => {
      if (realPool && realPool.token === token && Date.now() - realPool.at < 10 * 60_000) return realPool.entries;
      const pages = await Promise.all([0, 1].map((page) => get<Page<RecipeSummary>>(`/api/recipes?sort=fit&size=50&page=${page}`).catch(() => null)));
      const entries = pages.flatMap((p) => p?.items ?? []).map((recipe) => ({ recipe }));
      realPool = { at: Date.now(), token: token ?? '', entries };
      return entries;
    },
    detail: (id, servings) => get<RecipeDetail>(`/api/recipes/${id}?servings=${servings}`),
    favorites: async () => new Set(),
  };
}

// ---------- Demo data ----------

const DEMO_NS = 'demo';
const labelId = (name: string) => `label-${name}`;
const demoLabels: DietaryLabel[] = DIETARY_LABEL_NAMES.map((name) => ({ id: labelId(name), name }));

function defaultDemoUser(): User {
  return { id: 'demo-user', firstName: 'Evan', lastName: 'Roberts', email: 'demo@victual.app', verified: true, premium: false, onboardingCompleted: true, createdAt: new Date().toISOString() };
}

function defaultDemoPrefs(): PreferencesResponse {
  return {
    weeklyBudget: 100,
    householdServingSize: 2,
    maxCaloriesPerMeal: null,
    maxCaloriesPerDay: null,
    proteinTargetGrams: null,
    carbsTargetGrams: null,
    fatTargetGrams: null,
    repeatAvoidanceDays: 14,
    planStartDay: 'SUNDAY',
    autoPlanEnabled: true,
    autoPlanDay: 'SATURDAY',
    prefersMealPrep: false,
    dietaryRestrictions: [],
    mealSlots: { BREAKFAST: 3, LUNCH: 3, DINNER: 4 },
    updatedAt: new Date().toISOString(),
  };
}

async function demoState() {
  const s = await store.load(DEMO_NS);
  if (!s.demo) s.demo = { user: defaultDemoUser(), prefs: defaultDemoPrefs(), favorites: ['r06'], seeded: false };
  return s;
}

function flagsFor(f: FixtureRecipe, prefs: PreferencesResponse | null): FitFlag[] {
  const flags: FitFlag[] = [];
  const [cal, protein, carbs, fat] = f.macros;
  if (prefs?.maxCaloriesPerMeal && cal > prefs.maxCaloriesPerMeal) flags.push({ code: 'OVER_MAX_CALORIES', message: `${cal - prefs.maxCaloriesPerMeal} cal over your per-meal limit` });
  if (prefs?.proteinTargetGrams && protein < prefs.proteinTargetGrams * 0.8) flags.push({ code: 'UNDER_PROTEIN_TARGET', message: `${prefs.proteinTargetGrams - protein}g under your protein target` });
  if (prefs?.carbsTargetGrams && carbs > prefs.carbsTargetGrams * 1.25) flags.push({ code: 'OVER_CARBS_TARGET', message: `${carbs - prefs.carbsTargetGrams}g over your carbs target` });
  if (prefs?.fatTargetGrams && fat > prefs.fatTargetGrams * 1.25) flags.push({ code: 'OVER_FAT_TARGET', message: `${fat - prefs.fatTargetGrams}g over your fat target` });
  return flags;
}

function summaryOf(f: FixtureRecipe, prefs: PreferencesResponse | null, favorites: Set<string>): RecipeSummary {
  const [cal, protein, carbs, fat] = f.macros;
  return {
    id: f.id, name: f.name, imageUrl: null, totalTimeMinutes: f.prep + f.cook, baseServings: f.base,
    caloriesPerServing: cal, proteinGPerServing: protein, carbsGPerServing: carbs, fatGPerServing: fat, nutritionComplete: true,
    costPerServing: f.cost, costComplete: true, mealPrepScore: f.mealPrep, labels: f.labels, flags: flagsFor(f, prefs), favorite: favorites.has(f.id),
  };
}

function detailOf(f: FixtureRecipe, servings: number, prefs: PreferencesResponse | null, favorites: Set<string>) {
  const scale = servings / f.base;
  const aisles: Record<string, string> = {};
  const detail: RecipeDetail & { aisles: Record<string, string> } = {
    ...summaryOf(f, prefs, favorites),
    description: f.description, prepTimeMinutes: f.prep || null, cookTimeMinutes: f.cook || null, servings,
    category: f.slot.toLowerCase(), cuisine: null, sourceUrl: null, sourceHost: null,
    estimatedCost: Math.round(f.cost * servings * 100) / 100,
    ingredients: f.lines.map(([amount, unit, name, aisle, extra]) => {
      aisles[name] = aisle;
      const scaled = amount == null ? null : Math.round(amount * scale * 100) / 100;
      return { name, amount: scaled, displayAmount: null, unit, prepNote: extra?.note ?? null, optional: !!extra?.optional, rawText: name };
    }),
    steps: f.steps.map((text, i) => ({ stepNumber: i + 1, text })),
    aisles,
  };
  return detail;
}

function restricted(f: FixtureRecipe, prefs: PreferencesResponse | null) {
  return (prefs?.dietaryRestrictions ?? []).some((l) => !f.labels.includes(l.name));
}

async function demoCtx(): Promise<Ctx> {
  const s = await demoState();
  const prefs = () => {
    if (!s.demo!.prefs) throw new ApiError(404, 'Preferences have not been set up yet.');
    return Promise.resolve(s.demo!.prefs);
  };
  const favs = () => new Set(s.demo!.favorites);
  return {
    ns: DEMO_NS,
    prefs,
    pool: async () => FIXTURES.filter((f) => !restricted(f, s.demo!.prefs)).map((f) => ({ recipe: summaryOf(f, s.demo!.prefs, favs()), slot: f.slot })),
    detail: async (id, servings) => {
      const f = FIXTURES.find((x) => x.id === id);
      if (!f) throw new ApiError(404, 'Recipe not found.');
      return detailOf(f, servings, s.demo!.prefs, favs());
    },
    favorites: async () => favs(),
  };
}

/** First run of demo mode: a plan for this week plus eight weeks of history. */
async function seedDemo(ctx: Ctx) {
  const s = await demoState();
  if (s.demo!.seeded || !s.demo!.prefs) return;
  const prefs = s.demo!.prefs;
  const pool = await ctx.pool();
  const thisWeek = weekStartFor(todayISO(), prefs.planStartDay);
  for (let i = 0; i <= 8; i++) {
    const week = addDays(thisWeek, -7 * i);
    const id = `plan-${week}`;
    // This week is a full plan (the demo shows a week in progress); past weeks are complete.
    s.plans[id] = buildPlan({ id, weekStartDate: week, prefs, pool, seed: `demo-${week}`, ignoreBudget: i === 3 || i === 6 });
  }
  s.demo!.seeded = true;
  s.historySeeded = true;
  await store.save(DEMO_NS, s);
}

/**
 * Real accounts start with no history, so the first time a plan route is used we add
 * the last HISTORY_WEEKS weeks (built from your preferences and real recipes) to test
 * the past-weeks screens. Only weeks that don't have a plan yet; never this week.
 */
const HISTORY_WEEKS = 8;
async function seedHistory(ctx: Ctx) {
  const s = await store.load(ctx.ns);
  if (s.historySeeded) return;
  const prefs = await ctx.prefs().catch(() => null);
  if (!prefs) return; // not onboarded yet: try again later
  const pool = await ctx.pool();
  if (!pool.length) return;
  const thisWeek = weekStartFor(todayISO(), prefs.planStartDay);
  for (let i = 1; i <= HISTORY_WEEKS; i++) {
    const week = addDays(thisWeek, -7 * i);
    const id = `plan-${week}`;
    if (Object.values(s.plans).some((p) => p.weekStartDate === week)) continue;
    // A couple of weeks go over budget so the history shows both outcomes.
    s.plans[id] = buildPlan({ id, weekStartDate: week, prefs, pool, seed: `history-${ctx.ns}-${week}`, ignoreBudget: i === 3 || i === 6 });
  }
  s.historySeeded = true;
  await store.save(ctx.ns, s);
}

// ---------- Meal plan routes (both modes) ----------

const summaryOfPlan = (p: MealPlan): MealPlanSummary => ({
  id: p.id, weekStartDate: p.weekStartDate, weekEndDate: p.weekEndDate, budgetTarget: p.budgetTarget, estimatedTotalCost: p.estimatedTotalCost, costComplete: p.costComplete,
});

async function withFavorites(ctx: Ctx, plan: MealPlan): Promise<MealPlan> {
  const favs = await ctx.favorites();
  if (!features.demoMode) return plan;
  return { ...plan, meals: plan.meals.map((m) => ({ ...m, recipe: { ...m.recipe, favorite: favs.has(m.recipe.id) } })) };
}

async function planRoutes(ctx: Ctx, method: string, pathname: string, params: Record<string, string>, body: any): Promise<unknown> {
  const s = await store.load(ctx.ns);
  const save = () => store.save(ctx.ns, s);
  const find = (id: string) => {
    const p = s.plans[id];
    if (!p) throw new ApiError(404, 'Meal plan not found.');
    return p;
  };
  let m: RegExpMatchArray | null;

  if (method === 'GET' && pathname === '/api/meal-plans/current') {
    const prefs = await ctx.prefs();
    const week = weekStartFor(todayISO(), prefs.planStartDay);
    const plan = Object.values(s.plans).find((p) => p.weekStartDate === week);
    if (!plan) throw new ApiError(404, 'No meal plan for this week yet.');
    return withFavorites(ctx, plan);
  }
  if (method === 'GET' && pathname === '/api/meal-plans') {
    return Object.values(s.plans).sort((a, b) => (a.weekStartDate < b.weekStartDate ? 1 : -1)).map(summaryOfPlan);
  }
  if (method === 'POST' && pathname === '/api/meal-plans/generate') {
    const prefs = await ctx.prefs();
    const week = body?.weekStartDate ?? weekStartFor(todayISO(), prefs.planStartDay);
    const id = `plan-${week}`;
    s.plans[id] = buildPlan({ id, weekStartDate: week, prefs, pool: await ctx.pool(), seed: `${id}-${Date.now()}`, fromDate: todayISO() });
    await save();
    return withFavorites(ctx, s.plans[id]);
  }
  if (method === 'POST' && pathname === '/api/meal-plans/meals') {
    // Put a recipe on one open day and slot, creating that week's plan if needed. Locked, like the backend.
    const prefs = await ctx.prefs();
    const { date, slot, recipeId } = body as { date: string; slot: MealSlot; recipeId: string };
    if (date < todayISO()) throw new ApiError(400, 'That day is already over.');
    const week = weekStartFor(date, prefs.planStartDay);
    const id = `plan-${week}`;
    const plan: MealPlan = s.plans[id] ?? {
      id, weekStartDate: week, weekEndDate: addDays(week, 6), budgetTarget: prefs.weeklyBudget, estimatedTotalCost: 0,
      costComplete: true, costBySlot: {}, meals: [], openMeals: [], generatedAt: new Date().toISOString(),
    };
    if (plan.meals.some((x) => x.date === date && x.slot === slot)) throw new ApiError(409, "There's already a meal there. Swap it instead.");
    if (plan.meals.some((x) => x.recipe.id === recipeId)) throw new ApiError(409, 'That recipe is already in this plan.');
    const pool = await ctx.pool();
    let recipe = pool.find((p) => p.recipe.id === recipeId)?.recipe;
    if (!recipe) {
      const { description, prepTimeMinutes, cookTimeMinutes, servings, category, cuisine, sourceUrl, sourceHost, estimatedCost, ingredients, steps, ...summary } = await ctx.detail(recipeId, prefs.householdServingSize);
      recipe = summary as RecipeSummary;
    }
    const mealId = `${id}_${date}_${slot}`;
    const meals = [
      ...plan.meals,
      { id: mealId, selectionId: mealId, date, dayOfWeek: dayOfWeek(date), slot, recipe, servings: prefs.householdServingSize, leftover: false, locked: true, started: false, side: null },
    ].sort((a, b) => (a.date === b.date ? ['BREAKFAST', 'LUNCH', 'DINNER'].indexOf(a.slot) - ['BREAKFAST', 'LUNCH', 'DINNER'].indexOf(b.slot) : a.date < b.date ? -1 : 1));
    s.plans[id] = withTotals({ ...plan, meals });
    await save();
    return withFavorites(ctx, s.plans[id]);
  }
  if ((m = pathname.match(/^\/api\/meal-plans\/([^/]+)\/regenerate$/)) && method === 'POST') {
    const prev = find(m[1]);
    const prefs = await ctx.prefs();
    s.plans[prev.id] = buildPlan({ id: prev.id, weekStartDate: prev.weekStartDate, prefs, pool: await ctx.pool(), seed: `${prev.id}-${Date.now()}`, previous: prev, fromDate: todayISO() });
    // Checked-off groceries for ingredients that are still on the list stay checked.
    await save();
    return withFavorites(ctx, s.plans[prev.id]);
  }
  if ((m = pathname.match(/^\/api\/meal-plans\/([^/]+)\/meals\/([^/]+)\/alternatives$/)) && method === 'GET') {
    const plan = find(m[1]);
    const meal = plan.meals.find((x) => x.id === m![2]);
    if (!meal) throw new ApiError(404, 'Meal not found.');
    const inPlan = new Set(plan.meals.map((x) => x.recipe.id));
    const limit = Number(params.limit ?? 8);
    return candidatesFor(meal.slot, await ctx.pool())
      .filter((r) => !inPlan.has(r.id))
      .sort((a, b) => (a.costPerServing ?? 99) - (b.costPerServing ?? 99))
      .slice(0, limit);
  }
  if ((m = pathname.match(/^\/api\/meal-plans\/([^/]+)\/meals\/([^/]+)$/)) && method === 'PATCH') {
    const plan = find(m[1]);
    const run = runOf(plan, m[2]);
    if (!run.length) throw new ApiError(404, 'Meal not found.');
    let replacement: RecipeSummary | undefined;
    if (body?.recipeId) {
      const pool = await ctx.pool();
      replacement = pool.find((p) => p.recipe.id === body.recipeId)?.recipe;
      if (!replacement) {
        // Favorites may sit outside the planning pool (real mode): build the summary from detail.
        const { description, prepTimeMinutes, cookTimeMinutes, servings, category, cuisine, sourceUrl, sourceHost, estimatedCost, ingredients, steps, ...summary } = await ctx.detail(body.recipeId, run[0].servings);
        replacement = summary as RecipeSummary;
      }
    }
    const ids = new Set(run.map((x) => x.id));
    if (replacement && plan.meals.some((x) => x.recipe.id === replacement!.id && !ids.has(x.id))) {
      throw new ApiError(409, 'That recipe is already in this plan.');
    }
    s.plans[plan.id] = withTotals({
      ...plan,
      meals: plan.meals.map((x) =>
        ids.has(x.id)
          ? { ...x, ...(body?.locked !== undefined && { locked: !!body.locked }), ...(replacement && { recipe: replacement, locked: body?.locked ?? x.locked }) }
          : x,
      ),
    });
    await save();
    return withFavorites(ctx, s.plans[plan.id]);
  }
  if ((m = pathname.match(/^\/api\/meal-plans\/([^/]+)\/grocery-list$/)) && method === 'GET') {
    const plan = find(m[1]);
    return buildGroceryList(plan, ctx.detail as Parameters<typeof buildGroceryList>[1], s.purchased) as Promise<GroceryList>;
  }
  if ((m = pathname.match(/^\/api\/meal-plans\/([^/]+)$/))) {
    if (method === 'GET') return withFavorites(ctx, find(m[1]));
    if (method === 'DELETE') {
      delete s.plans[m[1]];
      await save();
      return undefined;
    }
  }
  if ((m = pathname.match(/^\/api\/grocery-list-items\/(.+)$/)) && method === 'PATCH') {
    const id = decodeURIComponent(m[1]);
    s.purchased[id] = !!body?.purchased;
    await save();
    return { id, purchased: s.purchased[id] };
  }
  throw new ApiError(404, `Mock route not found: ${method} ${pathname}`);
}

// ---------- Demo-only routes ----------

function session(user: User): AuthResponse {
  return { accessToken: 'demo-access', accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), refreshToken: 'demo-refresh', user };
}

async function demoRoutes(method: string, pathname: string, params: Record<string, string>, body: any): Promise<unknown> {
  const s = await demoState();
  const d = s.demo!;
  const save = () => store.save(DEMO_NS, s);
  const user = () => ({ ...d.user, onboardingCompleted: !!d.prefs });
  const favs = new Set(d.favorites);
  let m: RegExpMatchArray | null;

  switch (`${method} ${pathname}`) {
    case 'POST /api/auth/login':
    case 'POST /api/auth/refresh':
    case 'POST /api/auth/verify-email':
    case 'POST /api/auth/reset-password':
    case 'PATCH /api/auth/password':
      return session(user());
    case 'POST /api/auth/signup':
      // A fresh demo account: back to onboarding, no plans.
      d.user = { ...defaultDemoUser(), firstName: body?.firstName ?? 'Evan', lastName: body?.lastName ?? '', email: body?.email ?? d.user.email };
      d.prefs = null;
      d.seeded = false;
      s.plans = {};
      s.purchased = {};
      await save();
      return { message: 'Account created.' };
    case 'POST /api/auth/logout':
      return undefined;
    case 'POST /api/auth/resend-verification':
    case 'POST /api/auth/forgot-password':
    case 'POST /api/auth/email-change':
      return { message: 'Code sent (demo: any 6 digits work).' };
    case 'POST /api/auth/email-change/confirm':
      d.user = { ...d.user, email: 'new-email@victual.app' };
      await save();
      return user();
    case 'GET /api/users/me':
      return user();
    case 'PATCH /api/users/me':
      d.user = { ...d.user, ...(body?.firstName && { firstName: body.firstName }), ...(body?.lastName && { lastName: body.lastName }) };
      await save();
      return user();
    case 'DELETE /api/users/me':
      await store.reset(DEMO_NS);
      return undefined;
    case 'GET /api/dietary-labels':
      return demoLabels;
    case 'GET /api/users/me/preferences':
      if (!d.prefs) throw new ApiError(404, 'Preferences have not been set up yet.');
      return d.prefs;
    case 'POST /api/users/me/preferences':
    case 'PUT /api/users/me/preferences': {
      if (method === 'POST' && d.prefs) throw new ApiError(409, 'Preferences already exist. Use PUT to update them.');
      const req = body as PreferencesRequest;
      d.prefs = {
        ...defaultDemoPrefs(),
        ...req,
        mealSlots: req.mealSlots as Record<MealSlot, number>,
        dietaryRestrictions: demoLabels.filter((l) => req.dietaryLabelIds?.includes(l.id)),
        updatedAt: new Date().toISOString(),
      };
      await save();
      return d.prefs;
    }
    case 'GET /api/users/me/favorites': {
      const items = FIXTURES.filter((f) => favs.has(f.id)).map((f) => summaryOf(f, d.prefs, favs));
      return { items, page: 0, size: items.length, total: items.length } satisfies Page<RecipeSummary>;
    }
    case 'GET /api/recipes':
      return searchFixtures(params, d.prefs, favs);
  }

  if ((m = pathname.match(/^\/api\/recipes\/([^/]+)\/favorite$/))) {
    d.favorites = method === 'PUT' ? [...new Set([...d.favorites, m[1]])] : d.favorites.filter((id) => id !== m![1]);
    await save();
    return undefined;
  }
  if ((m = pathname.match(/^\/api\/recipes\/([^/]+)$/)) && method === 'GET') {
    const f = FIXTURES.find((x) => x.id === m![1]);
    if (!f || restricted(f, d.prefs)) throw new ApiError(404, 'Recipe not found.');
    return detailOf(f, Number(params.servings ?? d.prefs?.householdServingSize ?? f.base), d.prefs, favs);
  }
  return null;
}

function searchFixtures(p: Record<string, string>, prefs: PreferencesResponse | null, favs: Set<string>): Page<RecipeSummary> {
  const labels = p.labels ? p.labels.split(',') : [];
  const q = (p.q ?? '').toLowerCase().trim();
  let list = FIXTURES.filter((f) => !restricted(f, prefs))
    .filter((f) => !q || f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q) || f.lines.some((l) => l[2].toLowerCase().includes(q)))
    .filter((f) => labels.every((l) => f.labels.includes(l)))
    .filter((f) => !p.minProtein || f.macros[1] >= Number(p.minProtein))
    .filter((f) => !p.maxCalories || f.macros[0] <= Number(p.maxCalories))
    .filter((f) => !p.maxTime || f.prep + f.cook <= Number(p.maxTime))
    .filter((f) => !p.maxCost || f.cost <= Number(p.maxCost))
    // Sample recipes are all mains, one slot each; "side" matches none.
    .filter((f) => !p.meals || p.meals.split(',').includes(f.slot.toLowerCase()))
    .map((f) => ({ f, s: summaryOf(f, prefs, favs) }));
  const by: Record<string, (a: typeof list[0], b: typeof list[0]) => number> = {
    fit: (a, b) => a.s.flags.length - b.s.flags.length || b.f.mealPrep - a.f.mealPrep,
    time: (a, b) => a.f.prep + a.f.cook - (b.f.prep + b.f.cook),
    protein: (a, b) => b.f.macros[1] - a.f.macros[1],
    calories: (a, b) => a.f.macros[0] - b.f.macros[0],
    mealPrep: (a, b) => b.f.mealPrep - a.f.mealPrep,
    newest: (a, b) => b.f.id.localeCompare(a.f.id),
    cost: (a, b) => a.f.cost - b.f.cost,
  };
  list = list.sort(by[p.sort ?? 'fit'] ?? by.fit);
  const page = Number(p.page ?? 0);
  const size = Number(p.size ?? 20);
  return { items: list.slice(page * size, page * size + size).map((x) => x.s), page, size, total: list.length };
}

// ---------- Entry point ----------

export async function mockRequest<T>(path: string, { method = 'GET', body, accessToken }: RequestOptions): Promise<T> {
  await delay();
  const { pathname, params } = parse(path);
  if (features.demoMode) {
    const handled = await demoRoutes(method, pathname, params, body);
    if (handled !== null) return handled as T;
    const ctx = await demoCtx();
    await seedDemo(ctx);
    return (await planRoutes(ctx, method, pathname, params, body)) as T;
  }
  const ctx = await realCtx(accessToken);
  await seedHistory(ctx);
  return (await planRoutes(ctx, method, pathname, params, body)) as T;
}
