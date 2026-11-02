package com.forkast.backend.recipe.search;

import java.math.BigDecimal;
import java.util.Set;

import com.forkast.backend.diet.DietaryLabel;
import com.forkast.backend.mealplan.MealSlot;

/**
 * Everything that narrows a recipe search. Any field may be null (or empty) to
 * mean "no filter".
 * requiredLabels is the user's restrictions plus any labels asked for in the
 * request. slots / sides: keep recipes that fit any of these slots (score 50+), or
 * work as a side; both empty = no filter.
 */
public record RecipeSearchCriteria(
                String text,
                Set<DietaryLabel> requiredLabels,
                BigDecimal minProtein,
                BigDecimal maxCalories,
                Integer maxTotalMinutes,
                BigDecimal maxCostPerServing,
                Set<MealSlot> slots,
                boolean sides) {

        /** Without a meal filter. */
        public RecipeSearchCriteria(String text, Set<DietaryLabel> requiredLabels, BigDecimal minProtein,
                        BigDecimal maxCalories, Integer maxTotalMinutes, BigDecimal maxCostPerServing) {
                this(text, requiredLabels, minProtein, maxCalories, maxTotalMinutes, maxCostPerServing, Set.of(), false);
        }
}