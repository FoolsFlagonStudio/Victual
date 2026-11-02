package com.forkast.backend.mealplan;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.forkast.backend.common.PageResponse;
import com.forkast.backend.common.exception.ApiException;
import com.forkast.backend.mealplan.dto.MealPlanDetailResponse;
import com.forkast.backend.mealplan.dto.MealPlanSummaryResponse;
import com.forkast.backend.mealplan.grocery.GroceryListService;
import com.forkast.backend.mealplan.planner.GeneratedPlan;
import com.forkast.backend.mealplan.planner.PlanGenerator;
import com.forkast.backend.mealplan.planner.PlanRequest;
import com.forkast.backend.mealplan.planner.PlannerProperties;
import com.forkast.backend.mealplan.planner.SlotRun;
import com.forkast.backend.recipe.Recipe;
import com.forkast.backend.user.User;
import com.forkast.backend.user.UserPreferences;
import com.forkast.backend.user.UserPreferencesRepository;
import com.forkast.backend.user.UserRepository;

/**
 * Creates, reads and deletes meal plans. Generation loads the inputs
 * (RecipeOptionLoader), lets
 * PlanGenerator choose, saves the picks as selections with one calendar row per
 * meal, and
 * builds the grocery list.
 *
 * Every read is scoped to the signed-in user: someone else's plan id is a 404,
 * like a missing one.
 */
@Service
public class MealPlanService {

    /** Plans drawn at most to bring the grocery list under budget (see build). */
    static final int BUDGET_ATTEMPTS = 3;

    private final MealPlanRepository planRepository;
    private final UserRepository userRepository;
    private final UserPreferencesRepository preferencesRepository;
    private final RecipeOptionLoader optionLoader;
    private final GroceryListService groceryListService;
    private final PlanGenerator generator;
    private final Clock clock;

    public MealPlanService(MealPlanRepository planRepository, UserRepository userRepository,
            UserPreferencesRepository preferencesRepository, RecipeOptionLoader optionLoader,
            GroceryListService groceryListService, PlannerProperties plannerProperties, Clock clock) {
        this.planRepository = planRepository;
        this.userRepository = userRepository;
        this.preferencesRepository = preferencesRepository;
        this.optionLoader = optionLoader;
        this.groceryListService = groceryListService;
        this.generator = new PlanGenerator(plannerProperties);
        this.clock = clock;
    }

    // ---------- generate ----------

    /**
     * The user asked for a plan. weekStart null = the next plan start day in their
     * timezone.
     * 409 if that week already has a plan; 422 without preferences or meal slots.
     */
    @Transactional
    public MealPlanDetailResponse generate(UUID userId, LocalDate weekStart) {
        User user = userRepository.findById(userId).orElseThrow(() -> ApiException.notFound("User not found."));
        UserPreferences preferences = requirePlannable(userId);
        LocalDate today = LocalDate.now(clock.withZone(user.getZoneId()));
        LocalDate start = weekStart != null ? weekStart : PlanWeeks.nextStart(today, preferences.getPlanStartDay());
        PlanWeeks.validateWeekStart(start, preferences.getPlanStartDay(), today);

        if (planRepository.existsByUserIdAndWeekStartDate(userId, start)) {
            throw ApiException.conflict("You already have a plan for the week of " + start + ".");
        }
        // A week that has already started (planning on a Wednesday) is planned from today on
        MealPlan plan = build(user, preferences, start, PlanSource.MANUAL, ThreadLocalRandom.current().nextLong(),
                today.isAfter(start) ? today : start);
        // The unique key on user + week backs up the check above if two requests race
        // (409 too)
        planRepository.saveAndFlush(plan);
        return MealPlanDetailResponse.from(plan, preferences.getMealSlots().keySet());
    }

    /**
     * Draws a plan, with its grocery list, and returns it unsaved. Public for the
     * weekly job,
     * which makes AUTO plans the same way; the caller has already checked the week
     * is free.
     */
    public MealPlan build(User user, UserPreferences preferences, LocalDate weekStart, PlanSource source, long seed) {
        return build(user, preferences, weekStart, source, seed, weekStart);
    }

    /** The same, planning only `from` on (today, for a week the user asks for mid-week). */
    public MealPlan build(User user, UserPreferences preferences, LocalDate weekStart, PlanSource source, long seed,
            LocalDate from) {
        RecipeOptionLoader.Loaded loaded = optionLoader.load(user.getId(), preferences, weekStart, user.getZoneId());
        BigDecimal budget = preferences.getWeeklyBudget() != null && preferences.getWeeklyBudget().signum() > 0
                ? preferences.getWeeklyBudget()
                : null;

        // The generator fits the budget on what the meals use, but the grocery list buys
        // whole packages, which costs more. When the list comes in over budget, aim
        // lower by that ratio and draw again (same seed), up to BUDGET_ATTEMPTS times.
        BigDecimal target = budget;
        MealPlan plan = null;
        for (int attempt = 0; attempt < BUDGET_ATTEMPTS; attempt++) {
            PlanRequest request = new PlanRequest(weekStart, preferences.getMealSlots(),
                    Math.max(1, preferences.getHouseholdServingSize()), preferences.isLeftoversForLunch(),
                    preferences.isPrefersMealPrep(), target, preferences.getMaxCaloriesPerMeal(),
                    preferences.getRepeatAvoidanceDays(), seed, List.of());
            GeneratedPlan generated = generator.generate(request, loaded.options(), from);

            plan = new MealPlan(user, weekStart, budget, source);
            plan.setMealPrepMode(preferences.isPrefersMealPrep());
            plan.recordGeneration(seed, Instant.now(clock));
            for (GeneratedPlan.Pick pick : generated.picks()) {
                addSelection(plan, pick, loaded.recipes());
            }
            plan.setCosts(generated.usageCost(), null, generated.openMeals());
            groceryListService.rebuild(plan); // sets the grocery cost and over-budget flag

            BigDecimal groceries = plan.getGroceryCost();
            if (budget == null || groceries == null || groceries.compareTo(budget) <= 0 || groceries.signum() == 0) {
                break;
            }
            target = target.multiply(budget).divide(groceries, 2, RoundingMode.HALF_UP);
        }
        return plan;
    }

    /**
     * One pick as a selection: cooked on the run's first day, leftovers after, plus
     * a leftover lunch.
     */
    private static void addSelection(MealPlan plan, GeneratedPlan.Pick pick, Map<UUID, Recipe> recipes) {
        SlotRun run = pick.run();
        PlanSelection selection = new PlanSelection(run.slot(), run.position(), run.cookDate(), run.dates().size());
        selection.assignRecipe(recipes.get(pick.recipe().id()), pick.servings(), pick.portionMultiplier(),
                pick.cost());
        if (pick.side() != null) {
            selection.assignSide(recipes.get(pick.side().recipe().id()), pick.side().portionMultiplier(),
                    pick.side().cost());
        }
        if (pick.locked()) {
            selection.lock();
        }
        plan.addSelection(selection);
        for (int i = 0; i < run.dates().size(); i++) {
            selection.addMeal(run.dates().get(i), run.slot(), i > 0);
        }
        if (run.leftoverLunch() != null) {
            selection.addMeal(run.leftoverLunch(), MealSlot.LUNCH, true);
        }
    }

    private UserPreferences requirePlannable(UUID userId) {
        UserPreferences preferences = preferencesRepository.findByUserId(userId)
                .orElseThrow(() -> ApiException.unprocessable("Set up your preferences before generating a plan."));
        if (preferences.getMealSlots().isEmpty()) {
            throw ApiException.unprocessable("Choose at least one meal to plan (breakfast, lunch or dinner).");
        }
        return preferences;
    }

    // ---------- read ----------

    @Transactional(readOnly = true)
    public PageResponse<MealPlanSummaryResponse> list(UUID userId, int page, int size) {
        Page<MealPlan> plans = planRepository.findByUserId(userId,
                PageRequest.of(page, size, Sort.by(Sort.Order.desc("weekStartDate"))));
        return new PageResponse<>(plans.getContent().stream().map(MealPlanSummaryResponse::from).toList(),
                page, size, plans.getTotalElements());
    }

    /** The plan covering today in the user's timezone, else 404. */
    @Transactional(readOnly = true)
    public MealPlanDetailResponse current(UUID userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> ApiException.notFound("User not found."));
        LocalDate today = LocalDate.now(clock.withZone(user.getZoneId()));
        MealPlan plan = planRepository
                .findFirstByUserIdAndWeekStartDateLessThanEqualAndWeekStartDateGreaterThanEqualOrderByWeekStartDateDesc(
                        userId, today, today.minusDays(MealPlan.DAYS - 1L))
                .orElseThrow(() -> ApiException.notFound("No plan covers today."));
        return MealPlanDetailResponse.from(plan, slotsOf(userId));
    }

    @Transactional(readOnly = true)
    public MealPlanDetailResponse detail(UUID userId, UUID planId) {
        return MealPlanDetailResponse.from(requireOwn(userId, planId), slotsOf(userId));
    }

    // ---------- delete ----------

    @Transactional
    public void delete(UUID userId, UUID planId) {
        planRepository.delete(requireOwn(userId, planId));
    }

    // ---------- helpers ----------

    private MealPlan requireOwn(UUID userId, UUID planId) {
        return planRepository.findByIdAndUserId(planId, userId)
                .orElseThrow(() -> ApiException.notFound("Meal plan not found."));
    }

    private Set<MealSlot> slotsOf(UUID userId) {
        return preferencesRepository.findByUserId(userId).map(p -> p.getMealSlots().keySet()).orElse(Set.of());
    }
}