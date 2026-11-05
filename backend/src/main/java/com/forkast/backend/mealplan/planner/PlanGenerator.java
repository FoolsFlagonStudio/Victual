package com.forkast.backend.mealplan.planner;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.UUID;

import com.forkast.backend.mealplan.MealSlot;

/**
 * Builds a week's picks from the user's settings and the recipes they may eat.
 * A plain class:
 * the service loads the inputs and saves the result, so every rule here is
 * unit-tested.
 *
 * 1. Lay out the week (WeekLayout).
 * 2. Pool each slot's candidates with the hard filters: slot score of 50 or
 * more, a known
 * cost, calories within the per-meal limit (when set), not served within the
 * repeat
 * window, and for a stretched run a meal-prep score of 70 or more. When a slot
 * has fewer
 * recipes than runs, recently served ones come back, oldest first.
 * 3. Draw each run, longest first, weighted by CandidateScorer, from a Random
 * seeded with
 * request.seed(). A recipe is used once a week. A run nothing can fill is a
 * shortfall.
 * 4. Fit the budget: while usage cost is over budget x margin, swap the
 * unlocked pick
 * furthest over its share for the best-weighted unused candidate that's cheaper
 * per
 * serving and fully priced (a recipe with unpriced ingredients only looks
 * cheap). Stop when it fits or no swap lowers the cost.
 * 5. Sides: lunch and dinner mains that want one (a plain roast chicken) get a
 * side while
 * it fits the budget (pairSides).
 *
 * Determinism: the same request, recipes (in the same order) and seed give the
 * same plan.
 */
public class PlanGenerator {

    private final PlannerProperties properties;
    private final WeekLayout layout;
    private final CandidateScorer scorer;

    public PlanGenerator(PlannerProperties properties) {
        this.properties = properties;
        this.layout = new WeekLayout(properties);
        this.scorer = new CandidateScorer(properties);
    }

    public GeneratedPlan generate(PlanRequest request, List<RecipeOption> recipes) {
        return generate(request, recipes, request.weekStart());
    }

    /**
     * A week that may have started already: only `from` (today) on is planned, so
     * no meals or
     * groceries for days that are over.
     */
    public GeneratedPlan generate(PlanRequest request, List<RecipeOption> recipes, LocalDate from) {
        LocalDate start = from.isAfter(request.weekStart()) ? from : request.weekStart();
        WeekShape shape = layout.layout(request.weekStart(), request.mealSlots(), request.leftoversForLunch(), start);
        return fill(shape, request, recipes);
    }

    /**
     * Fills runs that are already laid out: a new week's (generate), or an existing
     * plan's when
     * it's regenerated or one meal is swapped. Locked picks keep their recipe; the
     * rest are drawn.
     */
    public GeneratedPlan fill(WeekShape shape, PlanRequest request, List<RecipeOption> recipes) {
        Random random = new Random(request.seed());

        int totalServings = shape.runs().stream().mapToInt(r -> r.servings(request.household())).sum();
        BigDecimal budgetTarget = budgetTarget(request);
        BigDecimal targetPerServing = budgetTarget == null || totalServings == 0 ? null
                : budgetTarget.divide(BigDecimal.valueOf(totalServings), 4, RoundingMode.HALF_UP);
        CandidateScorer.Context context = context(request, targetPerServing);

        Map<MealSlot, List<RecipeOption>> pools = pools(request, recipes, shape);

        // 3. Draw: locked runs first, then longest first (ties: breakfast to dinner,
        // position)
        Map<SlotRun, GeneratedPlan.Pick> picks = new LinkedHashMap<>();
        Set<UUID> used = new HashSet<>();
        IngredientOverlap overlap = new IngredientOverlap(recipes, properties);
        for (PlanRequest.LockedPick lock : request.locked()) {
            shape.runs().stream()
                    .filter(r -> r.slot() == lock.slot() && r.position() == lock.position())
                    .findFirst()
                    .ifPresent(run -> {
                        picks.put(run, pick(run, lock.recipe(), request.household(), true));
                        used.add(lock.recipe().id());
                        overlap.add(lock.recipe());
                    });
        }

        List<SlotRun> order = new ArrayList<>(shape.runs());
        order.sort(Comparator.comparingInt(SlotRun::meals).reversed()
                .thenComparing(SlotRun::slot)
                .thenComparingInt(SlotRun::position));

        List<GeneratedPlan.Shortfall> shortfalls = new ArrayList<>();
        for (SlotRun run : order) {
            if (picks.containsKey(run)) {
                continue;
            }
            List<RecipeOption> candidates = candidatesFor(run, pools, used);
            if (candidates.isEmpty()) {
                shortfalls.add(new GeneratedPlan.Shortfall(run.slot(), run.position(), run.meals(),
                        run.stretched() ? "No recipe that keeps for " + run.dates().size() + " days fits the filters"
                                : "Not enough " + run.slot().name().toLowerCase() + " recipes fit the filters"));
                continue;
            }
            RecipeOption chosen = draw(candidates, run, context, random, overlap);
            picks.put(run, pick(run, chosen, request.household(), false));
            used.add(chosen.id());
            overlap.add(chosen);
        }

        // 4. Fit the budget
        if (budgetTarget != null) {
            fitBudget(picks, pools, used, budgetTarget, targetPerServing, context, request.household());
        }

        // 5. Sides for mains that want one, while they fit the budget
        pairSides(picks, recipes, used, budgetTarget, request.household(), random);

        BigDecimal usage = usage(picks);
        int openMeals = shape.openMeals() + shortfalls.stream().mapToInt(GeneratedPlan.Shortfall::meals).sum();
        boolean fits = budgetTarget == null || usage.compareTo(budgetTarget) <= 0;

        List<GeneratedPlan.Pick> ordered = shape.runs().stream().filter(picks::containsKey).map(picks::get).toList();
        return new GeneratedPlan(ordered, openMeals, shortfalls, usage, fits);
    }

    // ---------- one run: suggestions and a chosen recipe ----------

    /** A recipe that could fill a run, with what it would cost there. */
    public record Suggestion(RecipeOption recipe, BigDecimal cost) {
    }

    /**
     * Up to `limit` recipes for one run, best weighted first. They pass the hard
     * filters, aren't
     * in `exclude` (the plan's recipes) and keep usage cost within the budget
     * target, counting
     * `otherUsage` (what the plan's other meals cost). Recently served recipes come
     * after the
     * rest, oldest first. When nothing fits the budget, the cheapest are returned
     * instead, so
     * there's always something to choose from.
     */
    public List<Suggestion> suggest(SlotRun run, PlanRequest request, List<RecipeOption> recipes, Set<UUID> exclude,
            BigDecimal otherUsage, int limit) {
        BigDecimal target = budgetTarget(request);
        int servings = run.servings(request.household());
        BigDecimal targetPerServing = target == null ? null
                : target.subtract(otherUsage).max(BigDecimal.ZERO)
                        .divide(BigDecimal.valueOf(servings), 4, RoundingMode.HALF_UP);
        CandidateScorer.Context context = context(request, targetPerServing);

        List<RecipeOption> eligible = recipes.stream()
                .filter(r -> !exclude.contains(r.id()))
                .filter(r -> rejection(run, r, request).isEmpty())
                .toList();
        Comparator<RecipeOption> byWeight = Comparator
                .comparingDouble((RecipeOption r) -> scorer.weight(candidate(r, run), run, context)).reversed();
        List<RecipeOption> ranked = new ArrayList<>(eligible.stream().filter(r -> !recentlyServed(r, request))
                .sorted(byWeight).toList());
        eligible.stream().filter(r -> recentlyServed(r, request))
                .sorted(Comparator.comparing(RecipeOption::lastServed))
                .forEach(ranked::add);

        List<Suggestion> all = ranked.stream()
                .map(r -> new Suggestion(r, pick(run, r, request.household(), false).cost()))
                .toList();
        List<Suggestion> withinBudget = target == null ? all
                : all.stream().filter(s -> otherUsage.add(s.cost()).compareTo(target) <= 0).toList();
        if (!withinBudget.isEmpty()) {
            return withinBudget.stream().limit(limit).toList();
        }
        return all.stream().sorted(Comparator.comparing(Suggestion::cost)).limit(limit).toList();
    }

    /**
     * Why a recipe can't fill a run, or empty when it can: the hard filters a
     * user's own pick
     * must pass too (the repeat window aside: choosing a recent favorite is the
     * user's call).
     */
    public Optional<String> rejection(SlotRun run, RecipeOption recipe, PlanRequest request) {
        if (!recipe.slots().fits(run.slot())) {
            return Optional.of("It isn't a " + run.slot().name().toLowerCase() + " recipe.");
        }
        if (recipe.costPerServing() == null) {
            return Optional.of("It has no price yet.");
        }
        if (!withinCalories(recipe, request.maxCaloriesPerMeal())) {
            return Optional.of("It's over your " + request.maxCaloriesPerMeal() + " calorie limit per meal.");
        }
        if (run.stretched() && recipe.mealPrepScore() < properties.stretchMinMealPrep()) {
            return Optional
                    .of("This meal covers " + run.dates().size() + " days, and that recipe doesn't keep that long.");
        }
        return Optional.empty();
    }

    /** What a recipe costs in a run, with its servings and portion multiplier. */
    public GeneratedPlan.Pick price(SlotRun run, RecipeOption recipe, int household) {
        return pick(run, recipe, household, false);
    }

    private BigDecimal budgetTarget(PlanRequest request) {
        return request.weeklyBudget() == null ? null : request.weeklyBudget().multiply(properties.budgetMargin());
    }

    private static CandidateScorer.Context context(PlanRequest request, BigDecimal targetPerServing) {
        return new CandidateScorer.Context(request.prefersMealPrep(), targetPerServing, request.weekStart(),
                request.repeatAvoidanceDays());
    }

    // ---------- pools ----------

    /**
     * Each slot's recipes after the hard filters, in input order. Recently served
     * recipes are
     * left out unless the slot would have fewer recipes than runs; then the
     * oldest-served come
     * back first. (The stretched-run filter is applied per run, in candidatesFor.)
     */
    private Map<MealSlot, List<RecipeOption>> pools(PlanRequest request, List<RecipeOption> recipes, WeekShape shape) {
        Map<MealSlot, List<RecipeOption>> pools = new HashMap<>();
        for (MealSlot slot : MealSlot.values()) {
            long runs = shape.runs().stream().filter(r -> r.slot() == slot).count();
            if (runs == 0) {
                continue;
            }
            List<RecipeOption> eligible = recipes.stream()
                    .filter(r -> r.slots().fits(slot))
                    .filter(r -> r.costPerServing() != null)
                    .filter(r -> withinCalories(r, request.maxCaloriesPerMeal()))
                    .toList();

            List<RecipeOption> fresh = new ArrayList<>(eligible.stream()
                    .filter(r -> !recentlyServed(r, request))
                    .toList());
            if (fresh.size() < runs) {
                eligible.stream()
                        .filter(r -> recentlyServed(r, request))
                        .sorted(Comparator.comparing(RecipeOption::lastServed))
                        .limit(runs - fresh.size())
                        .forEach(fresh::add);
            }
            pools.put(slot, fresh);
        }
        return pools;
    }

    private List<RecipeOption> candidatesFor(SlotRun run, Map<MealSlot, List<RecipeOption>> pools, Set<UUID> used) {
        return pools.getOrDefault(run.slot(), List.of()).stream()
                .filter(r -> !used.contains(r.id()))
                .filter(r -> !run.stretched() || r.mealPrepScore() >= properties.stretchMinMealPrep())
                .toList();
    }

    private static boolean withinCalories(RecipeOption recipe, Integer maxCalories) {
        if (maxCalories == null) {
            return true;
        }
        return recipe.calories() != null && recipe.calories().compareTo(BigDecimal.valueOf(maxCalories)) <= 0;
    }

    private static boolean recentlyServed(RecipeOption recipe, PlanRequest request) {
        return recipe.lastServed() != null && request.repeatAvoidanceDays() > 0
                && !recipe.lastServed().isBefore(request.weekStart().minusDays(request.repeatAvoidanceDays()));
    }

    // ---------- the draw ----------

    private RecipeOption draw(List<RecipeOption> candidates, SlotRun run, CandidateScorer.Context context,
            Random random, IngredientOverlap overlap) {
        double[] weights = new double[candidates.size()];
        double total = 0;
        for (int i = 0; i < candidates.size(); i++) {
            RecipeOption option = candidates.get(i);
            weights[i] = Math.max(0, scorer.weight(candidate(option, run), run, context) * overlap.factor(option));
            total += weights[i];
        }
        if (total <= 0) {
            return candidates.get(random.nextInt(candidates.size()));
        }
        double roll = random.nextDouble() * total;
        for (int i = 0; i < weights.length; i++) {
            roll -= weights[i];
            if (roll < 0) {
                return candidates.get(i);
            }
        }
        return candidates.get(candidates.size() - 1); // rounding at the very end
    }

    private static Candidate candidate(RecipeOption r, SlotRun run) {
        return new Candidate(r.id(), r.baseServings(), r.slots().of(run.slot()), r.fitPenalty(), r.mealPrepScore(),
                r.costPerServing(), r.costComplete(), r.favorite(), r.lastServed());
    }

    // ---------- budget ----------

    private void fitBudget(Map<SlotRun, GeneratedPlan.Pick> picks, Map<MealSlot, List<RecipeOption>> pools,
            Set<UUID> used, BigDecimal target, BigDecimal targetPerServing, CandidateScorer.Context context,
            int household) {
        Set<SlotRun> stuck = new HashSet<>();
        while (usage(picks).compareTo(target) > 0) {
            Optional<GeneratedPlan.Pick> worst = picks.values().stream()
                    .filter(p -> !p.locked() && !stuck.contains(p.run()))
                    .max(Comparator.comparing(p -> overShare(p, targetPerServing)));
            if (worst.isEmpty()) {
                return; // nothing left to swap: the plan is over budget
            }
            GeneratedPlan.Pick current = worst.get();
            SlotRun run = current.run();
            // Only recipes whose cost is fully known: one with unpriced ingredients only
            // looks cheaper, so swapping to it would hide the overspend instead of fixing it.
            Optional<RecipeOption> cheaper = candidatesFor(run, pools, used).stream()
                    .filter(RecipeOption::costComplete)
                    .filter(r -> r.costPerServing().compareTo(current.recipe().costPerServing()) < 0)
                    .max(Comparator.comparingDouble(r -> scorer.weight(candidate(r, run), run, context)));
            if (cheaper.isEmpty()) {
                stuck.add(run);
                continue;
            }
            used.remove(current.recipe().id());
            used.add(cheaper.get().id());
            picks.put(run, pick(run, cheaper.get(), household, false));
        }
    }

    /** How far a pick's cost is above its share of the budget. */
    private static BigDecimal overShare(GeneratedPlan.Pick pick, BigDecimal targetPerServing) {
        BigDecimal share = targetPerServing.multiply(BigDecimal.valueOf(pick.servings()));
        return pick.cost().subtract(share);
    }

    /** What the picks cost, sides included. */
    private static BigDecimal usage(Map<SlotRun, GeneratedPlan.Pick> picks) {
        return picks.values().stream().map(GeneratedPlan.Pick::totalCost).reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
    }

    // ---------- sides ----------

    /**
     * Gives each lunch or dinner pick whose main wants a side (RecipeOption.needsSide)
     * one side,
     * in run order. A side is a recipe with a side score of 50 or more that isn't
     * one of the
     * plan's mains, drawn by side score (favorites count double, cheaper is
     * likelier), using
     * a different side for each main while there are enough. A side that would put
     * the plan
     * over the budget target isn't added; locked picks keep the side they have.
     */
    private void pairSides(Map<SlotRun, GeneratedPlan.Pick> picks, List<RecipeOption> recipes, Set<UUID> used,
            BigDecimal target, int household, Random random) {
        List<RecipeOption> sides = sideOptions(recipes);
        if (sides.isEmpty()) {
            return;
        }
        Set<UUID> sidesUsed = new HashSet<>();
        for (SlotRun run : new ArrayList<>(picks.keySet())) {
            GeneratedPlan.Pick pick = picks.get(run);
            if (pick.locked() || pick.side() != null || !wantsSide(run, pick.recipe())) {
                continue;
            }
            BigDecimal room = target == null ? null : target.subtract(usage(picks));
            Optional<GeneratedPlan.Side> side = drawSide(run, sides, used, sidesUsed, room, household, random);
            if (side.isPresent()) {
                picks.put(run, pick.withSide(side.get()));
                sidesUsed.add(side.get().recipe().id());
            }
        }
    }

    /** True when a main in this run should get a side: lunch or dinner, and the main wants one. */
    public static boolean wantsSide(SlotRun run, RecipeOption main) {
        return run.slot() != MealSlot.BREAKFAST && main.needsSide();
    }

    /**
     * One side for a run, or empty when none fits. exclude: never (the plan's
     * mains); avoid:
     * only if nothing else fits (sides already used). room: what's left of the
     * budget, or null.
     */
    public Optional<GeneratedPlan.Side> drawSide(SlotRun run, List<RecipeOption> recipes, Set<UUID> exclude,
            Set<UUID> avoid, BigDecimal room, int household, Random random) {
        int servings = run.servings(household);
        List<GeneratedPlan.Side> fits = sideOptions(recipes).stream()
                .filter(r -> !exclude.contains(r.id()))
                .map(r -> side(r, servings))
                .filter(s -> room == null || s.cost().compareTo(room) <= 0)
                .toList();
        List<GeneratedPlan.Side> fresh = fits.stream().filter(s -> !avoid.contains(s.recipe().id())).toList();
        List<GeneratedPlan.Side> pool = fresh.isEmpty() ? fits : fresh;
        if (pool.isEmpty()) {
            return Optional.empty();
        }
        double[] weights = new double[pool.size()];
        double total = 0;
        for (int i = 0; i < pool.size(); i++) {
            weights[i] = sideWeight(pool.get(i).recipe());
            total += weights[i];
        }
        double roll = random.nextDouble() * total;
        for (int i = 0; i < weights.length; i++) {
            roll -= weights[i];
            if (roll < 0) {
                return Optional.of(pool.get(i));
            }
        }
        return Optional.of(pool.get(pool.size() - 1));
    }

    /**
     * Up to `limit` sides for a run, best first (side score, then cheaper), those
     * within `room`
     * (null = no budget) ahead of the rest. exclude: the plan's mains and the run's
     * current side.
     */
    public List<GeneratedPlan.Side> suggestSides(SlotRun run, List<RecipeOption> recipes, Set<UUID> exclude,
            BigDecimal room, int household, int limit) {
        int servings = run.servings(household);
        Comparator<GeneratedPlan.Side> best = Comparator
                .comparingDouble((GeneratedPlan.Side s) -> sideWeight(s.recipe())).reversed()
                .thenComparing(GeneratedPlan.Side::cost);
        List<GeneratedPlan.Side> all = sideOptions(recipes).stream()
                .filter(r -> !exclude.contains(r.id()))
                .map(r -> side(r, servings))
                .sorted(best)
                .toList();
        List<GeneratedPlan.Side> ordered = new ArrayList<>(
                all.stream().filter(s -> room == null || s.cost().compareTo(room) <= 0).toList());
        all.stream().filter(s -> !ordered.contains(s)).forEach(ordered::add);
        return ordered.stream().limit(limit).toList();
    }

    /** A recipe as a side for a run: scaled to the run's servings, with its cost. */
    public GeneratedPlan.Side priceSide(SlotRun run, RecipeOption recipe, int household) {
        return side(recipe, run.servings(household));
    }

    private static List<RecipeOption> sideOptions(List<RecipeOption> recipes) {
        return recipes.stream().filter(RecipeOption::isSide).filter(r -> r.costPerServing() != null).toList();
    }

    private static double sideWeight(RecipeOption r) {
        double cost = r.costPerServing() == null ? 0 : r.costPerServing().doubleValue();
        return r.sideScore() * (r.favorite() ? 2.0 : 1.0) / (1.0 + cost);
    }

    private static GeneratedPlan.Side side(RecipeOption recipe, int servings) {
        BigDecimal multiplier = BigDecimal.valueOf(servings)
                .divide(BigDecimal.valueOf(Math.max(1, recipe.baseServings())), 3, RoundingMode.HALF_UP);
        BigDecimal cost = recipe.costPerServing() == null ? BigDecimal.ZERO
                : recipe.costPerServing().multiply(BigDecimal.valueOf(servings)).setScale(2, RoundingMode.HALF_UP);
        return new GeneratedPlan.Side(recipe, multiplier, cost);
    }

    // ---------- picks ----------

    private static GeneratedPlan.Pick pick(SlotRun run, RecipeOption recipe, int household, boolean locked) {
        int servings = run.servings(household);
        BigDecimal multiplier = BigDecimal.valueOf(servings)
                .divide(BigDecimal.valueOf(Math.max(1, recipe.baseServings())), 3, RoundingMode.HALF_UP);
        BigDecimal cost = recipe.costPerServing() == null ? BigDecimal.ZERO
                : recipe.costPerServing().multiply(BigDecimal.valueOf(servings)).setScale(2, RoundingMode.HALF_UP);
        return new GeneratedPlan.Pick(run, recipe, servings, multiplier, cost, locked);
    }
}