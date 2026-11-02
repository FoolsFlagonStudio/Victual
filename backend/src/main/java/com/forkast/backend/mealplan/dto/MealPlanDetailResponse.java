package com.forkast.backend.mealplan.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.forkast.backend.mealplan.MealPlan;
import com.forkast.backend.mealplan.MealSlot;
import com.forkast.backend.mealplan.PlanSelection;
import com.forkast.backend.mealplan.PlanSource;
import com.forkast.backend.mealplan.PlanWeeks;
import com.forkast.backend.mealplan.PlannedMeal;
import com.forkast.backend.recipe.Recipe;

/**
 * A whole plan. selections are the recipe choices (what lock and swap act on);
 * days is the
 * calendar, one entry per date with each slot's meal; open lists the meals
 * nothing covers.
 * groceryCost is null until the grocery list is built.
 */
public record MealPlanDetailResponse(
                UUID id,
                LocalDate weekStart,
                LocalDate weekEnd,
                PlanSource source,
                BigDecimal budget,
                BigDecimal usageCost,
                BigDecimal groceryCost,
                boolean overBudget,
                int openMeals,
                Instant generatedAt,
                List<Selection> selections,
                List<Day> days,
                List<PlanWeeks.DaySlot> open) {

        /**
         * The recipe as shown in a plan: enough for a card, without the fit flags of
         * search.
         */
        public record PlanRecipe(UUID id, String name, String imageUrl, Integer totalMinutes,
                        BigDecimal caloriesPerServing, BigDecimal costPerServing, int mealPrepScore) {

                public static PlanRecipe from(Recipe recipe) {
                        return new PlanRecipe(recipe.getId(), recipe.getName(), recipe.getImageUrl(),
                                        recipe.getTotalTimeMinutes(), recipe.getCaloriesPerServing(),
                                        recipe.getCostPerServing(),
                                        recipe.getMealPrepScore());
                }
        }

        /**
         * estimatedCost is the main's; side and sideEstimatedCost are null when the
         * main is a whole meal. sideChosen: the user picked the side, so it stays when
         * the main changes.
         */
        public record Selection(UUID id, MealSlot slot, int position, LocalDate startDate, int daysCovered,
                        LocalDate lastMealDate, int servings, BigDecimal portionMultiplier, BigDecimal estimatedCost,
                        boolean locked, PlanRecipe recipe, PlanRecipe side, BigDecimal sidePortionMultiplier,
                        BigDecimal sideEstimatedCost, boolean sideChosen) {

                static Selection from(PlanSelection s) {
                        return new Selection(s.getId(), s.getMealSlot(), s.getPosition(), s.getStartDate(),
                                        s.getDaysCovered(),
                                        s.getLastMealDate(), s.getServings(), s.getPortionMultiplier(),
                                        s.getEstimatedCost(),
                                        s.isLocked(), PlanRecipe.from(s.getRecipe()),
                                        s.getSideRecipe() == null ? null : PlanRecipe.from(s.getSideRecipe()),
                                        s.getSidePortionMultiplier(), s.getSideEstimatedCost(), s.isSideChosen());
                }
        }

        public record Day(LocalDate date, List<Meal> meals) {
        }

        /** leftover = true: eaten from an earlier cook of the same selection. */
        public record Meal(MealSlot slot, UUID selectionId, UUID recipeId, String recipeName, String imageUrl,
                        boolean leftover, UUID sideRecipeId, String sideRecipeName) {

                static Meal from(PlannedMeal m) {
                        Recipe recipe = m.getRecipe();
                        Recipe side = m.getSelection().getSideRecipe();
                        return new Meal(m.getMealSlot(), m.getSelection().getId(), recipe.getId(), recipe.getName(),
                                        recipe.getImageUrl(), m.isLeftover(), side == null ? null : side.getId(),
                                        side == null ? null : side.getName());
                }
        }

        /**
         * @param slots the slots the user plans now; open meals are counted across
         *              these and the
         *              slots the plan already has
         */
        public static MealPlanDetailResponse from(MealPlan plan, Collection<MealSlot> slots) {
                List<PlannedMeal> meals = plan.getPlannedMeals();

                List<Day> days = plan.getWeekStartDate().datesUntil(plan.getWeekEndDate().plusDays(1))
                                .map(date -> new Day(date, meals.stream()
                                                .filter(m -> m.getMealDate().equals(date))
                                                .map(Meal::from)
                                                .toList()))
                                .toList();

                Set<MealSlot> planned = EnumSet.noneOf(MealSlot.class);
                planned.addAll(slots);
                plan.getSelections().forEach(s -> planned.add(s.getMealSlot()));
                List<PlanWeeks.DaySlot> open = PlanWeeks.openMeals(plan.getWeekStartDate(), planned,
                                meals.stream().map(m -> new PlanWeeks.DaySlot(m.getMealDate(), m.getMealSlot()))
                                                .toList());

                return new MealPlanDetailResponse(plan.getId(), plan.getWeekStartDate(), plan.getWeekEndDate(),
                                plan.getSource(), plan.getBudgetTarget(), plan.getUsageCost(), plan.getGroceryCost(),
                                plan.isOverBudget(), plan.getOpenMeals(), plan.getGeneratedAt(),
                                plan.getSelections().stream().map(Selection::from).toList(), days, open);
        }
}