package com.forkast.backend.mealplan.planner;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import com.forkast.backend.ingest.SlotScores;

/**
 * One recipe the generator may use, with everything it needs already worked out
 * by the
 * service. The service passes only recipes that meet the user's dietary
 * restrictions; the
 * generator applies the other hard filters.
 *
 * @param calories       per serving; null when unknown
 * @param costPerServing null when unknown (never chosen)
 * @param fitPenalty     from RecipeFitEvaluator against the user's per-meal
 *                       targets
 * @param lastServed     the user's most recent time eating it, or null
 * @param sideScore      0 to 100; offered as a side at 50 or more
 * @param needsSide      a main that wants a side next to it (MealComposition)
 */
public record RecipeOption(
        UUID id,
        int baseServings,
        SlotScores slots,
        BigDecimal calories,
        int mealPrepScore,
        BigDecimal costPerServing,
        boolean costComplete,
        double fitPenalty,
        boolean favorite,
        LocalDate lastServed,
        int sideScore,
        boolean needsSide) {

    /** Offered as a side at this side score or more. */
    public static final int SIDE_FITS = 50;

    /** Without side information: never a side, never wants one. */
    public RecipeOption(UUID id, int baseServings, SlotScores slots, BigDecimal calories, int mealPrepScore,
            BigDecimal costPerServing, boolean costComplete, double fitPenalty, boolean favorite,
            LocalDate lastServed) {
        this(id, baseServings, slots, calories, mealPrepScore, costPerServing, costComplete, fitPenalty, favorite,
                lastServed, 0, false);
    }

    public boolean isSide() {
        return sideScore >= SIDE_FITS;
    }
}