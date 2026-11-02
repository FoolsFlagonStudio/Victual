// Onboarding answers, the step order, and how answers map onto the backend's
// PreferencesRequest.
import type { DayOfWeek, DietaryLabel, MealSlot, PreferencesRequest, PreferencesResponse } from '@/api/preferences';
import { dayBefore } from '@/lib/dates';
import { Icon } from '@/theme/icons';

export const STEPS = [
  'intro',
  'budget',
  'household',
  'meals',
  'perWeek',
  'weekStart',
  'diet',
  'allergies',
  'macros',
  'review',
] as const;
export type Step = (typeof STEPS)[number];

export type DietKey = 'lowCalorie' | 'highProtein' | 'vegan' | 'vegetarian' | 'pescatarian' | 'lowCarb';
export type AllergyKey = 'nut' | 'gluten' | 'dairy' | 'egg' | 'soy' | 'shellfish';
export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat';

export type Answers = {
  budget: number;
  household: number;
  meals: MealSlot[];
  perWeek: Record<MealSlot, number>;
  weekStart: DayOfWeek;
  /** Build next week's plan automatically on autoPlanDay. */
  autoPlan: boolean;
  autoPlanDay: DayOfWeek;
  /** True once the user picks an auto-plan day themselves (stops it following weekStart). */
  autoPlanDayTouched: boolean;
  /** Cook dinner for one more and eat it for the next day's lunch (needs both slots). */
  leftoversForLunch: boolean;
  /** The user changed recipes-per-week themselves, so stop suggesting counts. */
  perWeekTouched: boolean;
  diets: DietKey[];
  allergies: AllergyKey[];
  /** Kept as text so fields can be empty. Per meal. */
  macros: Record<MacroKey, string>;
};

export const initialAnswers: Answers = {
  budget: 0,
  household: 2,
  meals: ['LUNCH', 'DINNER'],
  perWeek: { BREAKFAST: 3, LUNCH: 3, DINNER: 4 },
  weekStart: 'SUNDAY',
  autoPlan: true,
  autoPlanDay: 'SATURDAY',
  autoPlanDayTouched: false,
  leftoversForLunch: false,
  perWeekTouched: false,
  diets: [],
  allergies: [],
  macros: { calories: '', protein: '', carbs: '', fat: '' },
};

export const BUDGET_PRESETS = [75, 100, 125];
export const HOUSEHOLD = { min: 1, max: 20 };
export const PER_WEEK = { min: 1, max: 7 };

export const MEALS: { slot: MealSlot; label: string; plural: string; Icon: (typeof Icon)[keyof typeof Icon] }[] = [
  { slot: 'BREAKFAST', label: 'Breakfast', plural: 'Breakfasts', Icon: Icon.breakfast },
  { slot: 'LUNCH', label: 'Lunch', plural: 'Lunches', Icon: Icon.lunch },
  { slot: 'DINNER', label: 'Dinner', plural: 'Dinners', Icon: Icon.dinner },
];

export const DAYS: { day: DayOfWeek; short: string; long: string }[] = [
  { day: 'SUNDAY', short: 'Sun', long: 'Sunday' },
  { day: 'MONDAY', short: 'Mon', long: 'Monday' },
  { day: 'TUESDAY', short: 'Tue', long: 'Tuesday' },
  { day: 'WEDNESDAY', short: 'Wed', long: 'Wednesday' },
  { day: 'THURSDAY', short: 'Thu', long: 'Thursday' },
  { day: 'FRIDAY', short: 'Fri', long: 'Friday' },
  { day: 'SATURDAY', short: 'Sat', long: 'Saturday' },
];

/**
 * Diets. Most map to a backend dietary label (recipes must carry it). Low Calorie
 * and Low Carb aren't labels: they pre-fill a per-meal macro target instead,
 * which the backend's fit ranking already uses.
 */
export const DIETS: {
  key: DietKey;
  label: string;
  Icon: (typeof Icon)[keyof typeof Icon];
  dietaryLabel?: string;
  prefill?: Partial<Record<MacroKey, string>>;
}[] = [
  { key: 'lowCalorie', label: 'Low Calorie', Icon: Icon.calories, prefill: { calories: '500' } },
  { key: 'highProtein', label: 'High Protein', Icon: Icon.protein, dietaryLabel: 'high-protein' },
  { key: 'vegan', label: 'Vegan', Icon: Icon.vegan, dietaryLabel: 'vegan' },
  { key: 'vegetarian', label: 'Vegetarian', Icon: Icon.vegetarian, dietaryLabel: 'vegetarian' },
  { key: 'pescatarian', label: 'Pescatarian', Icon: Icon.seafood, dietaryLabel: 'pescatarian' },
  { key: 'lowCarb', label: 'Low Carb', Icon: Icon.lowCarb, prefill: { carbs: '30' } },
];

export const ALLERGIES: { key: AllergyKey; label: string; Icon: (typeof Icon)[keyof typeof Icon]; dietaryLabel: string }[] = [
  { key: 'nut', label: 'Nut Allergy', Icon: Icon.nutAllergy, dietaryLabel: 'nut-free' },
  { key: 'gluten', label: 'Gluten Intolerance', Icon: Icon.glutenAllergy, dietaryLabel: 'gluten-free' },
  { key: 'dairy', label: 'Lactose Intolerance', Icon: Icon.lactoseIntolerance, dietaryLabel: 'dairy-free' },
  { key: 'egg', label: 'Egg Allergy', Icon: Icon.eggAllergy, dietaryLabel: 'egg-free' },
  { key: 'soy', label: 'Soy Allergy', Icon: Icon.soyAllergy, dietaryLabel: 'soy-free' },
  { key: 'shellfish', label: 'Shellfish Allergy', Icon: Icon.shellfishAllergy, dietaryLabel: 'shellfish-free' },
];

export const MACROS: { key: MacroKey; label: string; unit: string; max: number }[] = [
  { key: 'calories', label: 'Calories', unit: 'cal max', max: 3000 },
  { key: 'protein', label: 'Protein', unit: 'g min', max: 300 },
  { key: 'carbs', label: 'Carbs', unit: 'g max', max: 500 },
  { key: 'fat', label: 'Fat', unit: 'g max', max: 300 },
];

/** Whether Next is allowed on a step. */
export function canContinue(step: Step, a: Answers): boolean {
  switch (step) {
    case 'budget':
      return a.budget >= 1;
    case 'meals':
      return a.meals.length > 0;
    case 'macros':
      return MACROS.every((m) => macroError(m.key, a.macros[m.key]) == null);
    default:
      return true;
  }
}

export function macroError(key: MacroKey, value: string): string | null {
  if (!value) return null;
  const n = Number(value);
  const max = MACROS.find((m) => m.key === key)!.max;
  if (!Number.isInteger(n) || n < 0) return 'Whole numbers only.';
  if (key === 'calories' && n === 0) return 'Must be more than 0.';
  if (n > max) return `That's more than ${max} per meal.`;
  return null;
}

/**
 * `base` keeps fields onboarding doesn't ask about (daily calories, meal prep,
 * repeat avoidance) when editing saved preferences from Profile.
 */
export function toPreferencesRequest(a: Answers, labels: DietaryLabel[], base?: PreferencesResponse | null): PreferencesRequest {
  const idFor = (name?: string) => labels.find((l) => l.name === name)?.id;
  const ids = [
    ...DIETS.filter((d) => a.diets.includes(d.key)).map((d) => idFor(d.dietaryLabel)),
    ...ALLERGIES.filter((x) => a.allergies.includes(x.key)).map((x) => idFor(x.dietaryLabel)),
  ].filter((id): id is string => !!id);
  const num = (v: string) => (v ? Number(v) : null);

  return {
    weeklyBudget: a.budget,
    householdServingSize: a.household,
    maxCaloriesPerMeal: num(a.macros.calories),
    proteinTargetGrams: num(a.macros.protein),
    carbsTargetGrams: num(a.macros.carbs),
    fatTargetGrams: num(a.macros.fat),
    maxCaloriesPerDay: base?.maxCaloriesPerDay ?? null,
    prefersMealPrep: base?.prefersMealPrep ?? null,
    leftoversForLunch: a.leftoversForLunch && a.meals.includes('LUNCH') && a.meals.includes('DINNER'),
    repeatAvoidanceDays: base?.repeatAvoidanceDays ?? 14,
    planStartDay: a.weekStart,
    autoPlanEnabled: a.autoPlan,
    autoPlanDay: a.autoPlanDay,
    dietaryLabelIds: [...new Set(ids)],
    mealSlots: Object.fromEntries(a.meals.map((slot) => [slot, a.perWeek[slot]])),
  };
}

/** Saved preferences back into onboarding answers, for editing from Profile. */
export function fromPreferences(p: PreferencesResponse): Answers {
  const names = new Set(p.dietaryRestrictions.map((l) => l.name));
  const str = (n: number | null | undefined) => (n == null ? '' : String(n));
  const meals = (['BREAKFAST', 'LUNCH', 'DINNER'] as MealSlot[]).filter((s) => p.mealSlots[s]);
  return {
    budget: Math.round(Number(p.weeklyBudget)),
    household: p.householdServingSize,
    meals,
    perWeek: {
      BREAKFAST: p.mealSlots.BREAKFAST ?? initialAnswers.perWeek.BREAKFAST,
      LUNCH: p.mealSlots.LUNCH ?? initialAnswers.perWeek.LUNCH,
      DINNER: p.mealSlots.DINNER ?? initialAnswers.perWeek.DINNER,
    },
    weekStart: p.planStartDay,
    autoPlan: p.autoPlanEnabled ?? true,
    autoPlanDay: p.autoPlanDay ?? dayBefore(p.planStartDay),
    autoPlanDayTouched: p.autoPlanDay != null && p.autoPlanDay !== dayBefore(p.planStartDay),
    leftoversForLunch: !!p.leftoversForLunch,
    perWeekTouched: true,
    // Low Calorie / Low Carb aren't stored as labels; they show as picked when their target is set low.
    diets: DIETS.filter((d) =>
      d.dietaryLabel
        ? names.has(d.dietaryLabel)
        : d.key === 'lowCalorie'
          ? p.maxCaloriesPerMeal != null && p.maxCaloriesPerMeal <= 600
          : p.carbsTargetGrams != null && p.carbsTargetGrams <= 40,
    ).map((d) => d.key),
    allergies: ALLERGIES.filter((x) => names.has(x.dietaryLabel)).map((x) => x.key),
    macros: { calories: str(p.maxCaloriesPerMeal), protein: str(p.proteinTargetGrams), carbs: str(p.carbsTargetGrams), fat: str(p.fatTargetGrams) },
  };
}
