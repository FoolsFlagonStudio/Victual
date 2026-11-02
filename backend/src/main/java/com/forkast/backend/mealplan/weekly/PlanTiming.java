package com.forkast.backend.mealplan.weekly;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.Optional;

/**
 * When the weekly job makes a user's next plan: from generate-at (11pm) local
 * time on the night
 * before their plan start day, until midnight. A Sunday start in New York is
 * due from 11pm
 * Saturday Eastern; in Los Angeles, three hours later on the same clock.
 *
 * Users can pick another day (UserPreferences.autoPlanDay) or turn it off.
 *
 * Only that last hour of the day counts. Once the start day itself has begun,
 * the job leaves
 * the week alone, so deleting a fresh plan doesn't make it come back.
 */
public final class PlanTiming {

    private PlanTiming() {
    }

    /**
     * With the user's own plan day: from generate-at on planDay, for the next start
     * day after it
     * (a Wednesday plan day with a Sunday start makes the coming Sunday's week, four
     * days early).
     * planDay null = the night before the start day, as below.
     */
    public static Optional<LocalDate> dueWeekStart(ZonedDateTime localNow, DayOfWeek startDay, LocalTime generateAt,
            DayOfWeek planDay) {
        DayOfWeek day = planDay != null ? planDay : startDay.minus(1);
        LocalDate today = localNow.toLocalDate();
        if (today.getDayOfWeek() != day || localNow.toLocalTime().isBefore(generateAt)) {
            return Optional.empty();
        }
        return Optional.of(today.with(TemporalAdjusters.next(startDay)));
    }

    /** The week to generate now, or empty when it isn't this user's time. */
    public static Optional<LocalDate> dueWeekStart(ZonedDateTime localNow, DayOfWeek startDay, LocalTime generateAt) {
        LocalDate tomorrow = localNow.toLocalDate().plusDays(1);
        if (tomorrow.getDayOfWeek() != startDay || localNow.toLocalTime().isBefore(generateAt)) {
            return Optional.empty();
        }
        return Optional.of(tomorrow);
    }
}