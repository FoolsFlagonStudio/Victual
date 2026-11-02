package com.forkast.backend.ingest;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.forkast.backend.ingredient.Ingredient;
import com.forkast.backend.pricing.CurrentPriceService;
import com.forkast.backend.pricing.RecipeCostCalculator;
import com.forkast.backend.pricing.ResolvedPrice;
import com.forkast.backend.recipe.Recipe;
import com.forkast.backend.recipe.RecipeIngredient;
import com.forkast.backend.recipe.RecipeRepository;

/**
 * Why recipes have no complete cost, grouped so the biggest fixes come first. Every
 * required line that the cost calculator can't price is a gap, for one of three
 * reasons:
 *
 * - UNMATCHED: no ingredient matched the line ("1 cup paccheri"), keyed by its
 * parsed name. Fix with an alias, a new catalog row, or the review queue.
 * - NO_PRICE: the ingredient has no current price. Fix with a Kroger product, a
 * BLS series or a seed price.
 * - NO_CONVERSION: there's a price, but not one that fits the line's unit (a price
 * per 100 g and "1 bunch" with no gram weight for a bunch; a price per item and a
 * cup). Fix with a portion weight or a per-item price.
 *
 * For each gap, recipes = how many recipes have it, and completes = how many it is
 * the only gap in, i.e. how many recipes fixing just that would make complete.
 * Read-only; the same rules as RecipeCostCalculator.
 */
@Service
public class CatalogReportService {

    public enum Reason {
        UNMATCHED, NO_PRICE, NO_CONVERSION
    }

    /** One gap and its reach. ingredientId is null for UNMATCHED; unit only for NO_CONVERSION. */
    public record Gap(Reason reason, String name, UUID ingredientId, String unit, boolean pantry, int lines,
            int recipes, int completes, String example) {
    }

    public record Report(int recipes, int complete, int incomplete, int gapLines, List<Gap> gaps) {
    }

    private record Key(Reason reason, String name, String unit) {
    }

    private final RecipeRepository recipeRepository;
    private final CurrentPriceService currentPriceService;
    private final UnitConverter unitConverter;

    public CatalogReportService(RecipeRepository recipeRepository, CurrentPriceService currentPriceService,
            UnitConverter unitConverter) {
        this.recipeRepository = recipeRepository;
        this.currentPriceService = currentPriceService;
        this.unitConverter = unitConverter;
    }

    @Transactional(readOnly = true)
    public Report report() {
        Map<UUID, ResolvedPrice> prices = currentPriceService.allCurrentPrices();
        List<Recipe> recipes = recipeRepository.findAllWithIngredients();

        Map<Key, Integer> lines = new HashMap<>();
        Map<Key, Set<UUID>> recipesWith = new HashMap<>();
        Map<Key, Integer> completes = new HashMap<>();
        Map<Key, String> examples = new HashMap<>();
        Map<Key, Ingredient> ingredients = new HashMap<>();
        int complete = 0;
        int gapLines = 0;

        for (Recipe recipe : recipes) {
            Set<Key> gapsHere = new HashSet<>();
            for (RecipeIngredient row : recipe.getIngredients()) {
                RecipeLine line = RecipeEnricher.toLine(row);
                Optional<Key> gap = gapOf(line, row, prices);
                if (gap.isEmpty()) {
                    continue;
                }
                Key key = gap.get();
                gapsHere.add(key);
                gapLines++;
                lines.merge(key, 1, Integer::sum);
                recipesWith.computeIfAbsent(key, k -> new HashSet<>()).add(recipe.getId());
                examples.putIfAbsent(key, row.getRawText());
                if (line.ingredient() != null) {
                    ingredients.putIfAbsent(key, line.ingredient());
                }
            }
            if (gapsHere.isEmpty()) {
                complete++;
            } else if (gapsHere.size() == 1) {
                completes.merge(gapsHere.iterator().next(), 1, Integer::sum);
            }
        }

        List<Gap> gaps = new ArrayList<>();
        for (Key key : lines.keySet()) {
            Ingredient ingredient = ingredients.get(key);
            gaps.add(new Gap(key.reason(), key.name(), ingredient == null ? null : ingredient.getId(), key.unit(),
                    ingredient != null && ingredient.isPantryStaple(), lines.get(key), recipesWith.get(key).size(),
                    completes.getOrDefault(key, 0), examples.get(key)));
        }
        gaps.sort(Comparator.comparingInt(Gap::completes).reversed()
                .thenComparing(Comparator.comparingInt(Gap::recipes).reversed())
                .thenComparing(Gap::name));
        return new Report(recipes.size(), complete, recipes.size() - complete, gapLines, gaps);
    }

    /** Why the cost calculator can't price this line, or empty when it can (or needn't). */
    private Optional<Key> gapOf(RecipeLine line, RecipeIngredient row, Map<UUID, ResolvedPrice> prices) {
        if (!line.countsTowardNutrition() || RecipeCostCalculator.isFree(line.ingredient())) {
            return Optional.empty();
        }
        Ingredient ingredient = line.ingredient();
        if (ingredient == null) {
            String name = row.getParsedName() != null && !row.getParsedName().isBlank() ? row.getParsedName()
                    : row.getRawText();
            return Optional.of(new Key(Reason.UNMATCHED, name.trim().toLowerCase(Locale.ROOT), null));
        }
        ResolvedPrice price = prices.get(ingredient.getId());
        if (price == null) {
            return Optional.of(new Key(Reason.NO_PRICE, ingredient.getName(), null));
        }
        if (price.per100g() != null
                && unitConverter.toGrams(line.amount(), line.unit(), line.prepNote(), ingredient).isPresent()) {
            return Optional.empty();
        }
        if (price.perItem() != null && line.unit() == Unit.COUNT) {
            return Optional.empty();
        }
        return Optional.of(new Key(Reason.NO_CONVERSION, ingredient.getName(), row.getUnit()));
    }
}
