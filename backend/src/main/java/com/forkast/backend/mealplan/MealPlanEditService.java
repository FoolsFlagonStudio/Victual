package com.forkast.backend.mealplan;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.forkast.backend.common.exception.ApiException;
import com.forkast.backend.mealplan.dto.MealPlanDetailResponse;
import com.forkast.backend.mealplan.dto.SuggestionResponse;
import com.forkast.backend.mealplan.grocery.GroceryListService;
import com.forkast.backend.mealplan.planner.GeneratedPlan;
import com.forkast.backend.mealplan.planner.PlanGenerator;
import com.forkast.backend.mealplan.planner.PlanRequest;
import com.forkast.backend.mealplan.planner.PlannerProperties;
import com.forkast.backend.mealplan.planner.RecipeOption;
import com.forkast.backend.mealplan.planner.SlotRun;
import com.forkast.backend.mealplan.planner.WeekShape;
import com.forkast.backend.recipe.Recipe;
import com.forkast.backend.recipe.RecipeQueryService;
import com.forkast.backend.user.User;
import com.forkast.backend.user.UserPreferences;
import com.forkast.backend.user.UserPreferencesRepository;
import com.forkast.backend.user.UserRepository;

/**
 * Changes to a saved plan, each on one selection or on all of them: lock, swap,
 * suggestions
 * and regenerate. Every change recalculates the usage cost and rebuilds the
 * grocery list.
 *
 * Past days are never changed: a selection first cooked before today keeps its
 * recipe (swap, sides and suggestions refuse it with 409). Today's can still be
 * swapped by hand, but regenerate leaves anything from today back alone. The
 * days, servings
 * and run of each selection stay as they are; only recipes change.
 */
@Service
public class MealPlanEditService {

    // Sides: a lunch or dinner main that wants one (a plain roast chicken) carries
    // a side
    // cooked for the same servings. Swapping the main keeps its side, or draws one
    // if the new
    // main wants one; a main that's a whole meal drops it. setSide and removeSide
    // change it
    // directly, and a side set that way is the user's: it stays through swaps and
    // regenerate.

    private static final int SUGGESTIONS = 5;

    private final MealPlanRepository planRepository;
    private final UserPreferencesRepository preferencesRepository;
    private final RecipeOptionLoader optionLoader;
    private final RecipeQueryService recipeQueryService;
    private final GroceryListService groceryListService;
    private final PlannerProperties properties;
    private final PlanGenerator generator;
    private final UserRepository userRepository;
    private final Clock clock;

    public MealPlanEditService(MealPlanRepository planRepository, UserPreferencesRepository preferencesRepository,
            RecipeOptionLoader optionLoader, RecipeQueryService recipeQueryService,
            GroceryListService groceryListService, PlannerProperties properties, UserRepository userRepository,
            Clock clock) {
        this.userRepository = userRepository;
        this.planRepository = planRepository;
        this.preferencesRepository = preferencesRepository;
        this.optionLoader = optionLoader;
        this.recipeQueryService = recipeQueryService;
        this.groceryListService = groceryListService;
        this.properties = properties;
        this.generator = new PlanGenerator(properties);
        this.clock = clock;
    }

    // ---------- lock ----------

    @Transactional
    public MealPlanDetailResponse setLocked(UUID userId, UUID planId, UUID selectionId, boolean locked) {
        MealPlan plan = requireOwn(userId, planId);
        PlanSelection selection = requireSelection(plan, selectionId);
        if (locked) {
            selection.lock();
        } else {
            selection.unlock();
        }
        return detail(plan, preferencesRepository.findByUserId(userId).orElse(null));
    }

    // ---------- swap ----------

    /**
     * recipeId null: a weighted draw among the recipes that fit, as generation
     * would pick.
     */
    @Transactional
    public MealPlanDetailResponse swap(UUID userId, UUID planId, UUID selectionId, UUID recipeId) {
        Edit edit = start(userId, planId);
        PlanSelection selection = requireSelection(edit.plan, selectionId);
        requireNotStarted(edit, selection);
        SlotRun run = runOf(selection);

        RecipeOption chosen;
        Recipe recipe;
        if (recipeId != null) {
            recipe = recipeQueryService.requireVisible(userId, recipeId); // 404 if restricted
            if (recipeIdsIn(edit.plan).contains(recipeId)) {
                throw ApiException.conflict("That recipe is already in this plan.");
            }
            chosen = edit.loaded.optionOf().apply(recipe);
            Optional<String> rejection = generator.rejection(run, chosen, request(edit, 0, List.of()));
            if (rejection.isPresent()) {
                throw ApiException.badRequest("That recipe can't fill this meal: " + rejection.get());
            }
        } else {
            // every other selection is kept, and the current recipe is out of the running
            List<PlanRequest.LockedPick> others = edit.plan.getSelections().stream()
                    .filter(s -> s != selection)
                    .map(s -> keep(s, edit))
                    .toList();
            List<RecipeOption> options = edit.loaded.options().stream()
                    .filter(o -> !o.id().equals(selection.getRecipe().getId()))
                    .toList();
            List<SlotRun> runs = new ArrayList<>(edit.plan.getSelections().stream().map(this::runOf).toList());
            GeneratedPlan drawn = generator.fill(new WeekShape(runs, 0),
                    request(edit, ThreadLocalRandom.current().nextLong(), others), options);
            GeneratedPlan.Pick pick = drawn.picks().stream()
                    .filter(p -> !p.locked() && p.run().equals(run))
                    .findFirst()
                    .orElseThrow(() -> ApiException.conflict("No other recipe fits this meal."));
            chosen = pick.recipe();
            recipe = edit.loaded.recipes().get(chosen.id());
        }

        assign(selection, recipe, generator.price(run, chosen, household(edit)));
        keepOrDrawSide(edit, selection, run, chosen);
        return finish(edit);
    }

    // ---------- suggestions ----------

    @Transactional(readOnly = true)
    public List<SuggestionResponse> suggestions(UUID userId, UUID planId, UUID selectionId) {
        Edit edit = start(userId, planId);
        PlanSelection selection = requireSelection(edit.plan, selectionId);
        requireNotStarted(edit, selection);

        BigDecimal current = orZero(selection.getEstimatedCost());
        BigDecimal otherUsage = usage(edit.plan).subtract(current);
        return generator.suggest(runOf(selection), request(edit, 0, List.of()), edit.loaded.options(),
                recipeIdsIn(edit.plan), otherUsage, SUGGESTIONS).stream()
                .map(s -> new SuggestionResponse(
                        MealPlanDetailResponse.PlanRecipe.from(edit.loaded.recipes().get(s.recipe().id())),
                        selection.getServings(), s.cost(), s.cost().subtract(current)))
                .toList();
    }

    // ---------- regenerate ----------

    /**
     * Draws every unlocked selection that hasn't started again, with a new seed.
     */
    @Transactional
    public MealPlanDetailResponse regenerate(UUID userId, UUID planId) {
        Edit edit = start(userId, planId);
        List<PlanSelection> selections = edit.plan.getSelections();
        List<PlanRequest.LockedPick> kept = selections.stream()
                .filter(s -> s.isLocked() || s.hasStarted(edit.today))
                .map(s -> keep(s, edit))
                .toList();
        if (kept.size() == selections.size()) {
            throw ApiException
                    .conflict("Every meal in this plan is locked or has started, so there's nothing to redraw.");
        }

        long seed = ThreadLocalRandom.current().nextLong();
        List<SlotRun> runs = selections.stream().map(this::runOf).toList();
        GeneratedPlan drawn = generator.fill(new WeekShape(runs, 0), request(edit, seed, kept),
                edit.loaded.options());

        for (GeneratedPlan.Pick pick : drawn.picks()) {
            if (pick.locked()) {
                continue;
            }
            // a run nothing could fill isn't in the picks, so its selection keeps its
            // recipe
            PlanSelection selection = selectionAt(edit.plan, pick.run());
            assign(selection, edit.loaded.recipes().get(pick.recipe().id()), pick);
            if (selection.isSideChosen()) {
                continue; // the user's side stays with whatever main comes up
            }
            if (pick.side() != null) {
                selection.assignSide(edit.loaded.recipes().get(pick.side().recipe().id()),
                        pick.side().portionMultiplier(), pick.side().cost());
            } else {
                selection.clearSide();
            }
        }
        edit.plan.recordGeneration(seed, Instant.now(clock));
        return finish(edit);
    }

    // ---------- sides ----------

    /**
     * Sets a selection's side: recipeId, or null to draw one as generation would.
     * The side can't be one of the plan's mains.
     */
    @Transactional
    public MealPlanDetailResponse setSide(UUID userId, UUID planId, UUID selectionId, UUID recipeId) {
        Edit edit = start(userId, planId);
        PlanSelection selection = requireSelection(edit.plan, selectionId);
        requireNotStarted(edit, selection);
        SlotRun run = runOf(selection);
        if (recipeId != null) {
            Recipe recipe = recipeQueryService.requireVisible(userId, recipeId); // 404 if restricted
            if (recipeIdsIn(edit.plan).contains(recipeId)) {
                throw ApiException.conflict("That recipe is already a main in this plan.");
            }
            GeneratedPlan.Side side = generator.priceSide(run, edit.loaded.optionOf().apply(recipe), household(edit));
            selection.chooseSide(recipe, side.portionMultiplier(), side.cost());
        } else {
            Set<UUID> exclude = recipeIdsIn(edit.plan);
            if (selection.getSideRecipe() != null) {
                exclude.add(selection.getSideRecipe().getId());
            }
            selection.clearSide();
            GeneratedPlan.Side side = generator
                    .drawSide(run, edit.loaded.options(), exclude, sideIdsIn(edit.plan), room(edit), household(edit),
                            new Random(ThreadLocalRandom.current().nextLong()))
                    .orElseThrow(() -> ApiException.conflict("No side fits this meal."));
            // asked for a side, so it's theirs even though we picked which one
            selection.chooseSide(edit.loaded.recipes().get(side.recipe().id()), side.portionMultiplier(),
                    side.cost());
        }
        return finish(edit);
    }

    @Transactional
    public MealPlanDetailResponse removeSide(UUID userId, UUID planId, UUID selectionId) {
        Edit edit = start(userId, planId);
        PlanSelection selection = requireSelection(edit.plan, selectionId);
        requireNotStarted(edit, selection);
        selection.clearSide();
        return finish(edit);
    }

    /** Sides that could go with a selection's main, best first, within the budget first. */
    @Transactional(readOnly = true)
    public List<SuggestionResponse> sideSuggestions(UUID userId, UUID planId, UUID selectionId) {
        Edit edit = start(userId, planId);
        PlanSelection selection = requireSelection(edit.plan, selectionId);
        requireNotStarted(edit, selection);
        BigDecimal current = orZero(selection.getSideEstimatedCost());
        Set<UUID> exclude = recipeIdsIn(edit.plan);
        if (selection.getSideRecipe() != null) {
            exclude.add(selection.getSideRecipe().getId());
        }
        BigDecimal room = room(edit);
        BigDecimal roomWithout = room == null ? null : room.add(current);
        return generator.suggestSides(runOf(selection), edit.loaded.options(), exclude, roomWithout,
                household(edit), SUGGESTIONS * 2).stream()
                .map(s -> new SuggestionResponse(
                        MealPlanDetailResponse.PlanRecipe.from(edit.loaded.recipes().get(s.recipe().id())),
                        selection.getServings(), s.cost(), s.cost().subtract(current)))
                .toList();
    }

    // ---------- add a meal ----------

    /**
     * Puts a recipe on one day and slot, eaten that day only. Creates the week's
     * plan (empty but
     * for this meal) when there isn't one yet. The slot must be free (swap the meal
     * that's there
     * instead) and the day not over. The meal is locked, so regenerating keeps the
     * user's pick.
     */
    @Transactional
    public MealPlanDetailResponse addMeal(UUID userId, LocalDate date, MealSlot slot, UUID recipeId) {
        User user = userRepository.findById(userId).orElseThrow(() -> ApiException.notFound("User not found."));
        UserPreferences preferences = preferencesRepository.findByUserId(userId)
                .orElseThrow(() -> ApiException.unprocessable("Set up your preferences before planning meals."));
        LocalDate today = LocalDate.now(clock.withZone(user.getZoneId()));
        if (date.isBefore(today)) {
            throw ApiException.badRequest("That day is already over.");
        }
        LocalDate weekStart = date.with(TemporalAdjusters.previousOrSame(preferences.getPlanStartDay()));
        MealPlan plan = planRepository.findByUserIdAndWeekStartDate(userId, weekStart).orElse(null);
        if (plan == null) {
            BigDecimal budget = preferences.getWeeklyBudget() != null && preferences.getWeeklyBudget().signum() > 0
                    ? preferences.getWeeklyBudget()
                    : null;
            plan = new MealPlan(user, weekStart, budget, PlanSource.MANUAL);
            plan.setMealPrepMode(preferences.isPrefersMealPrep());
            plan = planRepository.save(plan);
        }
        boolean taken = plan.getPlannedMeals().stream()
                .anyMatch(m -> m.getMealDate().equals(date) && m.getMealSlot() == slot);
        if (taken) {
            throw ApiException.conflict("There's already a meal there. Swap it instead.");
        }
        Recipe recipe = recipeQueryService.requireVisible(userId, recipeId); // 404 if restricted
        if (recipeIdsIn(plan).contains(recipeId)) {
            throw ApiException.conflict("That recipe is already in this plan.");
        }

        RecipeOptionLoader.Loaded loaded = optionLoader.load(userId, preferences, weekStart, user.getZoneId());
        Edit edit = new Edit(plan, preferences, today, loaded);
        RecipeOption option = loaded.optionOf().apply(recipe);
        int position = plan.getSelections().stream().filter(s -> s.getMealSlot() == slot)
                .mapToInt(PlanSelection::getPosition).max().orElse(0) + 1;
        SlotRun run = new SlotRun(slot, position, List.of(date), null, false);
        GeneratedPlan.Pick priced = generator.price(run, option, household(edit));

        PlanSelection selection = new PlanSelection(slot, position, date, 1);
        selection.assignRecipe(recipe, priced.servings(), priced.portionMultiplier(),
                recipe.getCostPerServing() == null ? null : priced.cost());
        selection.lock();
        plan.addSelection(selection);
        selection.addMeal(date, slot, false);
        keepOrDrawSide(edit, selection, run, option);
        return finish(edit);
    }

    // ---------- the work shared by every edit ----------

    /** Everything an edit needs, loaded once. */
    private record Edit(MealPlan plan, UserPreferences preferences, LocalDate today, RecipeOptionLoader.Loaded loaded) {
    }

    private Edit start(UUID userId, UUID planId) {
        MealPlan plan = requireOwn(userId, planId);
        UserPreferences preferences = preferencesRepository.findByUserId(userId)
                .orElseThrow(() -> ApiException.unprocessable("Set up your preferences before changing a plan."));
        User user = plan.getUser();
        LocalDate today = LocalDate.now(clock.withZone(user.getZoneId()));
        RecipeOptionLoader.Loaded loaded = optionLoader.load(userId, preferences, plan.getWeekStartDate(),
                user.getZoneId());
        return new Edit(plan, preferences, today, loaded);
    }

    /**
     * Recalculates usage cost, rebuilds the grocery list (which sets grocery cost
     * and overBudget).
     */
    private MealPlanDetailResponse finish(Edit edit) {
        edit.plan.setCosts(usage(edit.plan), null, edit.plan.getOpenMeals());
        groceryListService.rebuild(edit.plan);
        planRepository.flush();
        return detail(edit.plan, edit.preferences);
    }

    private MealPlanDetailResponse detail(MealPlan plan, UserPreferences preferences) {
        Set<MealSlot> slots = preferences == null ? Set.of() : preferences.getMealSlots().keySet();
        return MealPlanDetailResponse.from(plan, slots);
    }

    /**
     * The generator's view of the plan: today's preferences, but the plan's own
     * week and
     * budget snapshot, so an edit holds the plan to the budget it was made with.
     */
    private PlanRequest request(Edit edit, long seed, List<PlanRequest.LockedPick> locked) {
        UserPreferences p = edit.preferences;
        Map<MealSlot, Integer> slots = p.getMealSlots();
        return new PlanRequest(edit.plan.getWeekStartDate(), slots, household(edit), p.isLeftoversForLunch(),
                p.isPrefersMealPrep(), edit.plan.getBudgetTarget(), p.getMaxCaloriesPerMeal(),
                p.getRepeatAvoidanceDays(), seed, locked);
    }

    private static int household(Edit edit) {
        return Math.max(1, edit.preferences.getHouseholdServingSize());
    }

    private static PlanRequest.LockedPick keep(PlanSelection selection, Edit edit) {
        return new PlanRequest.LockedPick(selection.getMealSlot(), selection.getPosition(),
                edit.loaded.optionOf().apply(selection.getRecipe()));
    }

    private static void assign(PlanSelection selection, Recipe recipe, GeneratedPlan.Pick pick) {
        selection.assignRecipe(recipe, pick.servings(), pick.portionMultiplier(), pick.cost());
    }

    /**
     * A saved selection as the run it fills: its own slot's dates (cook day first)
     * and, for a
     * dinner, the next day's leftover lunch.
     */
    private SlotRun runOf(PlanSelection selection) {
        return runOf(selection, properties.maxRunDays());
    }

    /** stretched = longer than the freshness limit, as WeekLayout marks it. */
    static SlotRun runOf(PlanSelection selection, int maxRunDays) {
        List<LocalDate> dates = new ArrayList<>();
        LocalDate leftoverLunch = null;
        for (PlannedMeal meal : selection.getMeals()) {
            if (meal.getMealSlot() == selection.getMealSlot()) {
                dates.add(meal.getMealDate());
            } else if (meal.getMealSlot() == MealSlot.LUNCH) {
                leftoverLunch = meal.getMealDate();
            }
        }
        if (dates.isEmpty()) {
            dates.add(selection.getStartDate());
        }
        return new SlotRun(selection.getMealSlot(), selection.getPosition(), dates, leftoverLunch,
                selection.getDaysCovered() > maxRunDays);
    }

    private static PlanSelection selectionAt(MealPlan plan, SlotRun run) {
        return plan.getSelections().stream()
                .filter(s -> s.getMealSlot() == run.slot() && s.getPosition() == run.position())
                .findFirst()
                .orElseThrow();
    }

    /**
     * After the main changes: a side the user picked stays; otherwise a main
     * that's a whole meal drops its side, and one that wants a side
     * keeps the one it has, or gets one drawn within what's left of the budget.
     */
    private void keepOrDrawSide(Edit edit, PlanSelection selection, SlotRun run, RecipeOption main) {
        if (selection.isSideChosen()) {
            return; // the user picked it: it stays whatever the main is
        }
        if (!PlanGenerator.wantsSide(run, main)) {
            selection.clearSide();
            return;
        }
        if (selection.getSideRecipe() != null) {
            return;
        }
        generator.drawSide(run, edit.loaded.options(), recipeIdsIn(edit.plan), sideIdsIn(edit.plan), room(edit),
                household(edit), new Random(ThreadLocalRandom.current().nextLong()))
                .ifPresent(side -> selection.assignSide(edit.loaded.recipes().get(side.recipe().id()),
                        side.portionMultiplier(), side.cost()));
    }

    /** What's left of the plan's budget, or null when it has none. */
    private static BigDecimal room(Edit edit) {
        BigDecimal budget = edit.plan.getBudgetTarget();
        return budget == null ? null : budget.subtract(usage(edit.plan));
    }

    private static Set<UUID> sideIdsIn(MealPlan plan) {
        Set<UUID> ids = new HashSet<>();
        plan.getSelections().stream().filter(s -> s.getSideRecipe() != null)
                .forEach(s -> ids.add(s.getSideRecipe().getId()));
        return ids;
    }

    private static Set<UUID> recipeIdsIn(MealPlan plan) {
        Set<UUID> ids = new HashSet<>();
        plan.getSelections().forEach(s -> ids.add(s.getRecipe().getId()));
        return ids;
    }

    private static BigDecimal usage(MealPlan plan) {
        return plan.getSelections().stream().map(s -> orZero(s.getTotalCost()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static BigDecimal orZero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    /**
     * Swaps and sides: a meal first cooked on an earlier day is fixed (its
     * leftovers are in the fridge), but today's can still change, since it may not
     * be cooked yet. Regenerate is stricter and leaves today alone too.
     */
    private static void requireNotStarted(Edit edit, PlanSelection selection) {
        if (selection.getStartDate().isBefore(edit.today)) {
            throw ApiException.conflict("That meal was first cooked on an earlier day, so it can't be changed.");
        }
    }

    private MealPlan requireOwn(UUID userId, UUID planId) {
        return planRepository.findByIdAndUserId(planId, userId)
                .orElseThrow(() -> ApiException.notFound("Meal plan not found."));
    }

    private static PlanSelection requireSelection(MealPlan plan, UUID selectionId) {
        return plan.getSelections().stream()
                .filter(s -> s.getId().equals(selectionId))
                .findFirst()
                .orElseThrow(() -> ApiException.notFound("Selection not found in this plan."));
    }
}