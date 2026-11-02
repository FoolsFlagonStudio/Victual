// Mirrors backend user/PreferencesController and diet/DietaryLabelController.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { request } from './client';

export type MealSlot = 'BREAKFAST' | 'LUNCH' | 'DINNER';
export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export type DietaryLabel = { id: string; name: string };

/** PreferencesRequest. Macro targets are per meal (see RecipeFitEvaluator). */
export type PreferencesRequest = {
  weeklyBudget: number;
  householdServingSize: number;
  maxCaloriesPerMeal?: number | null;
  maxCaloriesPerDay?: number | null;
  proteinTargetGrams?: number | null;
  carbsTargetGrams?: number | null;
  fatTargetGrams?: number | null;
  repeatAvoidanceDays: number;
  planStartDay: DayOfWeek;
  prefersMealPrep?: boolean | null;
  /** Dinner leftovers fill the next day's lunch (when both are planned). */
  leftoversForLunch?: boolean | null;
  /**
   * Build the coming week's plan automatically, at 11pm on autoPlanDay (default:
   * the night before planStartDay). Older backends ignored these, so the app also
   * keeps a local copy (see `withLocalAutoPlan`).
   */
  autoPlanEnabled?: boolean;
  autoPlanDay?: DayOfWeek;
  dietaryLabelIds: string[];
  /** Recipes per week for each included slot (1-7). */
  mealSlots: Partial<Record<MealSlot, number>>;
};

export type PreferencesResponse = Omit<PreferencesRequest, 'dietaryLabelIds'> & {
  dietaryRestrictions: DietaryLabel[];
  updatedAt: string;
};

type Authed = <T>(path: string, opts?: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown }) => Promise<T>;

// Local copy of the proposed auto-plan fields, used until the backend returns them.
const AUTO_KEY = 'victual.autoPlan';
type AutoPlan = Pick<PreferencesRequest, 'autoPlanEnabled' | 'autoPlanDay'>;

async function rememberAutoPlan(body: PreferencesRequest) {
  try {
    await AsyncStorage.setItem(AUTO_KEY, JSON.stringify({ autoPlanEnabled: body.autoPlanEnabled, autoPlanDay: body.autoPlanDay }));
  } catch {
    /* best effort */
  }
}

async function withLocalAutoPlan(res: PreferencesResponse): Promise<PreferencesResponse> {
  if (res.autoPlanDay !== undefined) return res; // backend stores it now
  try {
    const raw = await AsyncStorage.getItem(AUTO_KEY);
    return raw ? { ...res, ...(JSON.parse(raw) as AutoPlan) } : res;
  } catch {
    return res;
  }
}

export const preferencesApi = {
  dietaryLabels: () => request<DietaryLabel[]>('/api/dietary-labels'),
  get: async (authed: Authed) => withLocalAutoPlan(await authed<PreferencesResponse>('/api/users/me/preferences')),
  create: async (authed: Authed, body: PreferencesRequest) => {
    await rememberAutoPlan(body);
    return withLocalAutoPlan(await authed<PreferencesResponse>('/api/users/me/preferences', { method: 'POST', body }));
  },
  replace: async (authed: Authed, body: PreferencesRequest) => {
    await rememberAutoPlan(body);
    return withLocalAutoPlan(await authed<PreferencesResponse>('/api/users/me/preferences', { method: 'PUT', body }));
  },
};
