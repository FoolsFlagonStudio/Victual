package com.forkast.backend.mealplan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.forkast.backend.common.exception.ApiException;
import com.forkast.backend.mealplan.dto.MealPlanDetailResponse;
import com.forkast.backend.user.User;
import com.forkast.backend.user.UserPreferences;
import com.forkast.backend.user.UserPreferencesRepository;
import com.forkast.backend.user.UserRepository;

/**
 * Generating, reading and deleting plans against the real database and the
 * recipes already in
 * it. Each test makes a throwaway user (3 dinners a week, household of 2,
 * Sunday start) and
 * plans a week far in the future, so real plans are never touched. Everything
 * rolls back.
 *
 * Needs at least 3 priced recipes with a dinner score of 50 or more, which the
 * scraped
 * Budget Bytes recipes cover.
 */
@SpringBootTest
@ActiveProfiles("local")
@Transactional
class MealPlanServiceIntegrationTest {

    private static final LocalDate FUTURE_SUNDAY = LocalDate.parse("2030-01-06");

    @Autowired
    private MealPlanService service;
    @Autowired
    private MealPlanRepository planRepository;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserPreferencesRepository preferencesRepository;

    private User user;
    private UserPreferences preferences;

    private User newUser(String email) {
        return userRepository.saveAndFlush(new User("Plan", "Tester", email, "not-a-real-hash"));
    }

    @BeforeEach
    void setUp() {
        user = newUser("plan-test-" + UUID.randomUUID() + "@example.com");
        preferences = new UserPreferences(user, new BigDecimal("100.00"));
        preferences.setHouseholdServingSize(2);
        preferences.setPlanStartDay(DayOfWeek.SUNDAY);
        preferences.replaceMealSlots(Map.of(MealSlot.DINNER, 3));
        preferencesRepository.saveAndFlush(preferences);
    }

    @Test
    void generatesAndSavesAFullWeekOfDinners() {
        MealPlanDetailResponse plan = service.generate(user.getId(), FUTURE_SUNDAY);

        assertThat(plan.weekStart()).isEqualTo(FUTURE_SUNDAY);
        assertThat(plan.weekEnd()).isEqualTo(FUTURE_SUNDAY.plusDays(6));
        assertThat(plan.source()).isEqualTo(PlanSource.MANUAL);
        assertThat(plan.selections()).hasSize(3);
        assertThat(plan.selections()).extracting(MealPlanDetailResponse.Selection::daysCovered)
                .containsExactly(3, 2, 2);
        assertThat(plan.selections().get(0).servings()).isEqualTo(6); // 2 people x 3 days
        assertThat(plan.days()).hasSize(7);
        assertThat(plan.days()).allSatisfy(day -> assertThat(day.meals()).hasSize(1));
        assertThat(plan.days().get(0).meals().get(0).leftover()).isFalse();
        assertThat(plan.days().get(1).meals().get(0).leftover()).isTrue();
        assertThat(plan.open()).isEmpty();
        assertThat(plan.openMeals()).isZero();

        // usage adds each main and its side, if the draw paired one
        BigDecimal sum = plan.selections().stream()
                .map(s -> s.sideEstimatedCost() == null ? s.estimatedCost() : s.estimatedCost().add(s.sideEstimatedCost()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(plan.usageCost()).isEqualByComparingTo(sum);
        assertThat(plan.groceryCost()).isNotNull(); // the grocery list is built with the plan

        MealPlan saved = planRepository.findById(plan.id()).orElseThrow();
        assertThat(saved.getGenerationSeed()).isNotNull();
        assertThat(saved.getPlannedMeals()).hasSize(7);
    }

    @Test
    void noRecipeRepeatsInAWeek() {
        MealPlanDetailResponse plan = service.generate(user.getId(), FUTURE_SUNDAY);

        assertThat(plan.selections()).extracting(s -> s.recipe().id()).doesNotHaveDuplicates();
    }

    @Test
    void theSameSeedBuildsTheSamePlan() {
        MealPlan first = service.build(user, preferences, FUTURE_SUNDAY, PlanSource.AUTO, 1234L);
        MealPlan again = service.build(user, preferences, FUTURE_SUNDAY, PlanSource.AUTO, 1234L);

        assertThat(again.getSelections()).extracting(s -> s.getRecipe().getId())
                .containsExactlyElementsOf(first.getSelections().stream().map(s -> s.getRecipe().getId()).toList());
    }

    @Test
    void aSecondPlanForTheSameWeekIsAConflict() {
        service.generate(user.getId(), FUTURE_SUNDAY);

        assertStatus(() -> service.generate(user.getId(), FUTURE_SUNDAY), HttpStatus.CONFLICT);
    }

    @Test
    void theWeekMustStartOnThePlanStartDay() {
        assertThatThrownBy(() -> service.generate(user.getId(), FUTURE_SUNDAY.plusDays(1)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void withoutPreferencesThereIsNothingToPlan() {
        User bare = newUser("plan-test-bare-" + UUID.randomUUID() + "@example.com");

        assertStatus(() -> service.generate(bare.getId(), FUTURE_SUNDAY), HttpStatus.valueOf(422));
    }

    @Test
    void currentIsThePlanCoveringToday() {
        LocalDate today = LocalDate.now(ZoneId.of(user.getTimezone()));
        LocalDate thisWeek = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY));
        MealPlanDetailResponse plan = service.generate(user.getId(), thisWeek);

        assertThat(service.current(user.getId()).id()).isEqualTo(plan.id());
    }

    @Test
    void noPlanForTodayIsNotFound() {
        service.generate(user.getId(), FUTURE_SUNDAY);

        assertStatus(() -> service.current(user.getId()), HttpStatus.NOT_FOUND);
    }

    @Test
    void someoneElsesPlanIsNotFound() {
        MealPlanDetailResponse plan = service.generate(user.getId(), FUTURE_SUNDAY);
        User stranger = newUser("plan-test-stranger-" + UUID.randomUUID() + "@example.com");

        assertStatus(() -> service.detail(stranger.getId(), plan.id()), HttpStatus.NOT_FOUND);
        assertStatus(() -> service.delete(stranger.getId(), plan.id()), HttpStatus.NOT_FOUND);
        assertThat(planRepository.existsById(plan.id())).isTrue();
    }

    @Test
    void listIsNewestWeekFirstAndDeleteRemovesThePlan() {
        MealPlanDetailResponse older = service.generate(user.getId(), FUTURE_SUNDAY);
        MealPlanDetailResponse newer = service.generate(user.getId(), FUTURE_SUNDAY.plusWeeks(1));

        assertThat(service.list(user.getId(), 0, 10).items()).extracting(p -> p.id())
                .containsExactly(newer.id(), older.id());

        service.delete(user.getId(), older.id());
        planRepository.flush();

        assertStatus(() -> service.detail(user.getId(), older.id()), HttpStatus.NOT_FOUND);
        assertThat(service.list(user.getId(), 0, 10).total()).isEqualTo(1);
    }

    @Test
    void aRecipeFromLastWeekWaitsOutTheRepeatWindow() {
        MealPlanDetailResponse first = service.generate(user.getId(), FUTURE_SUNDAY);
        MealPlanDetailResponse next = service.generate(user.getId(), FUTURE_SUNDAY.plusWeeks(1));

        // 14-day window, and plenty of dinners to choose from, so nothing comes back a
        // week later
        assertThat(next.selections()).extracting(s -> s.recipe().id())
                .doesNotContainAnyElementsOf(first.selections().stream().map(s -> s.recipe().id()).toList());
    }

    private static void assertStatus(Runnable call, HttpStatus status) {
        assertThatThrownBy(call::run)
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getStatus()).isEqualTo(status));
    }
}