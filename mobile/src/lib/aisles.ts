// Grocery aisle for an ingredient. Catalog ingredients have their aisle listed in
// ingredient-aisles.json (one entry per row in data_pipeline/ingredients_seed.csv; add one
// when you add a row). Anything else falls back to these word rules, first match wins:
// shelf-stable things made from fresh foods come before the fresh-food words, so chicken
// broth is pantry, not meat, and lemon juice isn't produce.
import type { Aisle } from '@/api/mealPlans';
import CATALOG_AISLES from './ingredient-aisles.json';

const AISLE_WORDS: [Aisle, RegExp][] = [
  ['FROZEN', /frozen/i],
  // Shelf-stable things made from fresh foods, before the fresh-food words catch them:
  // chicken broth isn't meat, lemon juice isn't produce, garlic powder isn't garlic.
  ['PANTRY', /broth|stock|bouillon|\bbase\b|juice|powder|paste|sauce|ketchup|mustard|mayo|vinegar|\boil\b|extract|flakes|seasoning|spice|black pepper|peppercorn|peanut butter|coconut milk|evaporated|condensed|cream of|canned|jam|preserves|jelly|syrup|honey|molasses|salsa|pesto|dressing|vinaigrette|chips|crackers|cereal|granola|sun-dried|dried (?!fresh)/i],
  ['SEAFOOD', /shrimp|salmon|tuna|cod|tilapia|fish|scallop|crab|lobster|clam|mussel|calamari|squid|anchov|halibut|trout|snapper/i],
  ['MEAT', /chicken|beef|steak|turkey|pork|bacon|sausage|\bham\b|lamb|chorizo|salami|prosciutto|pancetta|pepperoni|bratwurst|carne asada|ribs?\b|chuck|sirloin|brisket/i],
  ['EGGS', /\beggs?\b/i],
  ['DAIRY', /milk|cheese|cheddar|parmesan|mozzarella|feta|ricotta|yogurt|butter|cream|ghee|half and half/i],
  ['BAKERY', /bread|tortilla|\bbuns?\b|bagel|pita|roll|biscuit|croissant/i],
  ['PRODUCE', /onion|garlic|scallion|shallot|leek|pepper|chile|jalapeno|tomato|lettuce|romaine|arugula|spinach|carrot|potato|squash|eggplant|beet|radish|fennel|lemon|lime|orange|apple|banana|berr|grape|mango|pineapple|peach|pear|kiwi|plantain|cherr|avocado|cucumber|broccoli|cauliflower|asparagus|sprout|green bean|herb|cilantro|parsley|basil|dill|mint|thyme|rosemary|sage|ginger|celery|zucchini|mushroom|kale|cabbage|greens|peas|corn\b|tofu/i],
  ['PANTRY', /rice|pasta|spaghetti|noodle|oat|flour|sugar|bean|lentil|chickpea|quinoa|cumin|paprika|chili|salt|can|seed|nut|cornstarch|baking|cocoa|chocolate|breadcrumb|panko/i],
];

const catalog = CATALOG_AISLES as Record<string, Aisle>;

export const guessAisle = (name: string): Aisle =>
  catalog[name.trim().toLowerCase()] ?? AISLE_WORDS.find(([, re]) => re.test(name))?.[0] ?? 'OTHER';
