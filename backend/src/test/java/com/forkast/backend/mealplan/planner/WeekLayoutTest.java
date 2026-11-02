package com.forkast.backend.mealplan.planner;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.forkast.backend.mealplan.MealSlot;

class WeekLayoutTest {

    private static final LocalDate SUNDAY = LocalDate.parse("2026-10-11");

    private final WeekLayout layout = new WeekLayout(PlannerProperties.defaults());

    private static List<Integer> lengths(WeekShape shape, MealSlot slot) {
        return shape.runs().stream().filter(r -> r.slot() == slot).map(r -> r.dates().size()).toList();
    }

    private static LocalDate day(int offset) {
        return SUNDAY.plusDays(offset);
    }

    @ParameterizedTest(name = "{0} a week -> {1}, {2} open")
    @CsvSource(delimiter = '|', value = {
            "1 | 4           | 3", // stretched, the rest of the week left open
            "2 | 4,3         | 0", // stretched to cover the week
            "3 | 3,2,2       | 0",
            "4 | 2,2,2,1     | 0",
            "5 | 2,2,1,1,1   | 0",
            "6 | 2,1,1,1,1,1 | 0",
            "7 | 1,1,1,1,1,1,1 | 0",
    })
    void spreadsTheCountOverTheWeekLongestFirst(int count, String expected, int open) {
        WeekShape shape = layout.layout(SUNDAY, Map.of(MealSlot.DINNER, count), false);

        List<Integer> want = java.util.Arrays.stream(expected.split(",")).map(String::trim).map(Integer::valueOf)
                .toList();
        assertThat(lengths(shape, MealSlot.DINNER)).isEqualTo(want);
        assertThat(shape.openMeals()).isEqualTo(open);
    }

    @Test
    void runsAreConsecutiveFromTheWeekStartAndNumbered() {
        WeekShape shape = layout.layout(SUNDAY, Map.of(MealSlot.DINNER, 3), false);

        assertThat(shape.runs()).extracting(SlotRun::position).containsExactly(1, 2, 3);
        assertThat(shape.runs().get(0).dates()).containsExactly(day(0), day(1), day(2));
        assertThat(shape.runs().get(1).cookDate()).isEqualTo(day(3));
        assertThat(shape.runs().get(2).dates()).containsExactly(day(5), day(6));
    }

    @Test
    void onlyRunsPastTheFreshnessLimitAreStretched() {
        WeekShape two = layout.layout(SUNDAY, Map.of(MealSlot.DINNER, 2), false);
        WeekShape three = layout.layout(SUNDAY, Map.of(MealSlot.DINNER, 3), false);

        assertThat(two.runs()).extracting(SlotRun::stretched).containsExactly(true, false);
        assertThat(three.runs()).noneMatch(SlotRun::stretched);
    }

    @Test
    void slotsAreLaidOutIndependentlyWithoutLeftoverLunches() {
        WeekShape shape = layout.layout(SUNDAY,
                Map.of(MealSlot.BREAKFAST, 1, MealSlot.LUNCH, 3, MealSlot.DINNER, 3), false);

        assertThat(lengths(shape, MealSlot.BREAKFAST)).containsExactly(4);
        assertThat(lengths(shape, MealSlot.LUNCH)).containsExactly(3, 2, 2);
        assertThat(lengths(shape, MealSlot.DINNER)).containsExactly(3, 2, 2);
        assertThat(shape.runs()).allMatch(r -> r.leftoverLunch() == null);
        assertThat(shape.openMeals()).isEqualTo(3); // breakfast Thursday to Saturday
    }

    @Test
    void dinnerLeftoversAreTheLunchAfterTheLastDinnerAndLunchFillsTheRest() {
        // 4 dinners: Sun-Mon, Tue-Wed, Thu-Fri, Sat
        WeekShape shape = layout.layout(SUNDAY, Map.of(MealSlot.LUNCH, 3, MealSlot.DINNER, 4), true);

        List<SlotRun> dinners = shape.runs().stream().filter(r -> r.slot() == MealSlot.DINNER).toList();
        // Tue, Thu, Sat lunches; Saturday's dinner would feed next Sunday, outside the week
        assertThat(dinners).extracting(SlotRun::leftoverLunch).containsExactly(day(2), day(4), day(6), null);
        assertThat(dinners.get(0).meals()).isEqualTo(3); // 2 dinners + Tuesday's lunch
        assertThat(dinners.get(0).servings(2)).isEqualTo(6);

        List<LocalDate> lunchDays = shape.runs().stream()
                .filter(r -> r.slot() == MealSlot.LUNCH)
                .flatMap(r -> r.dates().stream())
                .toList();
        assertThat(lunchDays).containsExactly(day(0), day(1), day(3), day(5));
        assertThat(shape.openMeals()).isZero();
    }

    @Test
    void theSameDishIsNeverLunchAndDinnerOnOneDay() {
        for (int dinnersCount = 1; dinnersCount <= 7; dinnersCount++) {
            WeekShape shape = layout.layout(SUNDAY, Map.of(MealSlot.LUNCH, 3, MealSlot.DINNER, dinnersCount), true);
            for (SlotRun dinner : shape.runs()) {
                if (dinner.leftoverLunch() != null) {
                    assertThat(dinner.dates()).doesNotContain(dinner.leftoverLunch());
                    assertThat(dinner.leftoverLunch()).isBeforeOrEqualTo(dinner.cookDate().plusDays(2));
                }
            }
        }
    }

    @Test
    void aThreeDayDinnerIsTooOldForLunchAfterIt() {
        WeekShape shape = layout.layout(SUNDAY, Map.of(MealSlot.LUNCH, 3, MealSlot.DINNER, 3), true);

        SlotRun first = shape.runs().stream().filter(r -> r.slot() == MealSlot.DINNER).findFirst().orElseThrow();
        assertThat(first.dates()).hasSize(3);
        assertThat(first.leftoverLunch()).isNull();
    }

    @Test
    void lunchRunsStayWithinTheirFreshnessWindow() {
        // two lunch recipes for Sun, Tue, Wed, Fri: no run may reach past its cook day
        // + 2
        WeekShape shape = layout.layout(SUNDAY, Map.of(MealSlot.LUNCH, 2, MealSlot.DINNER, 3), true);

        assertThat(shape.runs()).filteredOn(r -> r.slot() == MealSlot.LUNCH)
                .allSatisfy(r -> assertThat(r.dates().get(r.dates().size() - 1))
                        .isBeforeOrEqualTo(r.cookDate().plusDays(2)));
    }

    @Test
    void leftoversForLunchNeedsBothSlots() {
        WeekShape shape = layout.layout(SUNDAY, Map.of(MealSlot.DINNER, 3), true);

        assertThat(shape.runs()).allMatch(r -> r.leftoverLunch() == null);
    }

    @Test
    void moreLunchRecipesThanLunchDaysUsesFewerRuns() {
        WeekShape shape = layout.layout(SUNDAY, Map.of(MealSlot.LUNCH, 7, MealSlot.DINNER, 3), true);

        assertThat(lengths(shape, MealSlot.LUNCH)).containsExactly(1, 1, 1, 1);
    }

    @Test
    void aWeekThatHasStartedIsLaidOutFromToday() {
        // Friday: two days left, four dinners asked for
        WeekShape shape = layout.layout(SUNDAY, Map.of(MealSlot.DINNER, 4), false, day(5));

        assertThat(lengths(shape, MealSlot.DINNER)).containsExactly(1, 1);
        assertThat(shape.runs()).allMatch(r -> !r.cookDate().isBefore(day(5)));
        assertThat(shape.openMeals()).isZero();
    }

    @Test
    void fromOnOrBeforeTheStartIsTheWholeWeek() {
        WeekShape early = layout.layout(SUNDAY, Map.of(MealSlot.DINNER, 3), false, SUNDAY.minusDays(3));

        assertThat(lengths(early, MealSlot.DINNER)).containsExactly(3, 2, 2);
    }
}
