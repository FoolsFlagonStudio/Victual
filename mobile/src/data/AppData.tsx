// Shared state for the signed-in app: preferences, this week's plan, its
// grocery list, plan history and favorites. Screens read from here so a change
// on one tab (lock, swap, favorite, check off an item) shows everywhere.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '@/api/client';
import { mealPlansApi, type GroceryList, type MealPlan, type MealPlanSummary } from '@/api/mealPlans';
import type { MealSlot } from '@/api/preferences';
import { usersApi } from '@/api/users';
import { features } from '@/config/features';
import { todayISO, weekStartFor } from '@/lib/dates';
import { preferencesApi, type DietaryLabel, type PreferencesRequest, type PreferencesResponse } from '@/api/preferences';
import { recipesApi, type RecipeSummary } from '@/api/recipes';
import { useAuth } from '@/auth/AuthProvider';

type Loadable<T> = { data: T; loading: boolean; error: string | null };

type AppData = {
  prefs: PreferencesResponse | null;
  labels: DietaryLabel[];
  /** undefined while loading the first time; null when there's no plan this week. */
  plan: MealPlan | null | undefined;
  planError: string | null;
  planBusy: boolean;
  grocery: Loadable<GroceryList | null>;
  history: Loadable<MealPlanSummary[]>;

  refresh: () => Promise<void>;
  savePreferences: (body: PreferencesRequest) => Promise<void>;
  generate: () => Promise<void>;
  regenerate: () => Promise<void>;
  toggleLock: (mealId: string) => Promise<void>;
  swap: (mealId: string, recipeId: string) => Promise<void>;
  /** recipeId null: pick one. */
  setSide: (mealId: string, recipeId: string | null) => Promise<void>;
  removeSide: (mealId: string) => Promise<void>;
  /** Puts a recipe on an open day and slot (creating that week's plan if needed). */
  addMeal: (body: { date: string; slot: MealSlot; recipeId: string }) => Promise<void>;
  setPurchased: (itemId: string, purchased: boolean) => Promise<void>;
  setNeedToBuy: (itemId: string, needToBuy: boolean) => Promise<void>;
  getPlan: (id: string) => Promise<MealPlan>;

  isFavorite: (r: Pick<RecipeSummary, 'id' | 'favorite'>) => boolean;
  toggleFavorite: (r: Pick<RecipeSummary, 'id' | 'favorite'>) => Promise<void>;
};

const Ctx = createContext<AppData | null>(null);
const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { authedRequest } = useAuth();
  const [prefs, setPrefs] = useState<PreferencesResponse | null>(null);
  const [labels, setLabels] = useState<DietaryLabel[]>([]);
  const [plan, setPlan] = useState<MealPlan | null | undefined>(undefined);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [grocery, setGrocery] = useState<Loadable<GroceryList | null>>({ data: null, loading: false, error: null });
  const [history, setHistory] = useState<Loadable<MealPlanSummary[]>>({ data: [], loading: false, error: null });
  const [favOverrides, setFavOverrides] = useState<Record<string, boolean>>({});
  // Plans don't say which recipes are favorites, so load the ids once.
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const planCache = useRef(new Map<string, MealPlan>());

  const loadGrocery = useCallback(
    async (p: MealPlan | null) => {
      if (!p) return setGrocery({ data: null, loading: false, error: null });
      setGrocery((g) => ({ ...g, loading: true, error: null }));
      try {
        setGrocery({ data: await mealPlansApi.groceryList(authedRequest, p.id), loading: false, error: null });
      } catch (e) {
        setGrocery((g) => ({ ...g, loading: false, error: message(e) }));
      }
    },
    [authedRequest],
  );

  const loadHistory = useCallback(async () => {
    setHistory((h) => ({ ...h, loading: true, error: null }));
    try {
      setHistory({ data: await mealPlansApi.list(authedRequest), loading: false, error: null });
    } catch (e) {
      setHistory((h) => ({ ...h, loading: false, error: message(e) }));
    }
  }, [authedRequest]);

  /** Apply a new current plan everywhere and refresh what depends on it. */
  const applyPlan = useCallback(
    (p: MealPlan | null, opts: { groceries?: boolean } = {}) => {
      setPlan(p);
      if (p) planCache.current.set(p.id, p);
      if (opts.groceries !== false) loadGrocery(p);
      loadHistory();
    },
    [loadGrocery, loadHistory],
  );

  const refresh = useCallback(async () => {
    setPlanError(null);
    const [p, l] = await Promise.allSettled([preferencesApi.get(authedRequest), preferencesApi.dietaryLabels()]);
    if (p.status === 'fulfilled') setPrefs(p.value);
    if (l.status === 'fulfilled') setLabels(l.value);
    try {
      applyPlan(await mealPlansApi.current(authedRequest));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) applyPlan(null);
      else {
        setPlan((cur) => (cur === undefined ? null : cur));
        setPlanError(message(e));
      }
    }
  }, [authedRequest, applyPlan]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    recipesApi
      .favorites(authedRequest, 0, 200)
      .then((p) => setFavoriteIds(new Set(p.items.map((r) => r.id))))
      .catch(() => {});
    // The backend plans in your timezone ("today", the weekly job's 11pm). Keep it in sync with the phone.
    if (!features.demoMode) {
      try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (zone) usersApi.updateTimezone(authedRequest, zone).catch(() => {});
      } catch {
        /* no Intl time zone support: the backend keeps its default */
      }
    }
  }, [authedRequest]);

  const run = useCallback(async (fn: () => Promise<MealPlan>, opts?: { groceries?: boolean }) => {
    setPlanBusy(true);
    setPlanError(null);
    try {
      applyPlan(await fn(), opts);
    } catch (e) {
      setPlanError(message(e));
      throw e;
    } finally {
      setPlanBusy(false);
    }
  }, [applyPlan]);

  const value = useMemo<AppData>(() => {
    const isFavorite = (r: Pick<RecipeSummary, 'id' | 'favorite'>) => favOverrides[r.id] ?? (r.favorite || favoriteIds.has(r.id));
    const mealById = (mealId: string) => plan?.meals.find((m) => m.id === mealId);
    return {
      prefs,
      labels,
      plan,
      planError,
      planBusy,
      grocery,
      history,
      refresh,

      savePreferences: async (body) => {
        setPrefs(await preferencesApi.replace(authedRequest, body));
      },
      // This week, even when it has started: the planner skips the days already over.
      generate: () => run(() => mealPlansApi.generate(authedRequest, prefs ? weekStartFor(todayISO(), prefs.planStartDay) : undefined)),
      regenerate: async () => {
        if (plan) await run(() => mealPlansApi.regenerate(authedRequest, plan.id));
      },
      toggleLock: async (mealId) => {
        const meal = mealById(mealId);
        if (!plan || !meal) return;
        // Optimistic: flip every day this recipe covers.
        setPlan({ ...plan, meals: plan.meals.map((m) => (m.selectionId === meal.selectionId ? { ...m, locked: !meal.locked } : m)) });
        try {
          const updated = await mealPlansApi.setLocked(authedRequest, plan, meal, !meal.locked);
          setPlan(updated);
          planCache.current.set(updated.id, updated);
        } catch (e) {
          setPlan(plan);
          setPlanError(message(e));
        }
      },
      swap: async (mealId, recipeId) => {
        const meal = mealById(mealId);
        if (plan && meal) await run(() => mealPlansApi.swap(authedRequest, plan, meal, recipeId));
      },
      setSide: async (mealId, recipeId) => {
        const meal = mealById(mealId);
        if (plan && meal) await run(() => mealPlansApi.setSide(authedRequest, plan, meal, recipeId));
      },
      removeSide: async (mealId) => {
        const meal = mealById(mealId);
        if (plan && meal) await run(() => mealPlansApi.removeSide(authedRequest, plan, meal));
      },
      addMeal: async (body) => {
        setPlanBusy(true);
        setPlanError(null);
        try {
          const updated = await mealPlansApi.addMeal(authedRequest, body);
          planCache.current.set(updated.id, updated);
          // Another week's plan: keep showing this week's, just refresh the history.
          const today = todayISO();
          if (updated.weekStartDate <= today && today <= updated.weekEndDate) applyPlan(updated);
          else loadHistory();
        } catch (e) {
          setPlanError(message(e));
          throw e;
        } finally {
          setPlanBusy(false);
        }
      },
      setPurchased: async (itemId, purchased) => {
        const prev = grocery.data;
        if (!prev) return;
        setGrocery((g) => ({ ...g, data: g.data && { ...g.data, items: g.data.items.map((i) => (i.id === itemId ? { ...i, purchased } : i)) } }));
        try {
          await mealPlansApi.setPurchased(authedRequest, itemId, purchased);
        } catch (e) {
          setGrocery((g) => ({ ...g, data: prev, error: message(e) }));
        }
      },
      setNeedToBuy: async (itemId, needToBuy) => {
        const prev = grocery.data;
        if (!prev) return;
        setGrocery((g) => ({ ...g, data: g.data && { ...g.data, items: g.data.items.map((i) => (i.id === itemId ? { ...i, needToBuy } : i)) } }));
        try {
          await mealPlansApi.setNeedToBuy(authedRequest, itemId, needToBuy);
          // The total changes with it; the backend recomputes it.
          if (plan) loadGrocery(plan);
        } catch (e) {
          setGrocery((g) => ({ ...g, data: prev, error: message(e) }));
        }
      },
      getPlan: async (id) => {
        const hit = planCache.current.get(id);
        if (hit) return hit;
        const p = await mealPlansApi.get(authedRequest, id);
        planCache.current.set(id, p);
        return p;
      },

      isFavorite,
      toggleFavorite: async (r) => {
        const next = !isFavorite(r);
        setFavOverrides((o) => ({ ...o, [r.id]: next }));
        try {
          await (next ? recipesApi.favorite(authedRequest, r.id) : recipesApi.unfavorite(authedRequest, r.id));
        } catch (e) {
          setFavOverrides((o) => ({ ...o, [r.id]: !next }));
          setPlanError(message(e));
        }
      },
    };
  }, [prefs, labels, plan, planError, planBusy, grocery, history, refresh, authedRequest, run, favOverrides, favoriteIds, applyPlan, loadGrocery, loadHistory]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppData must be used inside <AppDataProvider>');
  return ctx;
}
