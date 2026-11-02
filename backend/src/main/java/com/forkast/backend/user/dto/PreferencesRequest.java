package com.forkast.backend.user.dto;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.forkast.backend.mealplan.MealSlot;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

public record PreferencesRequest(
                @NotNull @DecimalMin("1.00") @Digits(integer = 8, fraction = 2) BigDecimal weeklyBudget,
                @NotNull @Min(1) @Max(20) Integer householdServingSize,
                @Positive Integer maxCaloriesPerMeal,
                @Positive Integer maxCaloriesPerDay,
                @PositiveOrZero Integer proteinTargetGrams,
                @PositiveOrZero Integer carbsTargetGrams,
                @PositiveOrZero Integer fatTargetGrams,
                @NotNull @Min(0) @Max(60) Integer repeatAvoidanceDays,
                @NotNull DayOfWeek planStartDay,
                Boolean prefersMealPrep,
                Boolean leftoversForLunch,
                Boolean autoPlanEnabled,
                DayOfWeek autoPlanDay,
                Set<UUID> dietaryLabelIds,
                @NotEmpty Map<MealSlot, @NotNull @Min(1) @Max(7) Integer> mealSlots) {

}