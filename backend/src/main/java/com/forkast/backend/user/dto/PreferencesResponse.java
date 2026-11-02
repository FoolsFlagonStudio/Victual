package com.forkast.backend.user.dto;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

import com.forkast.backend.diet.DietaryLabel;
import com.forkast.backend.diet.DietaryLabelResponse;
import com.forkast.backend.mealplan.MealSlot;
import com.forkast.backend.user.UserPreferences;

public record PreferencesResponse(
                BigDecimal weeklyBudget,
                Integer householdServingSize,
                Integer maxCaloriesPerMeal,
                Integer maxCaloriesPerDay,
                Integer proteinTargetGrams,
                Integer carbsTargetGrams,
                Integer fatTargetGrams,
                Integer repeatAvoidanceDays,
                DayOfWeek planStartDay,
                boolean prefersMealPrep,
                boolean leftoversForLunch,
                boolean autoPlanEnabled,
                DayOfWeek autoPlanDay,
                List<DietaryLabelResponse> dietaryRestrictions,
                Map<MealSlot, Integer> mealSlots,
                Instant updatedAt) {
        public static PreferencesResponse from(UserPreferences preferences) {
                List<DietaryLabelResponse> restrictions = preferences.getDietaryRestrictions().stream()
                                .sorted(Comparator.comparing(DietaryLabel::getName))
                                .map(DietaryLabelResponse::from)
                                .toList();

                return new PreferencesResponse(
                                preferences.getWeeklyBudget(),
                                preferences.getHouseholdServingSize(),
                                preferences.getMaxCaloriesPerMeal(),
                                preferences.getMaxCaloriesPerDay(),
                                preferences.getProteinTargetGrams(),
                                preferences.getCarbsTargetGrams(),
                                preferences.getFatTargetGrams(),
                                preferences.getRepeatAvoidanceDays(),
                                preferences.getPlanStartDay(),
                                preferences.isPrefersMealPrep(),
                                preferences.isLeftoversForLunch(),
                                preferences.isAutoPlanEnabled(),
                                preferences.getEffectiveAutoPlanDay(),
                                restrictions,
                                Map.copyOf(preferences.getMealSlots()),
                                preferences.getUpdatedAt());
        }
}