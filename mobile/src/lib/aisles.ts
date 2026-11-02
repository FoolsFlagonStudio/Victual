// Grocery aisle from an ingredient name. The backend doesn't store aisles, so the
// list is grouped by these words (first match wins, so frozen peas are frozen).
import type { Aisle } from '@/api/mealPlans';

const AISLE_WORDS: [Aisle, RegExp][] = [
  ['FROZEN', /frozen/i],
  ['SEAFOOD', /shrimp|salmon|tuna|cod|tilapia|fish|scallop|crab/i],
  ['MEAT', /chicken|beef|steak|turkey|pork|bacon|sausage|ham|lamb/i],
  ['EGGS', /\beggs?\b/i],
  ['DAIRY', /milk|cheese|cheddar|parmesan|mozzarella|yogurt|butter|cream/i],
  ['BAKERY', /bread|tortilla|bun|bagel|pita|roll/i],
  ['PRODUCE', /onion|garlic|pepper(?!corn)|tomato|lettuce|spinach|carrot|potato|lemon|lime|apple|banana|berr|avocado|cucumber|broccoli|bean sprout|green bean|herb|cilantro|parsley|basil|ginger|celery|zucchini|mushroom|kale|cabbage|greens|peas|tofu/i],
  ['PANTRY', /rice|pasta|spaghetti|oat|flour|sugar|oil|vinegar|sauce|broth|stock|bean|lentil|chickpea|quinoa|spice|cumin|paprika|chili|salt|honey|syrup|seasoning|can|seed|granola|mayo|salsa|pesto|cornstarch|baking/i],
];

export const guessAisle = (name: string): Aisle => AISLE_WORDS.find(([, re]) => re.test(name))?.[0] ?? 'OTHER';
