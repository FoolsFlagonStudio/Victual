// Mirrors backend recipe/RecipeController, recipe/search and favorite/FavoriteController.
import { query } from './client';

export type FitFlag = {
  code: 'OVER_MAX_CALORIES' | 'UNDER_PROTEIN_TARGET' | 'OVER_CARBS_TARGET' | 'OVER_FAT_TARGET' | 'NUTRITION_INCOMPLETE';
  message: string;
};

export type RecipeSummary = {
  id: string;
  name: string;
  imageUrl: string | null;
  totalTimeMinutes: number | null;
  baseServings: number;
  caloriesPerServing: number | null;
  proteinGPerServing: number | null;
  carbsGPerServing: number | null;
  fatGPerServing: number | null;
  nutritionComplete: boolean;
  /** USD estimate. When costComplete is false the real cost is higher - show "from $X". */
  costPerServing: number | null;
  costComplete: boolean;
  mealPrepScore: number;
  labels: string[];
  flags: FitFlag[];
  favorite: boolean;
};

export type IngredientLine = {
  name: string;
  amount: number | null;
  displayAmount: string | null;
  /** Stored unit code: "cup", "fl_oz", "count", "to_taste"... */
  unit: string | null;
  prepNote: string | null;
  optional: boolean;
  rawText: string;
};

export type RecipeDetail = RecipeSummary & {
  description: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  servings: number;
  category: string | null;
  cuisine: string | null;
  sourceUrl: string | null;
  sourceHost: string | null;
  /** Cost of the chosen servings (not a shopping trip - see mobile README). */
  estimatedCost: number | null;
  ingredients: IngredientLine[];
  steps: { stepNumber: number; text: string }[];
};

export type Page<T> = { items: T[]; page: number; size: number; total: number };

export type MealFilter = 'breakfast' | 'lunch' | 'dinner' | 'side';

export type RecipeSort = 'fit' | 'time' | 'protein' | 'calories' | 'mealPrep' | 'newest' | 'cost';

export type RecipeSearch = {
  q?: string;
  labels?: string[];
  minProtein?: number;
  maxCalories?: number;
  maxTime?: number;
  maxCost?: number;
  /** Fits any of these: breakfast, lunch, dinner, side. */
  meals?: MealFilter[];
  sort?: RecipeSort;
  page?: number;
  size?: number;
};

type Authed = <T>(path: string, opts?: { method?: 'GET' | 'PUT' | 'DELETE' }) => Promise<T>;

export const recipesApi = {
  search: (authed: Authed, s: RecipeSearch) => authed<Page<RecipeSummary>>(`/api/recipes${query(s)}`),
  detail: (authed: Authed, id: string, servings?: number) =>
    authed<RecipeDetail>(`/api/recipes/${id}${query({ servings })}`),
  favorite: (authed: Authed, id: string) => authed<void>(`/api/recipes/${id}/favorite`, { method: 'PUT' }),
  unfavorite: (authed: Authed, id: string) => authed<void>(`/api/recipes/${id}/favorite`, { method: 'DELETE' }),
  favorites: (authed: Authed, page = 0, size = 20) =>
    authed<Page<RecipeSummary>>(`/api/users/me/favorites${query({ page, size })}`),
};
