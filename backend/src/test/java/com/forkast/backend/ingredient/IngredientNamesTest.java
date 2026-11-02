package com.forkast.backend.ingredient;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class IngredientNamesTest {

    @Test
    void candidatesGoFromMostToLeastSpecific() {
        assertThat(IngredientNames.candidates("Boneless Skinless Chicken Breasts")).containsExactly(
                "boneless skinless chicken breasts",
                "boneless skinless chicken breast",
                "chicken breasts",
                "chicken breast");
    }

    @Test
    void duplicatesAreDropped() {
        // already singular and nothing to strip, so there's only one candidate
        assertThat(IngredientNames.candidates("garlic")).containsExactly("garlic");
    }

    @Test
    void percentagesAndDescriptorsAreStripped() {
        assertThat(IngredientNames.candidates("93% lean ground turkey")).contains("ground turkey");
    }

    @Test
    void groundIsKeptBecauseItChangesTheIngredient() {
        assertThat(IngredientNames.candidates("freshly ground black pepper")).contains("ground black pepper");
    }

    @Test
    void crackedAndReservedAreDescriptors() {
        assertThat(IngredientNames.candidates("freshly cracked pepper")).contains("pepper");
        assertThat(IngredientNames.candidates("reserved pasta water")).contains("pasta water");
    }

    @Test
    void blankNameHasNoCandidates() {
        assertThat(IngredientNames.candidates("  ")).isEmpty();
        assertThat(IngredientNames.candidates(null)).isEmpty();
    }

    @ParameterizedTest
    @CsvSource({
            "carrots,          carrot",
            "tomatoes,         tomato",
            "blueberries,      blueberry",
            "peaches,          peach",
            "cherry tomatoes,  cherry tomato",
            "glass,            glass",
            "peas,             pea",
            "gas,              gas",
    })
    void singularOfLastWord(String plural, String expected) {
        assertThat(IngredientNames.singular(plural)).isEqualTo(expected);
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource(delimiter = '|', value = {
            "avocado oil or olive oil                 | olive oil",
            "diamond crystal kosher salt              | kosher salt",
            "bunch kale                               | kale",
            "sprigs thyme                             | thyme",
            "ear of corn                              | corn",
            "of diced tomatoes with green chiles      | diced tomatoes with green chiles",
            "3oz. block ramen noodles                 | ramen noodles",
            "loosely packed fresh parsley leaves      | parsley",
            "chopped fresh cilantro plus more         | cilantro",
            "dried pasta like rigatoni                | pasta",
            "diced green chilies                      | green chiles",
            "thick-cut bacon                          | bacon",
    })
    void looselyWrittenNamesStillGetTheirIngredient(String written, String expected) {
        assertThat(IngredientNames.candidates(written)).contains(expected);
    }

    @Test
    void theWrittenNameIsStillTriedFirst() {
        assertThat(IngredientNames.candidates("avocado oil or olive oil").get(0)).isEqualTo("avocado oil or olive oil");
        assertThat(IngredientNames.candidates("half and half")).containsExactly("half and half");
    }
}
