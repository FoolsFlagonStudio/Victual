package com.forkast.backend.ingest;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * The units a parsed ingredient line can have, with every common spelling
 * mapped to one value.
 */
public enum Unit {
    TSP, TBSP, CUP, FL_OZ, PINT, QUART, GALLON, ML, L, // volume
    OZ, LB, G, KG, // mass
    PINCH, CLOVE, SLICE, CAN, COUNT, // items
    TO_TASTE;

    private static final Map<String, Unit> SPELLINGS = new HashMap<>();

    static {
        register(TSP, "tsp", "tsps", "tspn", "teaspoon", "teaspoons");
        register(TBSP, "tbsp", "tbsps", "tbspn", "tbs", "tbl", "tablespoon", "tablespoons");
        register(CUP, "cup", "cups", "c");
        register(FL_OZ, "fl oz", "fl. oz", "fluid ounce", "fluid ounces");
        register(PINT, "pint", "pints", "pt");
        register(QUART, "quart", "quarts", "qt");
        register(GALLON, "gallon", "gallons", "gal");
        register(ML, "ml", "milliliter", "milliliters", "millilitre", "millilitres");
        register(L, "l", "liter", "liters", "litre", "litres");
        register(OZ, "oz", "ounce", "ounces");
        register(LB, "lb", "lbs", "pound", "pounds");
        register(G, "g", "gram", "grams");
        register(KG, "kg", "kilogram", "kilograms");
        register(PINCH, "pinch", "pinches", "dash", "dashes");
        register(CLOVE, "clove", "cloves");
        register(SLICE, "slice", "slices");
        register(CAN, "can", "cans");
    }

    private static void register(Unit unit, String... spellings) {
        for (String spelling : spellings) {
            SPELLINGS.put(spelling, unit);
        }
    }

    /**
     * Looks up a unit word, ignoring case and a trailing "." or ",".
     * Single-letter "T" (tablespoon) and "t" (teaspoon) are case-sensitive, so they
     * are
     * checked before lowercasing.
     */
    public static Optional<Unit> fromWord(String word) {
        if (word == null) {
            return Optional.empty();
        }
        String cleaned = word.trim().replaceAll("[.,]+$", "");
        if (cleaned.equals("T")) {
            return Optional.of(TBSP);
        }
        if (cleaned.equals("t")) {
            return Optional.of(TSP);
        }
        return Optional.ofNullable(SPELLINGS.get(cleaned.toLowerCase(Locale.ROOT)));
    }
}