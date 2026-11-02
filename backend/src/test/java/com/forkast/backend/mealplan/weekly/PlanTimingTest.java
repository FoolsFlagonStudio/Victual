package com.forkast.backend.mealplan.weekly;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.junit.jupiter.api.Test;

class PlanTimingTest {

    private static final LocalTime ELEVEN_PM = LocalTime.of(23, 0);
    private static final ZoneId NEW_YORK = ZoneId.of("America/New_York");
    private static final ZoneId LOS_ANGELES = ZoneId.of("America/Los_Angeles");
    private static final LocalDate SATURDAY = LocalDate.parse("2026-10-10");

    private static ZonedDateTime at(LocalDate date, String time, ZoneId zone) {
        return date.atTime(LocalTime.parse(time)).atZone(zone);
    }

    @Test
    void dueFromElevenTheNightBeforeTheStartDay() {
        assertThat(PlanTiming.dueWeekStart(at(SATURDAY, "23:00", NEW_YORK), DayOfWeek.SUNDAY, ELEVEN_PM))
                .contains(SATURDAY.plusDays(1));
        assertThat(PlanTiming.dueWeekStart(at(SATURDAY, "23:59", NEW_YORK), DayOfWeek.SUNDAY, ELEVEN_PM))
                .contains(SATURDAY.plusDays(1));
    }

    @Test
    void notBeforeEleven() {
        assertThat(PlanTiming.dueWeekStart(at(SATURDAY, "22:59", NEW_YORK), DayOfWeek.SUNDAY, ELEVEN_PM)).isEmpty();
    }

    @Test
    void notOnTheStartDayItselfOrAnyOtherNight() {
        assertThat(PlanTiming.dueWeekStart(at(SATURDAY.plusDays(1), "00:20", NEW_YORK), DayOfWeek.SUNDAY, ELEVEN_PM))
                .isEmpty();
        assertThat(PlanTiming.dueWeekStart(at(SATURDAY.minusDays(1), "23:30", NEW_YORK), DayOfWeek.SUNDAY, ELEVEN_PM))
                .isEmpty();
    }

    @Test
    void theStartDayCanBeAnyDay() {
        // Wednesday starts are due Tuesday night
        assertThat(PlanTiming.dueWeekStart(at(LocalDate.parse("2026-10-13"), "23:20", NEW_YORK), DayOfWeek.WEDNESDAY,
                ELEVEN_PM)).contains(LocalDate.parse("2026-10-14"));
    }

    @Test
    void theSameMomentIsDueInOneTimezoneAndNotAnother() {
        // 11:20pm Saturday in New York is 8:20pm in Los Angeles
        Instant moment = at(SATURDAY, "23:20", NEW_YORK).toInstant();

        assertThat(PlanTiming.dueWeekStart(moment.atZone(NEW_YORK), DayOfWeek.SUNDAY, ELEVEN_PM)).isPresent();
        assertThat(PlanTiming.dueWeekStart(moment.atZone(LOS_ANGELES), DayOfWeek.SUNDAY, ELEVEN_PM)).isEmpty();
        // and three hours later it's Los Angeles's turn, while New York's start day has
        // begun
        Instant later = moment.plusSeconds(3 * 3600);
        assertThat(PlanTiming.dueWeekStart(later.atZone(LOS_ANGELES), DayOfWeek.SUNDAY, ELEVEN_PM)).isPresent();
        assertThat(PlanTiming.dueWeekStart(later.atZone(NEW_YORK), DayOfWeek.SUNDAY, ELEVEN_PM)).isEmpty();
    }

    @Test
    void aChosenPlanDayMakesTheComingWeekEarly() {
        // Sunday start, plans made Wednesday night: the coming Sunday's week
        LocalDate wednesday = LocalDate.parse("2026-10-14");
        assertThat(PlanTiming.dueWeekStart(at(wednesday, "23:10", NEW_YORK), DayOfWeek.SUNDAY, ELEVEN_PM,
                DayOfWeek.WEDNESDAY)).contains(LocalDate.parse("2026-10-18"));
        assertThat(PlanTiming.dueWeekStart(at(wednesday, "22:10", NEW_YORK), DayOfWeek.SUNDAY, ELEVEN_PM,
                DayOfWeek.WEDNESDAY)).isEmpty();
        assertThat(PlanTiming.dueWeekStart(at(SATURDAY, "23:10", NEW_YORK), DayOfWeek.SUNDAY, ELEVEN_PM,
                DayOfWeek.WEDNESDAY)).isEmpty();
    }

    @Test
    void noPlanDayIsTheNightBefore() {
        assertThat(PlanTiming.dueWeekStart(at(SATURDAY, "23:30", NEW_YORK), DayOfWeek.SUNDAY, ELEVEN_PM, null))
                .contains(SATURDAY.plusDays(1));
    }
}
