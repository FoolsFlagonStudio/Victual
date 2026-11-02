package com.forkast.backend.mealplan.planner;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import com.forkast.backend.ingest.SlotScores;
import com.forkast.backend.mealplan.MealSlot;

/** Mains that want a side get one, within the budget; and planning from today on. */
class SidePairingTest {

    private static final LocalDate SUNDAY = LocalDate.parse("2026-10-11");
    private static final SlotScores DINNER = new SlotScores(5, 40, 90);
    private static final SlotScores BREAKFAST = new SlotScores(90, 25, 10);
    private static final SlotScores NOT_A_MEAL = new SlotScores(0, 0, 0);

    private final PlanGenerator generator = new PlanGenerator(PlannerProperties.defaults());

    private static UUID id(String name) {
        return UUID.nameUUIDFromBytes(name.getBytes());
    }

    private static RecipeOption main(String name, SlotScores slots, String cost, boolean needsSide) {
        return new RecipeOption(id(name), 4, slots, new BigDecimal("500"), 50, new BigDecimal(cost), true, 0, false,
                null, 0, needsSide);
    }

    private static RecipeOption side(String name, String cost) {
        return new RecipeOption(id(name), 4, NOT_A_MEAL, new BigDecimal("200"), 50, new BigDecimal(cost), true, 0,
                false, null, 80, false);
    }

    private static List<RecipeOption> mains(int count, SlotScores slots, boolean needsSide) {
        List<RecipeOption> list = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            list.add(main("Main " + i, slots, "2.00", needsSide));
        }
        return list;
    }

    private static List<RecipeOption> sides(int count, String cost) {
        List<RecipeOption> list = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            list.add(side("Side " + i, cost));
        }
        return list;
    }

    private static PlanRequest request(MealSlot slot, int count, BigDecimal budget) {
        return new PlanRequest(SUNDAY, Map.of(slot, count), 1, false, false, budget, null, 14, 7L, List.of());
    }

    private static List<RecipeOption> both(List<RecipeOption> a, List<RecipeOption> b) {
        List<RecipeOption> all = new ArrayList<>(a);
        all.addAll(b);
        return all;
    }

    @Test
    void plainMainsGetADifferentSideEach() {
        GeneratedPlan plan = generator.generate(request(MealSlot.DINNER, 3, null),
                both(mains(5, DINNER, true), sides(4, "1.00")));

        assertThat(plan.picks()).hasSize(3).allMatch(p -> p.side() != null);
        Set<UUID> mainIds = plan.picks().stream().map(p -> p.recipe().id()).collect(Collectors.toSet());
        Set<UUID> sideIds = plan.picks().stream().map(p -> p.side().recipe().id()).collect(Collectors.toSet());
        assertThat(sideIds).hasSize(3).doesNotContainAnyElementsOf(mainIds);
    }

    @Test
    void aSideIsCookedForTheSameServingsAndCounted() {
        GeneratedPlan plan = generator.generate(request(MealSlot.DINNER, 3, null),
                both(mains(3, DINNER, true), sides(3, "1.00")));

        for (GeneratedPlan.Pick pick : plan.picks()) {
            assertThat(pick.side().cost()).isEqualByComparingTo(new BigDecimal(pick.servings()));
        }
        BigDecimal total = plan.picks().stream().map(GeneratedPlan.Pick::totalCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        // 7 servings of $2 mains + 7 servings of $1 sides
        assertThat(plan.usageCost()).isEqualByComparingTo(total).isEqualByComparingTo("21.00");
    }

    @Test
    void wholeMealsAndBreakfastsGetNoSide() {
        GeneratedPlan dinners = generator.generate(request(MealSlot.DINNER, 3, null),
                both(mains(3, DINNER, false), sides(3, "1.00")));
        GeneratedPlan breakfasts = generator.generate(request(MealSlot.BREAKFAST, 3, null),
                both(mains(3, BREAKFAST, true), sides(3, "1.00")));

        assertThat(dinners.picks()).allMatch(p -> p.side() == null);
        assertThat(breakfasts.picks()).allMatch(p -> p.side() == null);
    }

    @Test
    void aSideThatWouldBreakTheBudgetIsLeftOut() {
        // mains use $14 of a $16 budget ($14.40 with the 90% margin); a side for a 2-day run is $10
        GeneratedPlan plan = generator.generate(request(MealSlot.DINNER, 3, new BigDecimal("16.00")),
                both(mains(3, DINNER, true), sides(3, "5.00")));

        assertThat(plan.picks()).allMatch(p -> p.side() == null);
        assertThat(plan.usageCost()).isEqualByComparingTo("14.00");
    }

    @Test
    void noSidesWithoutSideRecipes() {
        GeneratedPlan plan = generator.generate(request(MealSlot.DINNER, 3, null), mains(3, DINNER, true));

        assertThat(plan.picks()).hasSize(3).allMatch(p -> p.side() == null);
    }

    @Test
    void aWeekThatHasStartedIsPlannedFromToday() {
        LocalDate friday = SUNDAY.plusDays(5);
        GeneratedPlan plan = generator.generate(request(MealSlot.DINNER, 4, null), mains(6, DINNER, false), friday);

        List<LocalDate> dates = plan.picks().stream().flatMap(p -> p.run().dates().stream())
                .filter(Objects::nonNull).toList();
        assertThat(dates).containsExactlyInAnyOrder(friday, friday.plusDays(1));
        assertThat(plan.openMeals()).isZero();
    }
}
