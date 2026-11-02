package com.forkast.backend.mealplan.grocery;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.forkast.backend.common.exception.ApiException;
import com.forkast.backend.ingest.RecipeLine;
import com.forkast.backend.ingest.Unit;
import com.forkast.backend.ingest.UnitConverter;
import com.forkast.backend.mealplan.GroceryListItem;
import com.forkast.backend.mealplan.MealPlan;
import com.forkast.backend.mealplan.MealPlanRepository;
import com.forkast.backend.mealplan.PlanSelection;
import com.forkast.backend.recipe.Recipe;
import com.forkast.backend.recipe.RecipeIngredient;

/**
 * Builds, reads and updates a plan's grocery list.
 *
 * rebuild() updates the list in place: lines that are still needed keep their
 * id, purchased
 * and needToBuy (matched on ingredient and unit), new ones are added and
 * unneeded ones
 * removed. Then the plan's grocery cost and over-budget flag are recalculated.
 */
@Service
public class GroceryListService {

    private final MealPlanRepository planRepository;
    private final GroceryListItemRepository itemRepository;
    private final GroceryPriceLoader priceLoader;
    private final GroceryListBuilder builder;

    public GroceryListService(MealPlanRepository planRepository, GroceryListItemRepository itemRepository,
            GroceryPriceLoader priceLoader, UnitConverter unitConverter) {
        this.planRepository = planRepository;
        this.itemRepository = itemRepository;
        this.priceLoader = priceLoader;
        this.builder = new GroceryListBuilder(unitConverter);
    }

    // ---------- build ----------

    /**
     * Brings the list in line with the plan's selections. Works on unsaved plans
     * too.
     */
    @Transactional
    public void rebuild(MealPlan plan) {
        List<RecipeLine> lines = scaledLines(plan);
        Set<UUID> ingredientIds = new HashSet<>();
        lines.stream().map(RecipeLine::ingredient).filter(Objects::nonNull).forEach(i -> ingredientIds.add(i.getId()));
        List<GroceryListBuilder.Line> built = builder.build(lines, priceLoader.load(ingredientIds));

        Map<String, GroceryListItem> existing = new HashMap<>();
        plan.getGroceryItems().forEach(item -> existing.put(key(item.getIngredient().getId(), item.getUnit()), item));

        BigDecimal groceryCost = BigDecimal.ZERO;
        for (GroceryListBuilder.Line line : built) {
            GroceryListItem item = existing.remove(key(line.ingredient().getId(), line.unit()));
            if (item == null) {
                item = new GroceryListItem(line.ingredient(), line.amount(), line.unit());
                plan.addGroceryItem(item);
            } else {
                item.updateAmount(line.amount());
            }
            item.setPantry(line.pantry());
            if (line.pkg() == null) {
                item.setPackage(null, null, null);
            } else {
                item.setPackage(line.packageCount(), line.pkg().label(), line.pkg().price());
            }
            BigDecimal cost = line.cost(item.isNeedToBuy());
            item.setEstimatedCost(cost);
            if (cost != null) {
                groceryCost = groceryCost.add(cost);
            }
        }
        existing.values().forEach(plan::removeGroceryItem);

        plan.setCosts(plan.getUsageCost(), built.isEmpty() ? null : groceryCost, plan.getOpenMeals());
    }

    /** Each selection's lines (and its side's), scaled by their portion multipliers. */
    static List<RecipeLine> scaledLines(MealPlan plan) {
        List<RecipeLine> lines = new ArrayList<>();
        for (PlanSelection selection : plan.getSelections()) {
            addScaled(lines, selection.getRecipe(), selection.getPortionMultiplier());
            if (selection.getSideRecipe() != null && selection.getSidePortionMultiplier() != null) {
                addScaled(lines, selection.getSideRecipe(), selection.getSidePortionMultiplier());
            }
        }
        return lines;
    }

    private static void addScaled(List<RecipeLine> lines, Recipe recipe, BigDecimal multiplier) {
        for (RecipeIngredient ri : recipe.getIngredients()) {
            BigDecimal amount = ri.getAmount() == null ? null : ri.getAmount().multiply(multiplier);
            lines.add(new RecipeLine(ri.getIngredient(), amount, unitOf(ri.getUnit()), ri.getPrepNote(),
                    ri.isOptional()));
        }
    }

    /**
     * Required lines with an amount that no ingredient is matched to yet, so they
     * can't be listed.
     */
    static int unlisted(MealPlan plan) {
        int count = 0;
        List<Recipe> recipes = new ArrayList<>();
        for (PlanSelection selection : plan.getSelections()) {
            recipes.add(selection.getRecipe());
            if (selection.getSideRecipe() != null) {
                recipes.add(selection.getSideRecipe());
            }
        }
        for (Recipe recipe : recipes) {
            for (RecipeIngredient ri : recipe.getIngredients()) {
                RecipeLine line = new RecipeLine(ri.getIngredient(), ri.getAmount(), unitOf(ri.getUnit()),
                        ri.getPrepNote(), ri.isOptional());
                if (line.countsTowardNutrition() && line.ingredient() == null) {
                    count++;
                }
            }
        }
        return count;
    }

    /** Units are stored as the enum name in lowercase ("cup", "to_taste"). */
    private static Unit unitOf(String stored) {
        try {
            return stored == null ? null : Unit.valueOf(stored.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String key(UUID ingredientId, String unit) {
        return ingredientId + ":" + unit;
    }

    // ---------- read and update ----------

    /**
     * The plan's list, built on first read for plans made before grocery lists
     * existed.
     * Not read-only for that reason.
     */
    @Transactional
    public GroceryListResponse list(UUID userId, UUID planId) {
        MealPlan plan = planRepository.findByIdAndUserId(planId, userId)
                .orElseThrow(() -> ApiException.notFound("Meal plan not found."));
        if (plan.getGroceryItems().isEmpty() && plan.getGroceryCost() == null && !plan.getSelections().isEmpty()) {
            rebuild(plan);
            planRepository.flush(); // so new lines have their ids in the response
        }
        return GroceryListResponse.from(plan, unlisted(plan));
    }

    /**
     * Ticks a line off, or marks a pantry staple as needed. needToBuy changes what
     * the line
     * costs, so the list's costs are recalculated.
     */
    @Transactional
    public void update(UUID userId, UUID itemId, UpdateGroceryItemRequest request) {
        GroceryListItem item = itemRepository.findByIdAndMealPlanUserId(itemId, userId)
                .orElseThrow(() -> ApiException.notFound("Grocery list item not found."));
        if (request.purchased() != null) {
            if (request.purchased()) {
                item.markPurchased();
            } else {
                item.markUnpurchased();
            }
        }
        if (request.needToBuy() != null && request.needToBuy() != item.isNeedToBuy()) {
            if (!item.isPantry()) {
                throw ApiException.badRequest("Only pantry staples can be marked need to buy.");
            }
            item.setNeedToBuy(request.needToBuy());
            rebuild(item.getMealPlan());
        }
    }
}