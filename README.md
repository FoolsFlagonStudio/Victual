# Victual

A mobile meal planner that builds your weekly recipes and grocery list around your budget, macros, and dietary needs. Spring Boot backend, React Native frontend.

Users set a weekly budget, household size, dietary restrictions, and optional calorie/macro targets. Each week Victual generates a meal plan and an aggregated grocery list priced to fit that budget.

> **Status:** getting ready for a closed test on Google Play. The backend, data pipeline, mobile app and marketing site are built: 811 scraped recipes with parsed ingredients, nutrition, dietary labels and meal-slot scores; a 337-ingredient catalog from USDA FoodData Central priced from Kroger, BLS and hand estimates, giving 94%+ of recipes a complete cost; weekly plans that fit the budget, with sides, leftovers, swaps and a grocery list priced in whole packages, generated automatically on each user's chosen day. The mobile app runs on the live API end to end. Hosting (Render, Supabase, Resend, Vercel) is set up in [DEPLOY.md](DEPLOY.md).

## How It Fits Together

```
data_pipeline/  (Python)     backend/  (Spring Boot)          mobile/  (React Native)
recipe-scrapers  ── POST ──▶  parse, match, classify   ◀── REST ──  meal plans, grocery
                              recipes; generate plans              lists, preferences
                                       │
                                       ▼
                              PostgreSQL (Supabase)
```

- **data_pipeline** builds the ingredient catalog from FoodData Central, scrapes recipe pages, maps ingredients to Kroger products, imports BLS average prices, and sends it all to the backend. It does no parsing or pricing math itself.
- **backend** owns all data: recipe parsing, ingredient matching, nutrition, pricing (a weekly Kroger refresh and recipe cost per serving), dietary labels, and meal plan generation.
- **mobile** is the user-facing app and talks only to the backend API.
- **frontend** is a static marketing site with general information and links to the app stores. It doesn't call the backend.

## Repository Structure

| Folder           | Contents                                                      | Docs                                               |
| ---------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| `backend/`       | Spring Boot API                                               | [backend/README.md](backend/README.md)             |
| `data_pipeline/` | Python catalog builder and recipe scraper                     | [data_pipeline/README.md](data_pipeline/README.md) |
| `frontend/`      | Marketing website with app info and App Store links           | [frontend/README.md](frontend/README.md)           |
| `mobile/`        | Expo / React Native app                                       | [mobile/README.md](mobile/README.md)               |
| `design/`        | Shared design tokens, icon choices and logo files (Victual)   | [design/brand/README.md](design/brand/README.md)   |

## Tech Stack

| Area           | Technology                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Backend        | Java, Spring Boot 4.1, Spring Data JPA, Hibernate 7, Flyway, Maven, JUnit 5 + AssertJ              |
| Database       | PostgreSQL 17 on Supabase (used as a plain database only), `pg_trgm` for fuzzy ingredient matching |
| Mobile         | React Native, Expo (SDK 58), Expo Router, TypeScript, Lucide icons                                 |
| Website        | Vite, React, TypeScript, Ant Design, Lucide icons                                                  |
| Data pipeline  | Python, `recipe-scrapers`, `requests`                                                              |
| Nutrition data | USDA FoodData Central                                                                              |
| Price data     | Kroger Products API (one store, refreshed weekly), BLS average prices, hand-entered seed prices    |

## Deploying

Render (API), Supabase (database), Resend (email) and Vercel (site): see [DEPLOY.md](DEPLOY.md).

## Roadmap

- [x] Repository and Spring Boot setup
- [x] Database connection (Supabase)
- [x] Data model (17 tables)
- [x] Flyway migrations
- [x] Auth (signup, login, JWT + refresh tokens)
- [x] User and preferences endpoints
- [x] Recipe data pipeline (catalog, scraper, parser, matcher, nutrition, labels, review queue)
- [x] Recipe endpoints (search with fit flags, scaled detail, favorites)
- [x] Pricing (Kroger + BLS prices, recipe cost per serving, weekly refresh)
- [x] Meal plan generator and grocery list (weekly job, lock and swap, pantry staples)
- [x] Shared design system (tokens, fonts, logo, icons) for web and mobile
- [x] Mobile app screens (auth, onboarding, home, plan, groceries, recipes, profile, cook mode, budget)
- [x] Mobile app wired to the meal plan and grocery routes
- [x] Hosting (Render API, Supabase, Resend email, Vercel site)
- [ ] Closed test on Google Play
- [x] Marketing website (landing, privacy, terms, support)

## Stretch Features

Ideas deliberately left out of v1:

- **Sign in with Google and Apple.** First stretch goal. The buttons are already built in the app behind `features.socialSignIn`; the backend needs endpoints that verify Google/Apple identity tokens and issue Victual tokens.
- **Per-slot day selection.** Let a meal slot cover only some days (e.g. lunches on weekdays only). In v1 every included slot covers all 7 days of the plan.
- **Push notifications.** v1 generates each user's plan automatically before their plan start day; a push notification when it's ready comes later.
- **Regional prices.** v1 prices everything from one Kroger store; letting users pick a store or ZIP code comes later.
- **What I have (kitchen inventory).** Track ingredients on hand ("5 yellow onions, 3 tomatoes") so the planner counts them as already paid for, which leaves room in the budget for pricier recipes and favors recipes that use things up. The risk is an inventory that goes stale, so it should mostly maintain itself:
  - *Filled from groceries:* checking off the grocery list adds what was bought in whole packages; whatever the week's recipes don't use (2 of a 3 lb bag of onions) stays on hand automatically.
  - *Used by cook mode:* finishing a recipe subtracts its amounts, scaled to servings.
  - *Ages out:* each item gets a shelf life by category (produce about a week, dairy two, pantry months). Past it, the planner stops counting it until it's confirmed.
  - *One quick check a week:* before the plan is generated, a "still have these?" list of anything uncertain, a few taps.
  - Manual adds and edits for everything else. Pantry staples stay a simple have/don't-have, as now.
  - Backend: a per-user inventory of catalog ingredients in grams (with source and expiry), subtracted in the planner's cost and in the grocery list; recipes that use expiring items get a scoring boost.
