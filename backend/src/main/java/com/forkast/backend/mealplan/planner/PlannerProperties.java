package com.forkast.backend.mealplan.planner;

import java.math.BigDecimal;
import java.time.LocalTime;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * forkast.planner.* settings, all with defaults, so the generator can be tuned
 * once there are
 * hundreds of recipes without touching code.
 *
 * max-run-days=3 a recipe is eaten by the second day after it's cooked
 * stretch-run-days=4 the longest a run gets when the user's count can't cover
 * the week
 * stretch-min-meal-prep=70 only recipes that hold well (soups, stews) take a
 * stretched run
 * budget-margin=0.90 usage cost must fit this share of the weekly budget
 * leftover-base=0.40 leftovers factor = base + (1 - base) x meal-prep score /
 * 100
 * favorite-boost=1.5
 * recent-factor=0.70 served within twice the repeat window
 * incomplete-cost-factor=0.85
 * overlap-boost=3.0 up to 4x the weight for a recipe that reuses the plan's
 * distinctive fresh ingredients (one bunch of cilantro across two meals)
 * overlap-saturation=4.0 how much sharing earns the full boost: a sum of
 * ingredient rarity (ln of recipes / recipes using it), so onions count little
 * sameness-threshold=0.5 share of ingredients in common with a picked recipe
 * that makes it "the same meal again"
 * sameness-factor=0.25 weight for such a recipe
 * max-same-protein=2 recipes in a plan built on one protein before it's
 * held back
 * protein-repeat-factor=0.10 weight for a recipe past that
 * generate-at=23:00 the weekly job makes next week's plan from this time,
 * local, the
 * night before the user's plan start day
 *
 * The job's schedule is forkast.planner.cron (default "0 20 * * * *": minute 20
 * of every hour;
 * "-" turns it off). It's read by @Scheduled, so it isn't part of this record.
 */
@Validated
@ConfigurationProperties(prefix = "forkast.planner")
public record PlannerProperties(
        @Min(1) @Max(7) @DefaultValue("3") int maxRunDays,
        @Min(1) @Max(7) @DefaultValue("4") int stretchRunDays,
        @Min(0) @Max(100) @DefaultValue("70") int stretchMinMealPrep,
        @DecimalMin("0.1") @DecimalMax("1.0") @DefaultValue("0.90") BigDecimal budgetMargin,
        @DecimalMin("0.0") @DecimalMax("1.0") @DefaultValue("0.40") double leftoverBase,
        @DecimalMin("1.0") @DefaultValue("1.5") double favoriteBoost,
        @DecimalMin("0.0") @DecimalMax("1.0") @DefaultValue("0.70") double recentFactor,
        @DecimalMin("0.0") @DecimalMax("1.0") @DefaultValue("0.85") double incompleteCostFactor,
        @DecimalMin("0.0") @DefaultValue("3.0") double overlapBoost,
        @DecimalMin("0.1") @DefaultValue("4.0") double overlapSaturation,
        @DecimalMin("0.0") @DecimalMax("1.0") @DefaultValue("0.5") double samenessThreshold,
        @DecimalMin("0.0") @DecimalMax("1.0") @DefaultValue("0.25") double samenessFactor,
        @Min(1) @DefaultValue("2") int maxSameProtein,
        @DecimalMin("0.0") @DecimalMax("1.0") @DefaultValue("0.10") double proteinRepeatFactor,
        @NotNull @DefaultValue("23:00") LocalTime generateAt) {

    /** The defaults, for unit tests. */
    public static PlannerProperties defaults() {
        return new PlannerProperties(3, 4, 70, new BigDecimal("0.90"), 0.40, 1.5, 0.70, 0.85,
                3.0, 4.0, 0.5, 0.25, 2, 0.10, LocalTime.of(23, 0));
    }
}