# Meal plans in the app

The app uses the backend's meal plan routes (`MealPlanController`, `GroceryListController`). `src/api/mealPlans.ts` calls them and maps the JSON into the shapes the screens use, so screens never see the backend's `selections` / `days` / `toBuy` / `pantry` layout directly.

| App call | Backend route |
| --- | --- |
| `current` | `GET /api/meal-plans/current` (404 when no plan covers today) |
| `list` | `GET /api/meal-plans?page=0&size=52` |
| `get` | `GET /api/meal-plans/{id}` |
| `generate(weekStart)` | `POST /api/meal-plans/generate {weekStart}`: the app always sends this week's start. A week that has started is planned from today on |
| `regenerate` | `POST /api/meal-plans/{id}/regenerate` (locked and started meals are kept) |
| `setLocked` | `PATCH /api/meal-plans/{id}/selections/{selectionId} {locked}` |
| `swap` | `POST /api/meal-plans/{id}/selections/{selectionId}/swap {recipeId}` |
| `suggestions` | `GET /api/meal-plans/{id}/selections/{selectionId}/suggestions` |
| `sideSuggestions` / `setSide` / `removeSide` | `GET .../side-suggestions`, `POST .../side {recipeId?}`, `DELETE .../side` |
| `addMeal` | `POST /api/meal-plans/meals {date, slot, recipeId}` (creates the week's plan if needed) |
| `groceryList` | `GET /api/meal-plans/{id}/grocery-list` |
| `setPurchased` / `setNeedToBuy` | `PATCH /api/grocery-list-items/{id} {purchased}` / `{needToBuy}` |

How the mapping works:

- **Meals.** Each calendar meal becomes a `PlannedMeal` with the `selectionId` it's eaten from. Lock, swap and sides act on the selection, so they change every day that recipe covers. `started` is true once the selection's first day is today or earlier (the backend refuses to swap those).
- **Sides.** A selection's side shows as `meal.side`. Mains that want one (a plain roast chicken) get one when the plan is made; the Swap sheet's Side tab changes or removes it.
- **Costs.** The plan total is the grocery cost (whole packages) when the list exists, otherwise the usage cost. `costBySlot` adds up each slot's mains and sides.
- **Groceries.** `toBuy` and `pantry` items come back as one list, with `pantry: true` on the staples. The Groceries tab shows those in "Check your pantry", out of the total until you tap Need it.
- **Aisles.** The backend doesn't store aisles, so `src/lib/aisles.ts` guesses them from ingredient names.

## Simulated plans

`EXPO_PUBLIC_MOCK_PLANS=1` (or demo mode) sends these calls to `src/api/mock` instead. The mock plans with your real recipes, or sample ones in demo mode. It has no sides, pantry staples or auto-planning.
