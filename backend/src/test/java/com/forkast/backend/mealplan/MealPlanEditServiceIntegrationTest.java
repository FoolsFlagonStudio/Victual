package com.forkast.backend.mealplan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.forkast.backend.common.exception.ApiException;
import com.forkast.backend.mealplan.dto.MealPlanDetailResponse;
import com.forkast.backend.mealplan.dto.MealPlanDetailResponse.Selection;
import com.forkast.backend.mealplan.dto.SuggestionResponse;
import com.forkast.backend.recipe.Recipe;
import com.forkast.backend.recipe.RecipeRepository;
import com.forkast.backend.user.User;
import com.forkast.backend.user.UserPreferences;
import com.forkast.backend.user.UserPreferencesRepository;
import com.forkast.backend.user.UserRepository;

/**
 * Lock, swap, suggestions and regenerate against the real recipes. A throwaway
 * user (3 dinners,
 * household of 2, Sunday start) plans a week in 2030, so nothing has started;
 * the
 * started-meal tests plan the current week instead. Rolls back.
 */
@SpringBootTest
@ActiveProfiles("local")
@Transactional
class MealPlanEditServiceIntegrationTest {

    private static final LocalDate FUTURE_SUNDAY = LocalDate.parse("2030-01-06");

    @Autowired
    private MealPlanService planService;
    @Autowired
    private MealPlanEditService editService;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserPreferencesRepository preferencesRepository;
    @Autowired
    private RecipeRepository recipeRepository;
    @Autowired
    private MealPlanRepository planRepository;

    private User user;
    private MealPlanDetailResponse plan;

    @BeforeEach
    void setUp() {
        user = userRepository.saveAndFlush(
                new User("Edit", "Tester", "edit-test-" + UUID.randomUUID() + "@example.com", "not-a-real-hash"));
        UserPreferences preferences = new UserPreferences(user, new BigDecimal("150.00"));
        preferences.setHouseholdServingSize(2);
        preferences.setPlanStartDay(DayOfWeek.SUNDAY);
        preferences.replaceMealSlots(Map.of(MealSlot.DINNER, 3));
        preferencesRepository.saveAndFlush(preferences);
        plan = planService.generate(user.getId(), FUTURE_SUNDAY);
    }

    private static Set<UUID> recipeIds(MealPlanDetailResponse plan) {
        return plan.selections().stream().map(s -> s.recipe().id()).collect(Collectors.toSet());
    }

    private static BigDecimal sumOfSelections(MealPlanDetailResponse plan) {
        return plan.selections().stream().map(Selection::estimatedCost).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static void assertStatus(Runnable call, HttpStatus status) {
        assertThatThrownBy(call::run)
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getStatus()).isEqualTo(status));
    }

    // ---------- lock and regenerate ----------

    @Test
    void aLockedSelectionSurvivesRegenerate() {
        Selection first = plan.selections().get(0);
        editService.setLocked(user.getId(), plan.id(), first.id(), true);

        MealPlanDetailResponse again = editService.regenerate(user.getId(), plan.id());

        Selection kept = again.selections().get(0);
        assertThat(kept.id()).isEqualTo(first.id());
        assertThat(kept.locked()).isTrue();
        assertThat(kept.recipe().id()).isEqualTo(first.recipe().id());
        assertThat(recipeIds(again)).hasSize(3); // still no repeats
        assertThat(again.usageCost()).isEqualByComparingTo(sumOfSelections(again));
        assertThat(again.groceryCost()).isNotNull();
    }

    @Test
    void regenerateKeepsEachSelectionsDaysAndServings() {
        MealPlanDetailResponse again = editService.regenerate(user.getId(), plan.id());

        assertThat(again.selections()).extracting(Selection::startDate)
                .containsExactlyElementsOf(plan.selections().stream().map(Selection::startDate).toList());
        assertThat(again.selections()).extracting(Selection::servings)
                .containsExactlyElementsOf(plan.selections().stream().map(Selection::servings).toList());
        assertThat(again.days()).allSatisfy(day -> assertThat(day.meals()).hasSize(1));
    }

    @Test
    void withEverythingLockedThereIsNothingToRegenerate() {
        plan.selections().forEach(s -> editService.setLocked(user.getId(), plan.id(), s.id(), true));

        assertStatus(() -> editService.regenerate(user.getId(), plan.id()), HttpStatus.CONFLICT);
    }

    // ---------- swap ----------

    @Test
    void pickForMeChangesOnlyThatRecipe() {
        Selection second = plan.selections().get(1);

        MealPlanDetailResponse swapped = editService.swap(user.getId(), plan.id(), second.id(), null);

        Selection after = swapped.selections().get(1);
        assertThat(after.recipe().id()).isNotEqualTo(second.recipe().id());
        assertThat(after.startDate()).isEqualTo(second.startDate());
        assertThat(after.servings()).isEqualTo(second.servings());
        assertThat(swapped.selections().get(0).recipe().id()).isEqualTo(plan.selections().get(0).recipe().id());
        assertThat(recipeIds(swapped)).hasSize(3);
        assertThat(swapped.usageCost()).isEqualByComparingTo(sumOfSelections(swapped));
    }

    @Test
    void aChosenRecipeFromTheSuggestionsIsUsed() {
        Selection second = plan.selections().get(1);
        SuggestionResponse suggestion = editService.suggestions(user.getId(), plan.id(), second.id()).get(0);

        MealPlanDetailResponse swapped = editService.swap(user.getId(), plan.id(), second.id(),
                suggestion.recipe().id());

        Selection after = swapped.selections().get(1);
        assertThat(after.recipe().id()).isEqualTo(suggestion.recipe().id());
        assertThat(after.estimatedCost()).isEqualByComparingTo(suggestion.estimatedCost());
        assertThat(swapped.usageCost()).isEqualByComparingTo(plan.usageCost().add(suggestion.costChange()));
    }

    @Test
    void aRecipeAlreadyInThePlanIsAConflict() {
        Selection second = plan.selections().get(1);
        UUID firstRecipe = plan.selections().get(0).recipe().id();

        assertStatus(() -> editService.swap(user.getId(), plan.id(), second.id(), firstRecipe), HttpStatus.CONFLICT);
    }

    @Test
    void aRecipeThatDoesntFitTheSlotIsRejected() {
        Recipe breakfastOnly = recipeRepository.findAll().stream()
                .filter(r -> r.getBreakfastScore() >= 50 && r.getDinnerScore() < 50 && r.getCostPerServing() != null)
                .findFirst().orElseThrow();

        assertStatus(() -> editService.swap(user.getId(), plan.id(), plan.selections().get(1).id(),
                breakfastOnly.getId()), HttpStatus.BAD_REQUEST);
    }

    // ---------- suggestions ----------

    @Test
    void suggestionsLeaveOutThePlansRecipesAndShowTheCostChange() {
        Selection second = plan.selections().get(1);

        List<SuggestionResponse> suggestions = editService.suggestions(user.getId(), plan.id(), second.id());

        assertThat(suggestions).isNotEmpty().hasSizeLessThanOrEqualTo(5);
        assertThat(suggestions).extracting(s -> s.recipe().id()).doesNotContainAnyElementsOf(recipeIds(plan));
        assertThat(suggestions).allSatisfy(s -> {
            assertThat(s.servings()).isEqualTo(second.servings());
            assertThat(s.costChange()).isEqualByComparingTo(s.estimatedCost().subtract(second.estimatedCost()));
        });
    }

    // ---------- past days ----------

    @Test
    void earlierDaysAreFixedButTodaysMealCanStillBeSwapped() {
        LocalDate today = LocalDate.now(ZoneId.of(user.getTimezone()));
        // A whole week around today, as the weekly job makes it (generate would start
        // today). 3 dinners from 3 days ago cook on day -3, today and day +2.
        UserPreferences preferences = preferencesRepository.findByUserId(user.getId()).orElseThrow();
        MealPlan built = planService.build(user, preferences, today.minusDays(3), PlanSource.AUTO, 42L);
        planRepository.saveAndFlush(built);
        MealPlanDetailResponse week = planService.detail(user.getId(), built.getId());

        Selection earlier = week.selections().stream().filter(s -> s.startDate().isBefore(today)).findFirst()
                .orElseThrow();
        assertStatus(() -> editService.swap(user.getId(), week.id(), earlier.id(), null), HttpStatus.CONFLICT);
        assertStatus(() -> editService.suggestions(user.getId(), week.id(), earlier.id()), HttpStatus.CONFLICT);

        // tonight's dinner hasn't been cooked yet: it can still be changed
        week.selections().stream().filter(s -> s.startDate().equals(today)).findFirst()
                .ifPresent(tonight -> assertThat(editService.suggestions(user.getId(), week.id(), tonight.id()))
                        .isNotNull());

        // regenerate leaves everything from today back alone
        if (week.selections().stream().anyMatch(s -> s.startDate().isAfter(today))) {
            MealPlanDetailResponse again = editService.regenerate(user.getId(), week.id());
            Selection kept = again.selections().stream().filter(s -> s.id().equals(earlier.id())).findFirst()
                    .orElseThrow();
            assertThat(kept.recipe().id()).isEqualTo(earlier.recipe().id());
        }
    }

    @Test
    void someoneElsesPlanIsNotFound() {
        User stranger = userRepository.saveAndFlush(
                new User("Other", "Tester", "edit-stranger-" + UUID.randomUUID() + "@example.com", "x"));
        UUID selectionId = plan.selections().get(0).id();

        assertStatus(() -> editService.regenerate(stranger.getId(), plan.id()), HttpStatus.NOT_FOUND);
        assertStatus(() -> editService.setLocked(stranger.getId(), plan.id(), selectionId, true), HttpStatus.NOT_FOUND);
    }
}