package com.forkast.backend.ingest;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.forkast.backend.recipe.Recipe;
import com.forkast.backend.recipe.RecipeRepository;

/**
 * Re-runs the slot and side classifiers over every saved recipe, for when their
 * rules change.
 * Cheap: name, category and keywords only, no ingredient parsing or pricing.
 */
@Service
public class RecipeRescoreService {

    /** How many recipes changed and how many were checked. */
    public record Result(int checked, int changed) {
    }

    private final RecipeRepository recipeRepository;
    private final RecipeEnricher enricher;

    public RecipeRescoreService(RecipeRepository recipeRepository, RecipeEnricher enricher) {
        this.recipeRepository = recipeRepository;
        this.enricher = enricher;
    }

    @Transactional
    public Result rescoreAll() {
        List<Recipe> recipes = recipeRepository.findAll();
        int changed = 0;
        for (Recipe recipe : recipes) {
            String before = scores(recipe);
            enricher.classify(recipe);
            if (!before.equals(scores(recipe))) {
                changed++;
            }
        }
        return new Result(recipes.size(), changed);
    }

    private static String scores(Recipe r) {
        return r.getBreakfastScore() + "/" + r.getLunchScore() + "/" + r.getDinnerScore() + "/" + r.getSideScore();
    }
}
