package com.forkast.backend.ingest;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.forkast.backend.diet.DietaryLabel;
import com.forkast.backend.diet.DietaryLabelRepository;
import com.forkast.backend.ingredient.Ingredient;
import com.forkast.backend.pricing.CurrentPriceService;
import com.forkast.backend.pricing.RecipeCost;
import com.forkast.backend.pricing.RecipeCostCalculator;
import com.forkast.backend.pricing.ResolvedPrice;
import com.forkast.backend.recipe.Recipe;
import com.forkast.backend.recipe.RecipeIngredient;
import com.forkast.backend.recipe.RecipeStep;

/**
 * Computes everything derived from a recipe's lines: nutrition, dietary labels,
 * slot scores
 * and the
 * meal-prep score. Used on ingest, and again whenever a reviewed line changes
 * (step 10).
 */
@Component
public class RecipeEnricher {

    private final NutritionCalculator nutritionCalculator;
    private final DietaryLabelClassifier dietaryLabelClassifier;
    private final MealPrepClassifier mealPrepClassifier;
    private final SlotClassifier slotClassifier;
    private final DietaryLabelRepository dietaryLabelRepository;
    private final RecipeCostCalculator costCalculator;
    private final CurrentPriceService currentPriceService;

    public RecipeEnricher(NutritionCalculator nutritionCalculator,
            DietaryLabelClassifier dietaryLabelClassifier,
            MealPrepClassifier mealPrepClassifier,
            SlotClassifier slotClassifier,
            DietaryLabelRepository dietaryLabelRepository,
            RecipeCostCalculator costCalculator,
            CurrentPriceService currentPriceService) {
        this.nutritionCalculator = nutritionCalculator;
        this.dietaryLabelClassifier = dietaryLabelClassifier;
        this.mealPrepClassifier = mealPrepClassifier;
        this.slotClassifier = slotClassifier;
        this.dietaryLabelRepository = dietaryLabelRepository;
        this.costCalculator = costCalculator;
        this.currentPriceService = currentPriceService;
    }

    public void enrich(Recipe recipe) {
        List<RecipeLine> lines = recipe.getIngredients().stream()
                .map(RecipeEnricher::toLine)
                .toList();

        NutritionResult nutrition = nutritionCalculator.calculate(lines, recipe.getBaseServings());
        recipe.setNutrition(
                nutrition.caloriesPerServing(),
                nutrition.proteinGPerServing(),
                nutrition.carbsGPerServing(),
                nutrition.fatGPerServing(),
                nutrition.complete());

        replaceLabels(recipe, dietaryLabelClassifier.classify(lines, nutrition));

        recipe.setMealPrepScore(mealPrepClassifier.score(new MealPrepInput(
                recipe.getName(),
                recipe.getCategory(),
                recipe.getKeywords(),
                recipe.getSteps().stream().map(RecipeStep::getInstructionText).toList(),
                recipe.getBaseServings(),
                recipe.getIngredients().stream().map(RecipeEnricher::displayName).toList())));

        classify(recipe);

        costFromCurrentPrices(recipe, lines);
    }

    /**
     * Slot and side scores from the name, category and keywords alone. Also run on
     * its own (POST /api/admin/recipes/rescore) when the classifier's rules change.
     */
    public void classify(Recipe recipe) {
        SlotScores slots = slotClassifier.score(recipe.getName(), recipe.getCategory(), recipe.getKeywords());
        recipe.setSlotScores(slots.breakfast(), slots.lunch(), slots.dinner());
        recipe.setSideScore(slotClassifier.sideScore(recipe.getName(), recipe.getCategory(), recipe.getKeywords()));
    }

    /**
     * Just the cost, for when prices change but the recipe didn't (the pass after a
     * price
     * refresh). Cheaper than enrich: no labels, no meal-prep score.
     */
    public void updateCost(Recipe recipe) {
        costFromCurrentPrices(recipe, recipe.getIngredients().stream().map(RecipeEnricher::toLine).toList());
    }

    /**
     * The same, with prices already resolved: the pass over every recipe resolves
     * each
     * ingredient's price once instead of once per recipe.
     */
    public void updateCost(Recipe recipe, Map<UUID, ResolvedPrice> prices) {
        applyCost(recipe, recipe.getIngredients().stream().map(RecipeEnricher::toLine).toList(), prices);
    }

    private void costFromCurrentPrices(Recipe recipe, List<RecipeLine> lines) {
        List<UUID> ingredientIds = lines.stream()
                .map(RecipeLine::ingredient)
                .filter(Objects::nonNull)
                .map(Ingredient::getId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        applyCost(recipe, lines, currentPriceService.currentPrices(ingredientIds));
    }

    private void applyCost(Recipe recipe, List<RecipeLine> lines, Map<UUID, ResolvedPrice> prices) {
        RecipeCost cost = costCalculator.calculate(lines, recipe.getBaseServings(),
                ingredient -> Optional.ofNullable(prices.get(ingredient.getId())));
        recipe.setCost(cost.costPerServing(), cost.complete());
    }

    // ---------- helpers ----------

    private void replaceLabels(Recipe recipe, Set<String> labelNames) {
        for (DietaryLabel label : List.copyOf(recipe.getDietaryLabels())) {
            recipe.removeDietaryLabel(label);
        }
        dietaryLabelRepository.findAll().stream()
                .filter(label -> labelNames.contains(label.getName()))
                .forEach(recipe::addDietaryLabel);
    }

    static RecipeLine toLine(RecipeIngredient line) { // package-private: CatalogReportService reads lines the same way
        return new RecipeLine(
                line.getIngredient(),
                line.getAmount(),
                toUnit(line.getUnit()),
                line.getPrepNote(),
                line.isOptional());
    }

    /**
     * Units are stored as the enum name in lowercase ("cup", "fl_oz", "to_taste").
     */
    private static Unit toUnit(String stored) {
        try {
            return Unit.valueOf(stored.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            return null;
        }
    }

    private static String displayName(RecipeIngredient line) {
        return line.getIngredient() != null ? line.getIngredient().getName() : line.getParsedName();
    }
}