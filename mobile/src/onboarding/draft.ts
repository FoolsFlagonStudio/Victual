// Saves onboarding progress on the device so closing the app mid-way resumes
// at the same step with the same answers. One draft per account, cleared once
// preferences are saved. Nothing here is sensitive, so plain AsyncStorage is fine.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ALLERGIES, DAYS, DIETS, STEPS, initialAnswers, type Answers } from './model';

// Bump when the Answers shape changes in a way old drafts can't satisfy.
const VERSION = 1;
const key = (userId: string) => `victual.onboarding.${userId}`;

export type Draft = { index: number; answers: Answers };

export const onboardingDraft = {
  async load(userId: string): Promise<Draft | null> {
    try {
      const raw = await AsyncStorage.getItem(key(userId));
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (saved?.version !== VERSION) return null;
      return sanitize(saved);
    } catch {
      return null; // corrupt or unreadable draft: start fresh
    }
  },

  async save(userId: string, draft: Draft): Promise<void> {
    try {
      await AsyncStorage.setItem(key(userId), JSON.stringify({ version: VERSION, ...draft }));
    } catch {
      // Best effort: losing a draft only means starting onboarding over.
    }
  },

  async clear(userId: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key(userId));
    } catch {
      /* ignore */
    }
  },
};

/** Merge over the defaults and clamp anything out of range, so a stale draft can't break a step. */
function sanitize(saved: { index?: unknown; answers?: Partial<Answers> }): Draft {
  const a = { ...initialAnswers, ...(saved.answers ?? {}) };
  const int = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;

  const answers: Answers = {
    budget: int(a.budget, 0, 9999, 0),
    household: int(a.household, 1, 20, initialAnswers.household),
    meals: Array.isArray(a.meals) ? a.meals.filter((m) => m in initialAnswers.perWeek) : initialAnswers.meals,
    perWeek: {
      BREAKFAST: int(a.perWeek?.BREAKFAST, 1, 7, initialAnswers.perWeek.BREAKFAST),
      LUNCH: int(a.perWeek?.LUNCH, 1, 7, initialAnswers.perWeek.LUNCH),
      DINNER: int(a.perWeek?.DINNER, 1, 7, initialAnswers.perWeek.DINNER),
    },
    weekStart: DAYS.some((d) => d.day === a.weekStart) ? a.weekStart : initialAnswers.weekStart,
    autoPlan: typeof a.autoPlan === 'boolean' ? a.autoPlan : initialAnswers.autoPlan,
    autoPlanDay: DAYS.some((d) => d.day === a.autoPlanDay) ? a.autoPlanDay : initialAnswers.autoPlanDay,
    autoPlanDayTouched: !!a.autoPlanDayTouched,
    leftoversForLunch: !!a.leftoversForLunch,
    perWeekTouched: !!a.perWeekTouched,
    diets: Array.isArray(a.diets) ? a.diets.filter((k) => DIETS.some((d) => d.key === k)) : [],
    allergies: Array.isArray(a.allergies) ? a.allergies.filter((k) => ALLERGIES.some((x) => x.key === k)) : [],
    macros: { ...initialAnswers.macros, ...(a.macros ?? {}) },
  };
  return { index: int(saved.index, 0, STEPS.length - 1, 0), answers };
}
