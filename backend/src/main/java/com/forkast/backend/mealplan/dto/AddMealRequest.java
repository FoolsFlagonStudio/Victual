package com.forkast.backend.mealplan.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.forkast.backend.mealplan.MealSlot;

import jakarta.validation.constraints.NotNull;

/** Put recipeId on one date and slot (POST /api/meal-plans/meals). */
public record AddMealRequest(@NotNull LocalDate date, @NotNull MealSlot slot, @NotNull UUID recipeId) {
}
