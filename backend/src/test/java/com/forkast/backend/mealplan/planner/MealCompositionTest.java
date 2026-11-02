package com.forkast.backend.mealplan.planner;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class MealCompositionTest {

    @ParameterizedTest(name = "{0} ({1} g carbs) -> {2}")
    @CsvSource(delimiter = '|', nullValues = "-", value = {
            // plain proteins want a side whatever their carbs
            "Easy Roast Chicken                | -   | true",
            "Lemon Herb Chicken Thighs         | 4   | true",
            "Baked Salmon                      | 40  | true",
            "Garlic Pork Chops                 | -   | true",
            // low carbs and no starch in the name
            "Zucchini Fritters                 | 10  | true",
            // whole meals bring their own starch, or are one-dish
            "Chicken Burrito Bowls             | 10  | false",
            "Spaghetti Bolognese               | 5   | false",
            "Turkey Chili                      | 10  | false",
            "Sheet Pan Chicken and Vegetables  | 8   | false",
            "Black Bean Tacos                  | 40  | false",
            "Coconut Chickpea Curry            | 30  | false",
            // enough carbs, or unknown: leave it
            "Stuffed Peppers                   | 30  | false",
            "Vegetable Frittata                | -   | false",
    })
    void decidesWhetherAMainWantsASide(String name, BigDecimal carbs, boolean expected) {
        assertThat(MealComposition.needsSide(name, carbs)).isEqualTo(expected);
    }
}
