// Persists mock state on the device so plans, locks, swaps and checked grocery
// items survive restarts. One namespace per account (or "demo").
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@/api/auth';
import type { MealPlan } from '@/api/mealPlans';
import type { PreferencesResponse } from '@/api/preferences';

export type MockState = {
  plans: Record<string, MealPlan>;
  /** Grocery item id -> purchased. */
  purchased: Record<string, boolean>;
  /** Past weeks were added for testing (see seedHistory). */
  historySeeded?: boolean;
  demo?: {
    user: User;
    prefs: PreferencesResponse | null;
    favorites: string[];
    seeded: boolean;
  };
};

const empty = (): MockState => ({ plans: {}, purchased: {} });
const cache = new Map<string, MockState>();
// v2: plans no longer cover days already over, so v1 plans (which did) are dropped.
const KEY = (ns: string) => `victual.mock.v2.${ns}`;

export async function load(ns: string): Promise<MockState> {
  const hit = cache.get(ns);
  if (hit) return hit;
  let state = empty();
  try {
    const raw = await AsyncStorage.getItem(KEY(ns));
    if (raw) state = { ...empty(), ...JSON.parse(raw) };
  } catch {
    /* start fresh */
  }
  cache.set(ns, state);
  return state;
}

export async function save(ns: string, state: MockState): Promise<void> {
  cache.set(ns, state);
  try {
    await AsyncStorage.setItem(KEY(ns), JSON.stringify(state));
  } catch {
    /* best effort */
  }
}

export async function reset(ns: string): Promise<void> {
  cache.delete(ns);
  try {
    await AsyncStorage.removeItem(KEY(ns));
  } catch {
    /* ignore */
  }
}
