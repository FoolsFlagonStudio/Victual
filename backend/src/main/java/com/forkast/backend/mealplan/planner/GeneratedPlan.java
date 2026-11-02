package com.forkast.backend.mealplan.planner;

import java.math.BigDecimal;
import java.util.List;

import com.forkast.backend.mealplan.MealSlot;

/**
 * What the generator chose. picks cover the runs it could fill; openMeals
 * counts slot-days
 * nothing covers (from the layout, or runs with no recipe left to choose).
 * usageCost is what
 * the chosen meals use; fitsBudget is false when even the cheapest swaps
 * couldn't bring it
 * under the budget margin.
 */
public record GeneratedPlan(
        List<Pick> picks,
        int openMeals,
        List<Shortfall> shortfalls,
        BigDecimal usageCost,
        boolean fitsBudget) {

    public GeneratedPlan {
        picks = List.copyOf(picks);
        shortfalls = List.copyOf(shortfalls);
    }

    /**
     * One filled run. portionMultiplier = servings / the recipe's base servings.
     * side: a recipe cooked alongside for the same servings, or null.
     */
    public record Pick(SlotRun run, RecipeOption recipe, int servings, BigDecimal portionMultiplier,
            BigDecimal cost, boolean locked, Side side) {

        public Pick(SlotRun run, RecipeOption recipe, int servings, BigDecimal portionMultiplier, BigDecimal cost,
                boolean locked) {
            this(run, recipe, servings, portionMultiplier, cost, locked, null);
        }

        public Pick withSide(Side side) {
            return new Pick(run, recipe, servings, portionMultiplier, cost, locked, side);
        }

        /** The main plus its side. */
        public BigDecimal totalCost() {
            return side == null ? cost : cost.add(side.cost());
        }
    }

    /** A side for a pick: the recipe, scaled to the pick's servings, and its cost. */
    public record Side(RecipeOption recipe, BigDecimal portionMultiplier, BigDecimal cost) {
    }

    /** A run left empty, and why. */
    public record Shortfall(MealSlot slot, int position, int meals, String reason) {
    }
}