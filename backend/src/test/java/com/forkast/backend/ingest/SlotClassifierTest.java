package com.forkast.backend.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;

import com.forkast.backend.mealplan.MealSlot;

class SlotClassifierTest {

    private final SlotClassifier classifier = new SlotClassifier();

    @ParameterizedTest(name = "{0} ({1}) -> {3}/{4}/{5}")
    @CsvSource(delimiter = '|', nullValues = "-", value = {
            // name | category | keywords | B | L | D
            "Overnight Oats                      | Breakfast     | -                 | 100 | 0  | 0",
            "Scrambled Eggs                      | -             | -                 | 65  | 25 | 45", // no category,
                                                                                                       // still
                                                                                                       // breakfast
            "Breakfast Burrito                   | Main Course   | -                 | 65  | 25 | 45",
            "Tropical Yogurt Parfaits            | -             | -                 | 65  | 25 | 45", // not a lunch
            "Chicken Riggies                     | Main Course   | chicken riggies   | 5   | 60 | 85", // mains fit both
            "Chicken Pesto Pasta Salad           | Main Course   | -                 | 5   | 85 | 45", // a salad leans
                                                                                                       // lunch
            "Greek Salad                         | Salad         | -                 | 5   | 100| 5",
            "Turkey Club Sandwich                | -             | -                 | 5   | 85 | 55",
            "Salsa Chicken Meal Prep Bowls       | Main Course   | meal prep         | 5   | 85 | 55",
            "Slow Cooker Black Bean Soup         | Soup          | -                 | 5   | 70 | 85",
            "Sheet Pan Chicken and Vegetables    | Main Course   | -                 | 5   | 60 | 100",
            "Egg Roll in a Bowl                  | Main Course   | -                 | 5   | 60 | 85", // not an egg
                                                                                                       // dish
            "Garlic Roasted Potatoes             | Side Dish     | -                 | 0   | 0  | 0",
            "Chocolate Chip Cookies              | Dessert       | -                 | 0   | 0  | 0",
            "Lemon Garlic Sauce                  | Sauce         | -                 | 0   | 0  | 0",
            // multi-tag categories, as Budget Bytes files them
            "Easy Frittata                       | Breakfast,Brunch,Dinner,Lunch | - | 100 | 60 | 60", // named slots
                                                                                                       // get the floor
            "Tortellini Salad                    | Brunch,Dinner,Lunch | -           | 5   | 85 | 60", // brunch next to
                                                                                                       // meal tags adds
                                                                                                       // nothing
            "Lemon Dill Salmon and Kale Salad    | Dinner,Lunch,Salad | -            | 5   | 100| 60",
            "Sausage and Egg Breakfast Quesadillas | Breakfast,Lunch | -             | 100 | 60 | 0",
            "Creamed Spinach                     | Dinner,Side Dish | -              | 0   | 0  | 0", // a side,
                                                                                                      // whatever else
                                                                                                      // it's tagged
            "Honey Mustard Broccoli Salad        | Salad,Side Dish | -               | 0   | 0  | 0",
            "Peanut Butter Banana Smoothie       | Breakfast,Dessert,Snack | -       | 100 | 0  | 0", // a meal tag
                                                                                                      // beats dessert
            "Cucumber Sandwiches                 | Appetizer,Lunch,Snack | -         | 5   | 85 | 55",
            "Biscuits                            | Brunch        | -                 | 90  | 0  | 0", // brunch alone
                                                                                                       // is breakfast;
                                                                                                       // a side by name
    })
    void scoresEachSlot(String name, String category, String keywords, int breakfast, int lunch, int dinner) {
        SlotScores scores = classifier.score(name, category, keywords);

        assertThat(scores).isEqualTo(new SlotScores(breakfast, lunch, dinner));
    }

    @ParameterizedTest(name = "{0} ({1}) is not a meal")
    @CsvSource(delimiter = '|', nullValues = "-", value = {
            // names that slipped through as dinners: articles, components, sweets
            "How to Make Ghee                    | -",
            "How To Cook Quinoa                  | Dinner",
            "Mayo Ketchup                        | -",
            "Lemon Curd                          | Dinner",
            "Ranch Dressing                      | Main Course",
            "Homemade Chicken Stock              | Soup",
            "Garlic Butter Sauce                 | Dinner",
            "Mango Salsa                         | -",
            "Chocolate Almond Butter Banana Bites | Dinner",
            "Peanut Butter Energy Balls          | -",
            "Apple Pie                           | -",
    })
    void notAMealByName(String name, String category) {
        assertThat(classifier.score(name, category, null)).isEqualTo(new SlotScores(0, 0, 0));
    }

    @ParameterizedTest(name = "{0} ({1}) -> {2}/{3}/{4}")
    @CsvSource(delimiter = '|', nullValues = "-", value = {
            // sides by name lose lunch and dinner, whatever they're filed under
            "Mashed Sweet Potatoes               | Dinner        | 5   | 0  | 0",
            "Cilantro Lime Slaw                  | -             | 5   | 0  | 0",
            "Buttery Drop Biscuits               | Dinner        | 5   | 0  | 0",
            // ...but a name with a protein or grain is still the dish
            "Chicken and Biscuits                | Dinner        | 5   | 60 | 85",
            "Chicken in Garlic Sauce             | -             | 5   | 60 | 85",
            "Pasta with Pesto                    | -             | 5   | 60 | 85",
            "Biscuits and Gravy                  | Breakfast     | 90  | 0  | 0",
            "Chicken Pot Pie                     | Dinner        | 5   | 60 | 85",
    })
    void namesHaveTheLastWord(String name, String category, int breakfast, int lunch, int dinner) {
        assertThat(classifier.score(name, category, null)).isEqualTo(new SlotScores(breakfast, lunch, dinner));
    }

    @ParameterizedTest(name = "{0} ({1}) side {2}")
    @CsvSource(delimiter = '|', nullValues = "-", value = {
            "Garlic Roasted Potatoes             | Side Dish     | 90",
            "Creamed Spinach                     | Dinner,Side Dish | 90",
            "Cilantro Lime Slaw                  | -             | 80",
            "Mashed Sweet Potatoes               | Dinner        | 80",
            "Cilantro Lime Rice                  | -             | 60",
            "Roasted Broccoli                    | -             | 60",
            "Greek Salad                         | Salad         | 60",
            // not sides: mains, components, sweets, soups, breakfasts
            "Easy Roast Chicken                  | Dinner        | 0",
            "Chicken Fried Rice                  | Main Course   | 0",
            "Lemon Garlic Sauce                  | Sauce         | 0",
            "Ranch Dressing                      | Side Dish     | 0",
            "Chocolate Chip Cookies              | Dessert       | 0",
            "Slow Cooker Black Bean Soup         | Soup          | 0",
            "Overnight Oats                      | Breakfast     | 0",
    })
    void scoresSides(String name, String category, int side) {
        assertThat(classifier.sideScore(name, category, null)).isEqualTo(side);
    }

    @Test
    void breakfastCategoryWinsWhenSeveralAreListed() {
        SlotScores scores = classifier.score("Sausage Gravy", "Breakfast, Main Course", null);

        assertThat(scores.fits(MealSlot.BREAKFAST)).isTrue();
        assertThat(scores.fits(MealSlot.DINNER)).isFalse();
    }

    @Test
    void fitsMeansFiftyOrMore() {
        SlotScores scores = new SlotScores(50, 49, 100);

        assertThat(scores.fits(MealSlot.BREAKFAST)).isTrue();
        assertThat(scores.fits(MealSlot.LUNCH)).isFalse();
        assertThat(scores.of(MealSlot.DINNER)).isEqualTo(100);
    }
}