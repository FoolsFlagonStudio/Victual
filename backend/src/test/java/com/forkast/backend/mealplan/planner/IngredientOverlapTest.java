package com.forkast.backend.mealplan.planner;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.forkast.backend.ingest.SlotScores;

class IngredientOverlapTest {

    private static final PlannerProperties PROPERTIES = PlannerProperties.defaults();

    private static UUID id(String name) {
        return UUID.nameUUIDFromBytes(name.getBytes());
    }

    private static Set<UUID> ids(String... names) {
        Set<UUID> out = new java.util.HashSet<>();
        for (String n : names) {
            out.add(id(n));
        }
        return out;
    }

    private static RecipeOption recipe(String name, Set<UUID> ingredients, Set<UUID> proteins) {
        return new RecipeOption(id(name), 4, new SlotScores(5, 40, 90), null, 50, new BigDecimal("3.00"), true, 0,
                false, null, 0, false, ingredients, proteins);
    }

    /** 40 recipes: onion and garlic in all of them, cilantro in 2, so cilantro is rare. */
    private static List<RecipeOption> catalog() {
        List<RecipeOption> all = new ArrayList<>();
        for (int i = 0; i < 38; i++) {
            all.add(recipe("filler " + i, ids("onion", "garlic", "x" + i), Set.of()));
        }
        all.add(recipe("tacos", ids("onion", "garlic", "cilantro", "lime"), Set.of()));
        all.add(recipe("rice bowl", ids("onion", "garlic", "cilantro", "rice"), Set.of()));
        return all;
    }

    @Test
    void sharingARareIngredientBoostsMoreThanSharingACommonOne() {
        List<RecipeOption> all = catalog();
        IngredientOverlap overlap = new IngredientOverlap(all, PROPERTIES);
        overlap.add(all.get(38)); // tacos: onion, garlic, cilantro, lime

        double sharesCilantro = overlap.factor(recipe("salsa verde chicken", ids("onion", "cilantro", "tomatillo"), Set.of()));
        double sharesOnlyOnion = overlap.factor(recipe("soup", ids("onion", "carrot", "celery", "potato"), Set.of()));
        double sharesNothing = overlap.factor(recipe("pasta", ids("pasta", "basil", "tomato", "mozzarella"), Set.of()));

        assertThat(sharesCilantro).isGreaterThan(sharesOnlyOnion);
        assertThat(sharesOnlyOnion).isGreaterThanOrEqualTo(sharesNothing);
        assertThat(sharesNothing).isEqualTo(1.0);
        assertThat(sharesOnlyOnion).isLessThan(1.1); // onion is in everything: barely counts
    }

    @Test
    void nearlyTheSameRecipeIsHeldBack() {
        List<RecipeOption> all = catalog();
        IngredientOverlap overlap = new IngredientOverlap(all, PROPERTIES);
        overlap.add(recipe("chicken tacos", ids("chicken", "tortilla", "cilantro", "lime", "onion"), Set.of()));

        // 4 of 6 ingredients in common: the same meal again
        double sameMeal = overlap.factor(recipe("chicken burritos", ids("chicken", "tortilla", "cilantro", "lime", "rice"), Set.of()));
        assertThat(sameMeal).isLessThan(1.0);
    }

    @Test
    void aThirdRecipeOnOneProteinIsHeldBack() {
        Set<UUID> chicken = ids("chicken thigh");
        List<RecipeOption> all = catalog();
        IngredientOverlap overlap = new IngredientOverlap(all, PROPERTIES);
        overlap.add(recipe("curry", ids("chicken thigh", "coconut milk"), chicken));
        RecipeOption second = recipe("stir fry", ids("chicken thigh", "broccoli"), chicken);
        assertThat(overlap.factor(second)).isGreaterThanOrEqualTo(1.0); // a second is fine, it shares the pack

        overlap.add(second);
        double third = overlap.factor(recipe("soup", ids("chicken thigh", "noodles", "carrot"), chicken));
        assertThat(third).isLessThan(0.5);
    }

    @Test
    void recipesWithoutIngredientDataAreUnaffected() {
        IngredientOverlap overlap = new IngredientOverlap(catalog(), PROPERTIES);
        overlap.add(catalog().get(38));
        assertThat(overlap.factor(recipe("unknown", Set.of(), Set.of()))).isEqualTo(1.0);
    }

    @Test
    void similarityIsSharedOverAll() {
        assertThat(IngredientOverlap.similarity(ids("a", "b", "c"), ids("b", "c", "d"))).isEqualTo(0.5);
        assertThat(IngredientOverlap.similarity(ids("a"), Set.of())).isZero();
    }
}
