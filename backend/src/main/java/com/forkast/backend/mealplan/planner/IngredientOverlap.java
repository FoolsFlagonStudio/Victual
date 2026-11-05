package com.forkast.backend.mealplan.planner;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Shared ingredients as the plan fills: a recipe that reuses what the plan already buys
 * (the rest of a bunch of cilantro, a carton of cream) costs less in groceries, so it's
 * weighted up. Two guards keep plans from getting samey:
 *
 * - a recipe that's mostly the same ingredients as one already picked is held back hard
 * - past max-same-protein recipes on one protein, more of it is held back
 *
 * Sharing is measured by rarity, ln(recipes / recipes using the ingredient), so onions and
 * garlic (in a third of everything) barely count and cilantro or heavy cream count a lot.
 */
final class IngredientOverlap {

    private final PlannerProperties properties;
    private final Map<UUID, Double> rarity = new HashMap<>();
    private final Set<UUID> planIngredients = new HashSet<>();
    private final Map<UUID, Integer> proteinUses = new HashMap<>();
    private final List<Set<UUID>> picked = new java.util.ArrayList<>();

    IngredientOverlap(List<RecipeOption> recipes, PlannerProperties properties) {
        this.properties = properties;
        Map<UUID, Integer> used = new HashMap<>();
        for (RecipeOption r : recipes) {
            for (UUID i : r.ingredients()) {
                used.merge(i, 1, Integer::sum);
            }
        }
        double n = Math.max(1, recipes.size());
        used.forEach((i, count) -> rarity.put(i, Math.log(n / count)));
    }

    /** The plan now includes this recipe. */
    void add(RecipeOption recipe) {
        planIngredients.addAll(recipe.ingredients());
        recipe.proteins().forEach(p -> proteinUses.merge(p, 1, Integer::sum));
        picked.add(recipe.ingredients());
    }

    /** Multiplies a candidate's weight: above 1 for sharing, below 1 for sameness. */
    double factor(RecipeOption candidate) {
        if (candidate.ingredients().isEmpty()) {
            return 1.0;
        }
        double factor;
        // The same meal again gets no sharing bonus: it shares the most of all, which
        // would otherwise cancel the penalty out.
        if (picked.stream().anyMatch(other -> similarity(candidate.ingredients(), other) >= properties.samenessThreshold())) {
            factor = properties.samenessFactor();
        } else {
            double shared = 0;
            for (UUID i : candidate.ingredients()) {
                if (planIngredients.contains(i)) {
                    shared += rarity.getOrDefault(i, 0.0);
                }
            }
            factor = 1 + properties.overlapBoost() * Math.min(1.0, shared / properties.overlapSaturation());
        }

        for (UUID p : candidate.proteins()) {
            if (proteinUses.getOrDefault(p, 0) >= properties.maxSameProtein()) {
                factor *= properties.proteinRepeatFactor();
                break;
            }
        }
        return factor;
    }

    /** Ingredients in common over ingredients in either (Jaccard). */
    static double similarity(Set<UUID> a, Set<UUID> b) {
        if (a.isEmpty() || b.isEmpty()) {
            return 0;
        }
        int common = 0;
        for (UUID i : a) {
            if (b.contains(i)) {
                common++;
            }
        }
        return (double) common / (a.size() + b.size() - common);
    }
}
