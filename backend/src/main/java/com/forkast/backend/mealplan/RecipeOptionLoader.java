package com.forkast.backend.mealplan;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Component;

import com.forkast.backend.favorite.FavoriteRepository;
import com.forkast.backend.history.RecipeHistoryRepository;
import com.forkast.backend.ingest.SlotScores;
import com.forkast.backend.mealplan.planner.MealComposition;
import com.forkast.backend.mealplan.planner.RecipeOption;
import com.forkast.backend.recipe.Recipe;
import com.forkast.backend.recipe.RecipeRepository;
import com.forkast.backend.recipe.fit.FitTargets;
import com.forkast.backend.recipe.fit.RecipeFitEvaluator;
import com.forkast.backend.recipe.fit.RecipeNutrition;
import com.forkast.backend.recipe.search.RecipeSpecifications;
import com.forkast.backend.user.UserPreferences;

/**
 * Turns the recipe table into the generator's input for one user and week. The
 * database does
 * the filters it can (dietary restrictions, a known cost); this adds what's per
 * user: the fit
 * penalty against their targets, favorites, and when they last had each recipe.
 *
 * Recipes come back sorted by name then id, so the same seed always draws the
 * same plan.
 */
@Component
public class RecipeOptionLoader {

    /**
     * The options, the entities behind them for saving the picks, and a way to make
     * an option
     * from any recipe: a kept recipe (locked, or already started) needn't be in the
     * options.
     */
    public record Loaded(List<RecipeOption> options, Map<UUID, Recipe> recipes,
            Function<Recipe, RecipeOption> optionOf) {
    }

    private final RecipeRepository recipeRepository;
    private final FavoriteRepository favoriteRepository;
    private final MealPlanRepository planRepository;
    private final RecipeHistoryRepository historyRepository;
    private final RecipeFitEvaluator fitEvaluator;

    public RecipeOptionLoader(RecipeRepository recipeRepository, FavoriteRepository favoriteRepository,
            MealPlanRepository planRepository, RecipeHistoryRepository historyRepository,
            RecipeFitEvaluator fitEvaluator) {
        this.recipeRepository = recipeRepository;
        this.favoriteRepository = favoriteRepository;
        this.planRepository = planRepository;
        this.historyRepository = historyRepository;
        this.fitEvaluator = fitEvaluator;
    }

    public Loaded load(UUID userId, UserPreferences preferences, LocalDate weekStart, ZoneId zone) {
        Specification<Recipe> spec = RecipeSpecifications.hasAllLabels(preferences.getDietaryRestrictions())
                .and((root, query, cb) -> cb.isNotNull(root.get("costPerServing")));
        List<Recipe> recipes = recipeRepository.findAll(spec, Sort.by("name", "id"));

        FitTargets targets = FitTargets.from(preferences);
        Set<UUID> favorites = new HashSet<>(favoriteRepository.findRecipeIdsNewestFirst(userId));
        Map<UUID, LocalDate> lastServed = lastServed(userId, weekStart, zone);

        Function<Recipe, RecipeOption> optionOf = r -> new RecipeOption(
                r.getId(),
                r.getBaseServings(),
                new SlotScores(r.getBreakfastScore(), r.getLunchScore(), r.getDinnerScore()),
                r.getCaloriesPerServing(),
                r.getMealPrepScore(),
                r.getCostPerServing(),
                r.isCostComplete(),
                fitEvaluator.evaluate(RecipeNutrition.of(r), targets).penalty(),
                favorites.contains(r.getId()),
                lastServed.get(r.getId()),
                r.getSideScore(),
                MealComposition.needsSide(r.getName(), r.getCarbsGPerServing()));

        Map<UUID, Recipe> byId = new LinkedHashMap<>();
        List<RecipeOption> options = new ArrayList<>();
        for (Recipe r : recipes) {
            byId.put(r.getId(), r);
            options.add(optionOf.apply(r));
        }
        return new Loaded(options, byId, optionOf);
    }

    /**
     * When the user last had each recipe: the later of its newest recipe_history
     * row and its
     * newest cook date in an earlier plan. History is only written once a week
     * ends, so the
     * plans cover last week and this one.
     */
    private Map<UUID, LocalDate> lastServed(UUID userId, LocalDate weekStart, ZoneId zone) {
        Map<UUID, LocalDate> last = new HashMap<>();
        historyRepository.findLastServed(userId).forEach(h -> last.merge(h.recipeId(),
                LocalDate.ofInstant(h.servedAt(), zone), (a, b) -> a.isAfter(b) ? a : b));
        planRepository.findLastPlannedDates(userId, weekStart).forEach(p -> last.merge(p.recipeId(), p.date(),
                (a, b) -> a.isAfter(b) ? a : b));
        return last;
    }
}