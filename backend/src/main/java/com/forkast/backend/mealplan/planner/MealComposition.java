package com.forkast.backend.mealplan.planner;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Whether a main is a whole meal or wants a side next to it. "Easy Roast
 * Chicken" is a fine
 * dinner that's just chicken; "Chicken Burrito Bowls" brings its own rice.
 *
 * A main wants a side when its name is a plain protein (roast chicken, pork
 * chops, salmon,
 * meatloaf) or it has under 15 g of carbs a serving, unless its name says it
 * comes with a
 * starch or is a one-dish meal (pasta, rice, bowls, soup, sandwiches, salads,
 * casseroles).
 * A plain class so the rules are unit-tested.
 */
public final class MealComposition {

    /** Carbs per serving below this: probably no starch on the plate. */
    static final BigDecimal LOW_CARBS = new BigDecimal("15");

    private static final Pattern PLAIN_PROTEIN = Pattern.compile(
            "\\b(?:roast(?:ed)? chicken|baked chicken|grilled chicken|chicken (?:breasts?|thighs|drumsticks|legs|wings)"
                    + "|pork (?:chops?|tenderloin|loin|roast)|pot roast|roast beef|steaks?|meatloaf|meatballs"
                    + "|salmon|cod|tilapia|fish fillets?|baked fish|shrimp skewers|tofu steaks?|turkey breast|ham)\\b");
    private static final Pattern WHOLE_MEAL = Pattern.compile(
            "\\b(?:pasta|spaghetti|noodles?|lo mein|ramen|penne|mac|macaroni|lasagna|gnocchi|ravioli|rice|risotto"
                    + "|quinoa|couscous|potato(?:es)?|fries|bowls?|soups?|stews?|chili|curry|casseroles?|bake|pie|pizza"
                    + "|flatbread|sandwich(?:es)?|wraps?|burritos?|tacos?|quesadillas?|enchiladas?|fajitas?|burgers?"
                    + "|sliders|subs?|salads?|tortellini|dumplings|biscuits|sheet pan|one pot|skillet dinner|hash"
                    + "|stuffed|with vegetables|and vegetables|and potatoes|and rice)\\b");

    private MealComposition() {
    }

    public static boolean needsSide(String name, BigDecimal carbsPerServing) {
        String title = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (WHOLE_MEAL.matcher(title).find()) {
            return false;
        }
        if (PLAIN_PROTEIN.matcher(title).find()) {
            return true;
        }
        return carbsPerServing != null && carbsPerServing.compareTo(LOW_CARBS) < 0;
    }
}
