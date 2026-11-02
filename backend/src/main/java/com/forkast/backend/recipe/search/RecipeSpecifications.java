package com.forkast.backend.recipe.search;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.data.jpa.domain.Specification;

import com.forkast.backend.diet.DietaryLabel;
import com.forkast.backend.ingest.SlotScores;
import com.forkast.backend.mealplan.MealSlot;
import com.forkast.backend.recipe.Recipe;

import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;

/**
 * Builds the WHERE clause for a recipe search, one condition per filter that's
 * present.
 *
 * A Specification is one condition written against the JPA Criteria API: (root,
 * query, cb)
 * gives the recipe being queried, the query, and a builder for predicates.
 * Spring Data
 * combines them, so there's no repository method per combination of filters.
 */
public final class RecipeSpecifications {

    private RecipeSpecifications() {
    }

    public static Specification<Recipe> matching(RecipeSearchCriteria criteria) {
        List<Specification<Recipe>> conditions = new ArrayList<>();

        conditions.add(hasAllLabels(criteria.requiredLabels()));
        if (criteria.text() != null && !criteria.text().isBlank()) {
            conditions.add(nameContains(criteria.text()));
        }
        if (criteria.minProtein() != null) {
            conditions.add(proteinAtLeast(criteria.minProtein()));
        }
        if (criteria.maxCalories() != null) {
            conditions.add(caloriesAtMost(criteria.maxCalories()));
        }
        if (criteria.maxTotalMinutes() != null) {
            conditions.add(totalTimeAtMost(criteria.maxTotalMinutes()));
        }
        if (criteria.maxCostPerServing() != null) {
            conditions.add(costAtMost(criteria.maxCostPerServing()));
        }
        if ((criteria.slots() != null && !criteria.slots().isEmpty()) || criteria.sides()) {
            conditions.add(fitsAnyMeal(criteria.slots() == null ? Set.of() : criteria.slots(), criteria.sides()));
        }
        return Specification.allOf(conditions);
    }

    /** A side score of this or more: works next to a main (as in the planner). */
    static final int SIDE_FITS = 50;

    /** Fits at least one of these slots (score 50+), or is a side when sides is true. */
    public static Specification<Recipe> fitsAnyMeal(Set<MealSlot> slots, boolean sides) {
        return (root, query, cb) -> {
            List<Predicate> any = new ArrayList<>();
            for (MealSlot slot : slots) {
                String field = switch (slot) {
                    case BREAKFAST -> "breakfastScore";
                    case LUNCH -> "lunchScore";
                    case DINNER -> "dinnerScore";
                };
                any.add(cb.ge(root.<Integer>get(field), SlotScores.FITS));
            }
            if (sides) {
                any.add(cb.ge(root.<Integer>get("sideScore"), SIDE_FITS));
            }
            return cb.or(any.toArray(new Predicate[0]));
        };
    }

    /** The hard filter: the recipe must carry every one of these labels. */
    public static Specification<Recipe> hasAllLabels(Set<DietaryLabel> labels) {
        return (root, query, cb) -> {
            if (labels == null || labels.isEmpty()) {
                return cb.conjunction(); // always true
            }
            Expression<Set<DietaryLabel>> recipeLabels = root.get("dietaryLabels");
            return cb.and(labels.stream()
                    .map(label -> cb.isMember(label, recipeLabels))
                    .toArray(Predicate[]::new));
        };
    }

    public static Specification<Recipe> nameContains(String text) {
        String pattern = "%" + escapeLike(text.trim().toLowerCase(Locale.ROOT)) + "%";
        return (root, query, cb) -> cb.like(cb.lower(root.<String>get("name")), pattern, '\\');
    }

    /**
     * Recipes with no protein value don't pass: a comparison with null is never
     * true in SQL.
     */
    public static Specification<Recipe> proteinAtLeast(BigDecimal grams) {
        return (root, query, cb) -> cb.greaterThanOrEqualTo(root.<BigDecimal>get("proteinGPerServing"), grams);
    }

    /**
     * Recipes with no cost don't pass, like calories: an unknown cost can't be
     * shown to fit.
     */
    public static Specification<Recipe> costAtMost(BigDecimal perServing) {
        return (root, query, cb) -> cb.lessThanOrEqualTo(root.<BigDecimal>get("costPerServing"), perServing);
    }

    public static Specification<Recipe> caloriesAtMost(BigDecimal calories) {
        return (root, query, cb) -> cb.lessThanOrEqualTo(root.<BigDecimal>get("caloriesPerServing"), calories);
    }

    /**
     * prep + cook within the limit; recipes with no times at all are kept rather
     * than guessed at.
     */
    public static Specification<Recipe> totalTimeAtMost(int minutes) {
        return (root, query, cb) -> {
            Expression<Integer> prep = root.get("prepTimeMinutes");
            Expression<Integer> cook = root.get("cookTimeMinutes");
            Expression<Integer> total = cb.sum(cb.coalesce(prep, 0), cb.coalesce(cook, 0));
            return cb.or(
                    cb.and(cb.isNull(prep), cb.isNull(cook)),
                    cb.lessThanOrEqualTo(total, minutes));
        };
    }

    /** "50%" should search for the text "50%", not "50 followed by anything". */
    private static String escapeLike(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}