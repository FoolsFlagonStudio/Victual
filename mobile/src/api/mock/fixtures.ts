// Sample recipes for demo mode (EXPO_PUBLIC_DEMO=1). Written for Victual, not
// scraped. Amounts are for `base` servings; the mock scales them like the backend.
import type { MealSlot } from '@/api/preferences';
import type { Aisle } from '@/api/mealPlans';

type Line = [amount: number | null, unit: string | null, name: string, aisle: Aisle, extra?: { note?: string; optional?: boolean }];

export type FixtureRecipe = {
  id: string;
  slot: MealSlot;
  name: string;
  description: string;
  prep: number;
  cook: number;
  base: number;
  /** Per serving: calories, protein g, carbs g, fat g. */
  macros: [number, number, number, number];
  cost: number;
  mealPrep: number;
  labels: string[];
  lines: Line[];
  steps: string[];
};

const FREE = (...extra: string[]) => [...new Set(['shellfish-free', 'nut-free', 'soy-free', ...extra])].sort();

export const FIXTURES: FixtureRecipe[] = [
  // Breakfast
  {
    id: 'r01', slot: 'BREAKFAST', name: 'Overnight oats', prep: 5, cook: 0, base: 2, macros: [380, 14, 58, 10], cost: 1.1, mealPrep: 90,
    description: 'Creamy make-ahead oats with chia and berries. Five minutes tonight, breakfast is done tomorrow.',
    labels: FREE('vegetarian', 'egg-free'),
    lines: [[1, 'cup', 'rolled oats', 'PANTRY'], [1, 'cup', 'milk', 'DAIRY'], [0.5, 'cup', 'plain Greek yogurt', 'DAIRY'], [2, 'tbsp', 'chia seeds', 'PANTRY'], [1, 'tbsp', 'maple syrup', 'PANTRY'], [1, 'cup', 'mixed berries', 'PRODUCE']],
    steps: ['Stir the oats, milk, yogurt, chia seeds and maple syrup together in a jar or bowl.', 'Cover and refrigerate for at least 4 hours, or overnight.', 'Stir, top with berries and eat cold.'],
  },
  {
    id: 'r02', slot: 'BREAKFAST', name: 'Veggie egg scramble', prep: 5, cook: 10, base: 2, macros: [310, 21, 8, 21], cost: 1.45, mealPrep: 30,
    description: 'Soft scrambled eggs with peppers, spinach and a little cheddar.',
    labels: FREE('vegetarian', 'gluten-free'),
    lines: [[6, 'count', 'large eggs', 'EGGS'], [1, 'count', 'bell pepper', 'PRODUCE', { note: 'diced' }], [2, 'cup', 'baby spinach', 'PRODUCE'], [0.25, 'cup', 'shredded cheddar', 'DAIRY'], [1, 'tbsp', 'butter', 'DAIRY'], [null, 'to_taste', 'salt and pepper', 'PANTRY']],
    steps: ['Melt the butter in a nonstick pan over medium heat and cook the pepper for 3 minutes.', 'Add the spinach and stir for 1 minute until it wilts.', 'Whisk the eggs with salt and pepper, pour them in and stir gently for 2-3 minutes until just set.', 'Fold in the cheddar and serve.'],
  },
  {
    id: 'r03', slot: 'BREAKFAST', name: 'Banana oat pancakes', prep: 5, cook: 15, base: 4, macros: [290, 9, 48, 7], cost: 0.85, mealPrep: 60,
    description: 'Fluffy blender pancakes sweetened with ripe banana.',
    labels: FREE('vegetarian'),
    lines: [[2, 'count', 'ripe bananas', 'PRODUCE'], [1.5, 'cup', 'rolled oats', 'PANTRY'], [2, 'count', 'large eggs', 'EGGS'], [1, 'cup', 'milk', 'DAIRY'], [2, 'tsp', 'baking powder', 'PANTRY'], [1, 'tsp', 'cinnamon', 'PANTRY']],
    steps: ['Blend everything until smooth and let the batter rest for 5 minutes.', 'Cook 1/4 cup portions on a greased griddle over medium heat for 2-3 minutes per side.', 'Serve warm, or cool and freeze for quick breakfasts.'],
  },
  {
    id: 'r04', slot: 'BREAKFAST', name: 'Greek yogurt parfait', prep: 5, cook: 0, base: 2, macros: [330, 24, 40, 8], cost: 1.6, mealPrep: 70,
    description: 'Layers of thick yogurt, granola and fruit.',
    labels: FREE('vegetarian', 'egg-free'),
    lines: [[2, 'cup', 'plain Greek yogurt', 'DAIRY'], [0.5, 'cup', 'granola', 'PANTRY'], [1, 'cup', 'strawberries', 'PRODUCE', { note: 'sliced' }], [1, 'tbsp', 'honey', 'PANTRY']],
    steps: ['Layer the yogurt, strawberries and granola in two glasses.', 'Drizzle with honey and serve.'],
  },
  {
    id: 'r05', slot: 'BREAKFAST', name: 'Freezer breakfast burritos', prep: 10, cook: 15, base: 4, macros: [450, 26, 38, 20], cost: 1.75, mealPrep: 95,
    description: 'Eggs, black beans and cheese rolled up and ready to reheat all week.',
    labels: FREE('vegetarian', 'high-protein'),
    lines: [[8, 'count', 'large eggs', 'EGGS'], [1, 'can', 'black beans', 'PANTRY', { note: 'drained' }], [1, 'cup', 'shredded cheddar', 'DAIRY'], [4, 'count', 'large flour tortillas', 'BAKERY'], [0.5, 'cup', 'salsa', 'PANTRY']],
    steps: ['Scramble the eggs over medium heat for 3-4 minutes, then stir in the beans.', 'Divide the eggs, cheese and salsa between the tortillas and roll them up tightly.', 'Eat now, or wrap in foil and freeze. Reheat from frozen for 2 minutes in the microwave.'],
  },
  // Lunch
  {
    id: 'r06', slot: 'LUNCH', name: 'Chicken grain bowl', prep: 10, cook: 20, base: 4, macros: [540, 38, 52, 18], cost: 2.4, mealPrep: 90,
    description: 'Smoky roasted chicken over quinoa with chickpeas, cucumber and lemon.',
    labels: FREE('dairy-free', 'egg-free', 'gluten-free', 'high-protein'),
    lines: [[1.5, 'lb', 'boneless chicken thighs', 'MEAT'], [1, 'cup', 'quinoa', 'PANTRY'], [1, 'can', 'chickpeas', 'PANTRY', { note: 'drained' }], [1, 'count', 'cucumber', 'PRODUCE', { note: 'chopped' }], [1, 'cup', 'cherry tomatoes', 'PRODUCE'], [1, 'count', 'lemon', 'PRODUCE'], [3, 'tbsp', 'olive oil', 'PANTRY'], [1, 'tsp', 'smoked paprika', 'PANTRY']],
    steps: ['Heat the oven to 425°F. Toss the chicken with 1 tablespoon of oil, the paprika and a pinch of salt.', 'Roast the chicken for 20 minutes, until it reaches 165°F.', 'Meanwhile, simmer the quinoa in 2 cups of water, covered, for 15 minutes.', 'Slice the chicken and divide everything between four containers. Dress with lemon and the rest of the oil.'],
  },
  {
    id: 'r07', slot: 'LUNCH', name: 'Black bean quesadillas', prep: 5, cook: 15, base: 4, macros: [480, 19, 55, 20], cost: 1.3, mealPrep: 50,
    description: 'Crispy tortillas packed with beans, corn and melty cheese.',
    labels: FREE('vegetarian', 'egg-free'),
    lines: [[1, 'can', 'black beans', 'PANTRY', { note: 'drained and mashed' }], [1, 'cup', 'frozen corn', 'FROZEN'], [1.5, 'cup', 'shredded Monterey Jack', 'DAIRY'], [8, 'count', 'small flour tortillas', 'BAKERY'], [1, 'tsp', 'cumin', 'PANTRY']],
    steps: ['Mix the beans, corn and cumin.', 'Spread the filling over four tortillas, top with cheese and the remaining tortillas.', 'Cook in a dry skillet over medium heat for 3 minutes per side, until golden and melted.'],
  },
  {
    id: 'r08', slot: 'LUNCH', name: 'Red lentil soup', prep: 10, cook: 25, base: 6, macros: [320, 17, 48, 7], cost: 0.95, mealPrep: 95,
    description: 'A cozy, lemony soup that tastes even better on day three.',
    labels: FREE('vegan', 'vegetarian', 'dairy-free', 'egg-free', 'gluten-free'),
    lines: [[1.5, 'cup', 'red lentils', 'PANTRY'], [1, 'count', 'yellow onion', 'PRODUCE', { note: 'diced' }], [2, 'count', 'carrots', 'PRODUCE', { note: 'diced' }], [3, 'clove', 'garlic', 'PRODUCE'], [6, 'cup', 'vegetable broth', 'PANTRY'], [2, 'tsp', 'cumin', 'PANTRY'], [1, 'count', 'lemon', 'PRODUCE'], [2, 'tbsp', 'olive oil', 'PANTRY']],
    steps: ['Cook the onion and carrots in the oil over medium heat for 6 minutes.', 'Stir in the garlic and cumin for 1 minute.', 'Add the lentils and broth, bring to a boil, then simmer for 20 minutes.', 'Blend half the soup, stir it back in and finish with lemon juice.'],
  },
  {
    id: 'r09', slot: 'LUNCH', name: 'Turkey pesto wraps', prep: 10, cook: 0, base: 4, macros: [430, 28, 36, 17], cost: 2.1, mealPrep: 60,
    description: 'Deli turkey, pesto, mozzarella and greens. No cooking.',
    labels: ['egg-free', 'high-protein', 'shellfish-free', 'soy-free'],
    lines: [[1, 'lb', 'sliced deli turkey', 'MEAT'], [4, 'count', 'large flour tortillas', 'BAKERY'], [0.25, 'cup', 'basil pesto', 'PANTRY'], [4, 'oz', 'fresh mozzarella', 'DAIRY'], [2, 'cup', 'mixed greens', 'PRODUCE']],
    steps: ['Spread pesto over each tortilla.', 'Layer turkey, mozzarella and greens, then roll up tightly and slice in half.'],
  },
  {
    id: 'r10', slot: 'LUNCH', name: 'Tuna salad sandwiches', prep: 10, cook: 0, base: 4, macros: [410, 27, 34, 17], cost: 1.8, mealPrep: 70,
    description: 'Classic tuna salad with crunchy celery and a squeeze of lemon.',
    labels: FREE('pescatarian', 'high-protein'),
    lines: [[3, 'can', 'tuna', 'PANTRY', { note: 'drained' }], [0.33, 'cup', 'mayonnaise', 'PANTRY'], [2, 'count', 'celery stalks', 'PRODUCE', { note: 'diced' }], [8, 'count', 'slices whole wheat bread', 'BAKERY'], [1, 'count', 'lemon', 'PRODUCE']],
    steps: ['Mix the tuna, mayonnaise, celery and a squeeze of lemon.', 'Divide between four slices of bread and top with the rest.'],
  },
  // Dinner
  {
    id: 'r11', slot: 'DINNER', name: 'Sheet-pan fajitas', prep: 15, cook: 20, base: 4, macros: [510, 36, 44, 20], cost: 2.85, mealPrep: 65,
    description: 'Chicken, peppers and onions roasted on one pan. Dinner with almost no dishes.',
    labels: FREE('dairy-free', 'egg-free', 'high-protein'),
    lines: [[1.5, 'lb', 'boneless skinless chicken breasts', 'MEAT'], [3, 'count', 'bell peppers', 'PRODUCE'], [1, 'count', 'yellow onion', 'PRODUCE'], [2, 'clove', 'garlic', 'PRODUCE'], [3, 'tbsp', 'olive oil', 'PANTRY'], [2, 'tbsp', 'fajita seasoning', 'PANTRY'], [8, 'count', 'small flour tortillas', 'BAKERY'], [null, null, 'Fajita toppings: sour cream, sliced avocado, shredded cheese', 'OTHER', { optional: true }]],
    steps: ['Heat the oven to 425°F.', 'Slice the chicken, peppers and onion into strips.', 'Toss everything with the oil, garlic and seasoning on a sheet pan.', 'Cook for 15-20 minutes or until the chicken is cooked through (165°F if you test with a thermometer).', 'Warm the tortillas and serve with your toppings.'],
  },
  {
    id: 'r12', slot: 'DINNER', name: 'One-pot turkey chili', prep: 10, cook: 35, base: 6, macros: [420, 32, 38, 14], cost: 1.95, mealPrep: 95,
    description: 'Hearty chili with lean turkey and two kinds of beans. Freezes perfectly.',
    labels: FREE('dairy-free', 'egg-free', 'gluten-free', 'high-protein'),
    lines: [[1, 'lb', 'ground turkey', 'MEAT'], [1, 'count', 'yellow onion', 'PRODUCE', { note: 'diced' }], [2, 'can', 'kidney beans', 'PANTRY'], [1, 'can', 'crushed tomatoes', 'PANTRY'], [2, 'tbsp', 'chili powder', 'PANTRY'], [1, 'cup', 'frozen corn', 'FROZEN'], [1, 'tbsp', 'olive oil', 'PANTRY']],
    steps: ['Brown the turkey and onion in the oil for 8 minutes.', 'Stir in the chili powder for 1 minute.', 'Add the beans, tomatoes and corn, then simmer for 25 minutes.', 'Taste for salt and serve, or portion and freeze.'],
  },
  {
    id: 'r13', slot: 'DINNER', name: 'Garlic butter shrimp pasta', prep: 10, cook: 15, base: 4, macros: [560, 30, 62, 20], cost: 3.2, mealPrep: 30,
    description: 'Shrimp and spaghetti in a quick garlic, butter and parmesan sauce.',
    labels: ['egg-free', 'nut-free', 'pescatarian', 'soy-free'],
    lines: [[2, 'lb', 'large frozen shrimp', 'FROZEN', { note: 'thawed' }], [12, 'oz', 'spaghetti', 'PANTRY'], [4, 'tbsp', 'butter', 'DAIRY'], [4, 'clove', 'garlic', 'PRODUCE'], [8, 'oz', 'parmesan cheese', 'DAIRY'], [1, 'count', 'lemon', 'PRODUCE']],
    steps: ['Boil the spaghetti for 10 minutes. Save 1/2 cup of the water, then drain.', 'Melt the butter and cook the garlic for 1 minute.', 'Add the shrimp and cook for 3 minutes, until pink.', 'Toss in the pasta, cheese, lemon and a splash of pasta water.'],
  },
  {
    id: 'r14', slot: 'DINNER', name: 'Teriyaki chicken rice bowls', prep: 10, cook: 20, base: 4, macros: [530, 34, 66, 12], cost: 2.2, mealPrep: 85,
    description: 'Sticky homemade teriyaki chicken with rice and broccoli.',
    labels: ['dairy-free', 'egg-free', 'high-protein', 'nut-free', 'shellfish-free'],
    lines: [[1.5, 'lb', 'boneless chicken thighs', 'MEAT'], [1.5, 'cup', 'white rice', 'PANTRY'], [1, 'lb', 'broccoli florets', 'PRODUCE'], [0.33, 'cup', 'soy sauce', 'PANTRY'], [2, 'tbsp', 'honey', 'PANTRY'], [1, 'tbsp', 'cornstarch', 'PANTRY']],
    steps: ['Cook the rice according to the package, about 18 minutes.', 'Brown the chicken pieces in a hot skillet for 6 minutes.', 'Whisk the soy sauce, honey, cornstarch and 1/4 cup water, pour it over the chicken and simmer for 3 minutes until glossy.', 'Steam the broccoli for 4 minutes and build the bowls.'],
  },
  {
    id: 'r15', slot: 'DINNER', name: 'Tofu veggie stir fry', prep: 15, cook: 10, base: 4, macros: [390, 20, 42, 15], cost: 1.7, mealPrep: 60,
    description: 'Crispy tofu and crunchy vegetables in a ginger garlic sauce.',
    labels: ['dairy-free', 'egg-free', 'nut-free', 'shellfish-free', 'vegan', 'vegetarian'],
    lines: [[14, 'oz', 'extra-firm tofu', 'PRODUCE', { note: 'pressed and cubed' }], [2, 'count', 'bell peppers', 'PRODUCE'], [2, 'cup', 'snap peas', 'PRODUCE'], [1, 'tbsp', 'fresh ginger', 'PRODUCE', { note: 'grated' }], [3, 'tbsp', 'soy sauce', 'PANTRY'], [2, 'tbsp', 'vegetable oil', 'PANTRY'], [1.5, 'cup', 'white rice', 'PANTRY']],
    steps: ['Cook the rice according to the package.', 'Fry the tofu in the oil over high heat for 6 minutes, turning, until crisp.', 'Add the vegetables and ginger and stir fry for 4 minutes.', 'Add the soy sauce, toss and serve over rice.'],
  },
  {
    id: 'r16', slot: 'DINNER', name: 'Steak and crispy potatoes', prep: 10, cook: 30, base: 2, macros: [640, 42, 38, 34], cost: 5.1, mealPrep: 20,
    description: 'Pan-seared New York strip with garlicky roasted potatoes.',
    labels: FREE('dairy-free', 'egg-free', 'gluten-free', 'high-protein'),
    lines: [[2, 'count', 'New York strip steaks', 'MEAT'], [1, 'lb', 'baby potatoes', 'PRODUCE', { note: 'halved' }], [2, 'tbsp', 'olive oil', 'PANTRY'], [3, 'clove', 'garlic', 'PRODUCE'], [null, 'to_taste', 'salt and pepper', 'PANTRY']],
    steps: ['Heat the oven to 425°F. Toss the potatoes with oil and salt and roast for 25 minutes.', 'Season the steaks well and let them sit at room temperature while the potatoes roast.', 'Sear the steaks in a very hot skillet for 4 minutes per side for medium-rare.', 'Rest the steaks for 5 minutes, slice and serve with the potatoes.'],
  },
  {
    id: 'r17', slot: 'DINNER', name: 'Lemon salmon and green beans', prep: 5, cook: 15, base: 4, macros: [470, 34, 22, 26], cost: 4.2, mealPrep: 40,
    description: 'Roasted salmon and green beans on one pan with lemon and garlic.',
    labels: FREE('dairy-free', 'egg-free', 'gluten-free', 'high-protein', 'pescatarian'),
    lines: [[1.5, 'lb', 'salmon fillets', 'SEAFOOD'], [1, 'lb', 'green beans', 'PRODUCE'], [2, 'count', 'lemons', 'PRODUCE'], [2, 'tbsp', 'olive oil', 'PANTRY'], [2, 'clove', 'garlic', 'PRODUCE']],
    steps: ['Heat the oven to 400°F.', 'Arrange the salmon and green beans on a sheet pan, then drizzle with oil, garlic and lemon slices.', 'Roast for 12-15 minutes, until the salmon flakes easily.'],
  },
];

export const DIETARY_LABEL_NAMES = [
  'dairy-free', 'egg-free', 'gluten-free', 'high-protein', 'nut-free', 'pescatarian', 'shellfish-free', 'soy-free', 'vegan', 'vegetarian',
];
