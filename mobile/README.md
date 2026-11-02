# Victual Mobile

The Victual app for iOS and Android, built with Expo and React Native. This is the user-facing product: preferences, weekly meal plans, recipes, and grocery lists.

> **Status:** every designed screen is built: splash, auth, onboarding, and the main app (Home, Plan, Groceries, Recipes, Profile, recipe detail, cook mode, budget, settings). Everything uses the live backend, meal plans and grocery lists included (see [docs/meal-plan-api.md](docs/meal-plan-api.md)). `EXPO_PUBLIC_MOCK_PLANS=1` simulates plans on the device instead, and `EXPO_PUBLIC_DEMO=1` runs the whole app on sample data.

## Screens

| Tab / screen | What it does |
| --- | --- |
| Home | This week's grocery total vs budget (tap for Budget), today's meals, Regen / Swap / Favs. Empty week and over-budget states. |
| Plan | This week by day, or History week by week |
| Groceries | This week's list by aisle; check items off |
| Recipes | Search, diet filters, collections (under $3, new, quick, meal prep, protein), favorites, infinite scroll |
| Profile | Plan settings (edited with the onboarding screens), appearance, account, support, log out, delete account |
| Recipe detail | Macros, servings scaling, ingredients checklist, directions, nutrition, source link |
| Cook mode | One step at a time, timers parsed from the step ("15-20 minutes" -> 15:00), screen stays on, thumbs up/down at the end |
| Budget | Breakdown by meal, history chart, weeks under budget |

**Lock / swap / regenerate.** The lock on a meal card keeps it through Regen. Swap opens a sheet: pick a meal, then a suggestion (with the price difference), a favorite, or any recipe by search; the Side tab adds, changes or removes the side cooked with it. Changing a meal changes every leftover day of it too. Meals whose day has started can't be swapped.

**Add to plan.** Every recipe page has Add to plan: pick a day and meal. An open slot gets the recipe, a planned one is swapped, and with no plan for the week yet you can plan the week around it or add just that meal.

**Cook mode timers** keep running when you move between steps or leave the app, and a notification goes off when one ends (local notifications, works in Expo Go).

**Data modes** (`src/config/features.ts`, set in `.env.local`):

- Default: everything from the live backend. `EXPO_PUBLIC_MOCK_PLANS=1` simulates meal plans on the device instead (a dashed "Preview" note shows on plan screens while it is on).
- `EXPO_PUBLIC_DEMO=1`: everything runs on built-in sample recipes with nine weeks of history, no backend needed. Any email and password logs in. Good for portfolio demos and UI work.

## Responsibilities

The app talks only to the backend API (see [../backend/README.md](../backend/README.md)). It never connects to the database or any third-party data source directly. All recipe parsing, nutrition, pricing, and meal plan generation happen on the backend.

## Planned Features

| Feature                                                                                                                                         | Backend routes                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign up, log in, email verification, password reset                                                                                             | `/api/auth/*`                                                                                                                               |
| Onboarding: weekly budget, household size, dietary restrictions, calorie and macro targets, meals per week, plan start day, leftovers for lunch | `/api/users/me/preferences`                                                                                                                 |
| Timezone, sent at signup or from the device (when "11pm the night before" is)                                                                   | `PATCH /api/users/me` (`timezone`)                                                                                                          |
| Browse and search recipes (with fit flags), scale servings                                                                                      | `/api/recipes`, `/api/recipes/{id}?servings=`                                                                                               |
| Recipe cost: per-serving estimate on cards, `sort=cost`, `maxCost` filter, total for the chosen servings in detail                              | `/api/recipes`, `/api/recipes/{id}?servings=`                                                                                               |
| Favorite recipes                                                                                                                                | `PUT`/`DELETE /api/recipes/{id}/favorite`, `/api/users/me/favorites`                                                                        |
| This week's plan (calendar from `days`, open meals from `open`), past plans, delete                                                             | `/api/meal-plans/current`, `/api/meal-plans`, `/api/meal-plans/{id}`                                                                        |
| Make a plan now (otherwise one appears at 11pm the night before the start day)                                                                  | `POST /api/meal-plans/generate`                                                                                                             |
| Lock a meal, swap it (a suggestion or "pick for me"), redraw the rest                                                                           | `PATCH .../selections/{id}`, `POST .../selections/{id}/swap`, `GET .../selections/{id}/suggestions`, `POST /api/meal-plans/{id}/regenerate` |
| Grocery list: to-buy and "check your pantry" groups, packages and costs, purchased checkboxes, "need to buy" for staples                        | `/api/meal-plans/{id}/grocery-list`, `PATCH /api/grocery-list-items/{id}`                                                                   |

## Auth

Screens live in `src/app/(auth)/`, the session in `src/auth/AuthProvider.tsx`, and the API calls in `src/api/auth.ts`.

```
Splash ──▶ Log In ──▶ Home
   │         │  └─ unverified? ──▶ Verify Email (fresh code sent)
   │         └─ Forgot Password ──▶ Reset Password ──▶ Home
   └──▶ Sign Up ──▶ Verify Email ──▶ Onboarding ──▶ Home
                       └─ Change Email ──▶ back to Sign Up, prefilled
```

- **Codes, not links.** The backend emails a 6-digit code for verification and password resets, so Verify Email has a code entry (it submits on its own, and supports paste and one-time-code autofill) and Reset Password has a code field.
- **Tokens.** The refresh token is stored with `expo-secure-store` (Keychain / Keystore); the short-lived access token stays in memory. On launch the splash restores the session with a refresh. `authedRequest()` attaches the access token and retries once after a refresh on a 401. Refresh tokens rotate, so concurrent refreshes share one call.
- **Route guards.** `(auth)` redirects to Home when signed in; `(app)` redirects to Log In when signed out.
- **Social sign-in** (Google/Apple) is built but switched off in `src/config/features.ts` until the backend supports it.
- **Change Email** goes back to Sign Up with the details filled in, because the backend has no way for an unverified account to change its address yet.

## Onboarding

New accounts (no saved preferences, `user.onboardingCompleted` false) are routed to `/onboarding` from anywhere in the app. It's one screen with ten steps so answers survive going back and forth: `src/onboarding/OnboardingFlow.tsx` runs it, `steps.tsx` has one component per step, and `model.ts` holds the answers, the option lists and the mapping to `PreferencesRequest`.

1. Intro
2. Weekly budget (presets or type your own; Next disabled at $0)
3. Household size (1-20)
4. Meals to cover (breakfast, lunch, dinner)
5. Recipes per week for each meal (1-7; every meal covers all 7 days, so fewer recipes means leftovers)
6. Week start day and auto-planning - not in the Figma; the backend needs `planStartDay`
7. Diets
8. Allergies
9. Macro targets (optional, per meal)
10. Review (tap a row to jump back and edit), then "Building your plan" with the steaming bowl animation

How answers map to the backend:

- Diets and allergies become dietary label ids (`vegan`, `high-protein`, `nut-free`, `dairy-free`...). Low Calorie and Low Carb aren't labels, so they pre-fill the per-meal calorie (500) and carb (30 g) targets instead, which recipe ranking uses.
- Macros are per meal, matching `RecipeFitEvaluator`. Fiber from the Figma is left out because the backend doesn't store it.
- `repeatAvoidanceDays` is sent as the backend default (14).
- Location isn't asked: pricing will be averaged instead of per store.
- **Resume:** progress (current step + answers) is saved on the device with AsyncStorage as you go, one draft per account, and restored if the app is closed mid-way. The draft is cleared once preferences are saved. Unreadable, out-of-range or older-format drafts fall back to step 1 (bump `VERSION` in `src/onboarding/draft.ts` when the answers shape changes).
- "Building your plan" saves preferences (falling back to PUT if they already exist), generates the first week, and holds for ~2.6 s.
- The week start step also sets **auto-planning**: on by default, building next week's plan the day before the week starts. Changing the start day moves the auto-plan day with it until the user picks one themselves. Both are editable later under Profile > Week and auto-planning.

### Pointing the app at the backend

Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_API_URL`. On a real phone, `localhost` means the phone, so use your computer's LAN IP (Windows: `ipconfig`, "IPv4 Address") with the backend running, e.g. `http://192.168.1.42:8080`. Restart `npx expo start` after changing it.

## Cost Notes

`costPerServing` is an estimate in USD from one representative store, refreshed weekly. When `costComplete` is false, some lines couldn't be priced and the real cost is higher; show it as "from $X" or with an "estimate" label rather than as an exact price. `estimatedCost` in recipe detail is what the chosen servings use, not what a shopping trip costs (the grocery list buys whole packages).

## Meal Plan Notes

- A plan is a list of `selections` (one recipe cooked once, eaten over `daysCovered` days) plus a `days` calendar. Lock and swap act on a selection, so a swap changes every day that recipe covers. A meal marked `leftover` is eaten from an earlier cook.
- A selection whose cook day is today or earlier can't be swapped (409); grey out its swap button.
- Compare `groceryCost` (what the trip costs) with `budget`; `overBudget` is set from it. `usageCost` is what the meals use.
- Grocery amounts are exact; show `displayAmount`. A line with `estimate: true` has no package to price it by. Pantry lines count at what the week uses; offer "need to buy" to switch one to its full package price.
- Grocery line ids survive swaps and regenerates, and so do the purchased checkmarks.

## Tech Stack

| Area         | Technology                                             |
| ------------ | ------------------------------------------------------ |
| Framework    | React Native via Expo (SDK 58)                         |
| Navigation   | Expo Router (file-based, routes in `src/app/`)         |
| Language     | TypeScript                                             |
| Styling      | React Native styles + a theme from the shared tokens   |
| Icons        | Lucide (`lucide-react-native`)                         |
| Fonts        | Poppins (UI), DM Sans (brand) via `@expo-google-fonts` |
| Distribution | App Store and Google Play, built with EAS              |

## Setup

Requires Node 20.19+ (22 recommended).

```bash
cd mobile
npm install
npx expo start         # scan the QR code with Expo Go (iPhone camera / Android Expo Go app)
npm run typecheck
```

Set the backend URL first (see "Pointing the app at the backend" above). Your phone and computer need to be on the same Wi-Fi. If they can't see each other, use `npx expo start --tunnel`.

Use `npx expo install <package>` instead of `npm install` for anything with native code, so you get the version that matches the Expo SDK.

**iOS builds without a Mac:** Expo Go covers day-to-day testing on a real iPhone. For App Store builds (and any native module Expo Go doesn't include), use EAS to build in the cloud: `npx eas-cli@latest build --platform ios`.

## How Styling Works

- **Design tokens** live in `../design/tokens.json`. `src/theme/tokens.ts` and `src/theme/icons.ts` are generated from it, so don't edit them by hand. After changing the JSON, run `node design/build-tokens.mjs` from the repo root.
- **`useTheme()`** (`src/theme/themeContext.ts`) returns `colors` for the current mode plus `spacing`, `radius` and `palette`, and `setPreference('light' | 'dark' | 'system')`.
- **`<Text variant="h1">`** (`src/components/Text.tsx`) applies the Figma type styles with the right font file and theme color. Use it instead of React Native's `Text`.
- **Fonts**: React Native needs one font per weight. `src/theme/fonts.ts` loads them and maps `(family, weight)` to the loaded name. To use a new weight, add it there.
- **Splash**: the app holds the native splash until fonts load, so nothing flashes in a fallback font. The native splash image is built to the same measurements as the Splash screen, so the hand-off doesn't jump.
- **Sizes**: designs are 402x874 Figma frames (iPhone points), so Figma px values are used as-is.

```tsx
const { colors, spacing } = useTheme();
<View style={{ backgroundColor: colors.background, padding: spacing.lg }}>
  <Logo height={40} />
  <Text variant="h2">This week</Text>
  <Icon.groceries size={24} color={colors.primary} />
</View>
```

## App Icon and Splash

Generated from the logo in `../design/brand/` and stored in `assets/images/`: `icon.png` (iOS and store), the Android adaptive icon layers (forest background, mark foreground, monochrome for themed icons), `splash-icon.png` (the stacked mark + wordmark from the Splash frame, from `design/brand/splash-stacked.svg`), and `favicon.png`.
