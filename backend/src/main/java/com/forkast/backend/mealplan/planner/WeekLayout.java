package com.forkast.backend.mealplan.planner;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.forkast.backend.mealplan.MealPlan;
import com.forkast.backend.mealplan.MealSlot;

/**
 * Splits a week into runs: for each slot, the user's count of distinct recipes
 * spread over the
 * 7 days, each cooked once and eaten on the following days.
 *
 * - Runs are as even as possible, longest first: 3 dinners become 3, 2 and 2
 * days.
 * - A run is at most maxRunDays (3), so food is eaten by the second day after
 * cooking.
 * - When the count can't cover the days that way (1 or 2 a week), runs stretch
 * to
 * stretchRunDays (4): 2 dinners become 4 and 3. Days still uncovered (a count
 * of 1 leaves 3)
 * are reported as open.
 * - With leftovers for lunch (and both slots on), a dinner also covers the lunch
 * the day after its last dinner (never the same dish twice in a day), when that
 * lunch is still within the freshness window: 1- and 2-day dinners feed a
 * lunch, 3-day ones don't. Lunch runs then fill only the lunch days left, and can't
 * extend past
 * their own freshness window, so a lunch run may be shorter than planned.
 *
 * - A week that has already started is laid out from today on (the from
 * overload).
 *
 * A plain class: no database, no Spring, so every case is a unit test.
 */
public class WeekLayout {

    private final int maxRunDays;
    private final int stretchRunDays;

    public WeekLayout(PlannerProperties properties) {
        this.maxRunDays = properties.maxRunDays();
        this.stretchRunDays = Math.max(properties.stretchRunDays(), properties.maxRunDays());
    }

    public WeekShape layout(LocalDate weekStart, Map<MealSlot, Integer> counts, boolean leftoversForLunch) {
        return layout(weekStart, counts, leftoversForLunch, weekStart);
    }

    /**
     * The same, for a week that has already started: only `from` (today) and the
     * days after it
     * are planned. The days before aren't laid out or counted as open; the user's
     * counts still
     * apply, so 4 dinners with 2 days left become 2 one-day dinners.
     */
    public WeekShape layout(LocalDate weekStart, Map<MealSlot, Integer> counts, boolean leftoversForLunch,
            LocalDate from) {
        List<LocalDate> week = new ArrayList<>();
        for (int i = 0; i < MealPlan.DAYS; i++) {
            LocalDate day = weekStart.plusDays(i);
            if (!day.isBefore(from)) {
                week.add(day);
            }
        }
        boolean lunchFromDinner = leftoversForLunch && counts.containsKey(MealSlot.LUNCH)
                && counts.containsKey(MealSlot.DINNER);

        List<SlotRun> runs = new ArrayList<>();
        Set<LocalDate> lunchesTaken = new HashSet<>();
        int open = 0;

        // Dinner before lunch, so lunch knows which days leftovers already cover
        for (MealSlot slot : List.of(MealSlot.BREAKFAST, MealSlot.DINNER, MealSlot.LUNCH)) {
            Integer count = counts.get(slot);
            if (count == null || count < 1) {
                continue;
            }
            List<LocalDate> days = slot == MealSlot.LUNCH
                    ? week.stream().filter(d -> !lunchesTaken.contains(d)).toList()
                    : week;

            Grouping grouping = group(days, count);
            int position = 1;
            for (List<LocalDate> dates : grouping.groups()) {
                LocalDate leftoverLunch = null;
                if (slot == MealSlot.DINNER && lunchFromDinner) {
                    // The day after the run's last dinner, so the same dish is never lunch
                    // and dinner on one day, and only while it's still within the freshness
                    // window (cook day + maxRunDays - 1).
                    LocalDate next = dates.get(dates.size() - 1).plusDays(1);
                    boolean fresh = !next.isAfter(dates.get(0).plusDays(maxRunDays - 1L));
                    if (fresh && week.contains(next) && lunchesTaken.add(next)) {
                        leftoverLunch = next;
                    }
                }
                runs.add(new SlotRun(slot, position++, dates, leftoverLunch, dates.size() > maxRunDays));
            }
            open += grouping.uncovered();
        }
        return new WeekShape(runs, open);
    }

    private record Grouping(List<List<LocalDate>> groups, int uncovered) {
    }

    /**
     * Splits dates (in order, possibly with gaps) into at most count runs. Each run
     * starts at the
     * next uncovered date and takes dates within its window (start + cap - 1 days)
     * up to its
     * planned length.
     */
    private Grouping group(List<LocalDate> dates, int count) {
        int total = dates.size();
        if (total == 0) {
            return new Grouping(List.of(), 0);
        }
        int cap = (long) count * maxRunDays >= total ? maxRunDays : stretchRunDays;
        int runs = Math.min(count, total);

        List<List<LocalDate>> groups = new ArrayList<>();
        int next = 0;
        for (int i = 0; i < runs && next < total; i++) {
            int planned = Math.min(cap, total / runs + (i < total % runs ? 1 : 0));
            LocalDate start = dates.get(next);
            LocalDate lastAllowed = start.plusDays(cap - 1L);
            List<LocalDate> group = new ArrayList<>();
            while (next < total && group.size() < planned && !dates.get(next).isAfter(lastAllowed)) {
                group.add(dates.get(next++));
            }
            groups.add(group);
        }
        return new Grouping(groups, total - next);
    }
}