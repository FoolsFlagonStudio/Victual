package com.forkast.backend.ingredient;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Turns a parsed ingredient name into the lookups the matcher should try, most
 * specific first:
 * the name as written, its singular, then the name with descriptor words
 * removed, and that
 * name's singular.
 *
 * "Boneless Skinless Chicken Breasts" ->
 * boneless skinless chicken breasts, boneless skinless chicken breast,
 * chicken breasts, chicken breast
 */
public final class IngredientNames {

    /**
     * Words that describe preparation or quality rather than what the ingredient
     * is.
     * "ground" is deliberately missing: "ground beef" and "ground ginger" are
     * different
     * ingredients from "beef" and "ginger". Exact matches on the full name are
     * tried
     * before any of these are removed, so "crushed tomatoes" still matches itself.
     */
    private static final Set<String> DESCRIPTORS = Set.of(
            "fresh", "freshly", "frozen", "dried", "canned", "raw", "cooked", "uncooked",
            "chopped", "diced", "minced", "sliced", "shredded", "grated", "crushed", "cubed",
            "halved", "quartered", "julienned", "peeled", "seeded", "trimmed", "rinsed", "drained",
            "melted", "softened", "packed", "sifted", "beaten", "toasted", "cracked",
            "reserved", "reserve", "heaping", "scant",
            "finely", "roughly", "coarsely", "thinly", "lightly", "very",
            "boneless", "skinless", "lean", "extra-lean", "organic", "whole",
            "large", "medium", "small", "extra-large", "jumbo",
            "loosely", "firmly", "tightly", "squeezed", "fresh-squeezed", "freshly-squeezed", "pitted", "shelled",
            "deveined", "thick-cut", "thin-cut", "store-bought", "homemade", "prepared", "plain",
            "bone-in", "skin-on", "cold", "thick", "good-quality", "high-quality");

    private IngredientNames() {
        // static helpers only
    }

    public static List<String> candidates(String parsedName) {
        String base = normalize(parsedName);
        if (base.isEmpty()) {
            return List.of();
        }
        Set<String> candidates = new LinkedHashSet<>(); // keeps insertion order, drops duplicates
        addForms(candidates, base);
        // Then cleaned-up readings, each with its own singular and stripped forms:
        // "avocado oil or olive oil" -> avocado oil, olive oil; "bunch kale" -> kale;
        // "diamond crystal kosher salt" -> kosher salt; "parsley leaves" -> parsley.
        for (String alternative : alternatives(base)) {
            String cleaned = cleanUp(alternative);
            addForms(candidates, cleaned);
            addForms(candidates, withoutTrailingPart(cleaned));
        }
        candidates.remove("");
        return List.copyOf(candidates);
    }

    private static void addForms(Set<String> candidates, String name) {
        if (name.isEmpty()) {
            return;
        }
        candidates.add(name);
        candidates.add(singular(name));
        String stripped = stripDescriptors(name);
        if (!stripped.isEmpty()) {
            candidates.add(stripped);
            candidates.add(singular(stripped));
        }
    }

    // ---------- clean-up for loosely written names ----------

    /** "X or Y" (and "X and/or Y") reads as X, then Y. "half and half" stays whole. */
    static List<String> alternatives(String name) {
        return Arrays.stream(name.split(" (?:or|and/or) "))
                .map(String::trim)
                .filter(part -> !part.isEmpty())
                .toList();
    }

    /** How it's packed or sold, then "of": "bunch of kale", "ear of corn", "of diced tomatoes". */
    private static final Pattern LEADING_CONTAINER_OF = Pattern.compile(
            "^(?:(?:bunch|bunches|sprig|sprigs|ear|ears|head|heads|stalk|stalks|clove|cloves|block|blocks|loaf|loaves"
                    + "|piece|pieces|slice|slices|can|cans|jar|jars|package|packages|bag|bags|box|boxes|bottle"
                    + "|bottles|container|containers|handful|dash|splash|knob|wedge|wedges)\\s+)?(?:of\\s+)+");
    /** The same without "of": "bunch kale", "sprigs thyme", "block ramen noodles". */
    private static final Pattern LEADING_CONTAINER = Pattern.compile(
            "^(?:bunch|bunches|sprig|sprigs|ears?|heads?|stalks?|blocks?|loaf|loaves|pieces?|handful)\\s+");
    /** A size at the start: "3oz block", "7-oz pieces", "1-inch". */
    private static final Pattern LEADING_SIZE = Pattern.compile(
            "^[0-9][0-9./\\-]*\\s*(?:oz|ounce|ounces|lb|lbs|pound|pounds|g|inch|in)?\\.?\\s*");
    /** Endings that aren't part of the name: "or more", "plus more", "to taste". */
    private static final Pattern TRAILING_NOISE = Pattern.compile(
            "\\s+(?:or more|plus more|more|to taste|as needed|for serving|for garnish|optional|divided"
                    + "|such as .*|like .*)$");
    /** Brand names written before the ingredient. */
    private static final Pattern BRAND = Pattern.compile(
            "^(?:diamond crystal|morton'?s?|kerrygold|better than bouillon|kraft|heinz|philadelphia|frank'?s"
                    + "|kikkoman|goya|old el paso|mccormick|simply organic|land o lakes|daisy"
                    + "|hellmann'?s|duke'?s|rao'?s|mutti|cento)\\s+");

    /** One alternative with sizes, containers, brands and trailing notes taken off. */
    static String cleanUp(String name) {
        String cleaned = name;
        for (int pass = 0; pass < 3; pass++) { // "3oz block of ramen noodles" takes a few
            String before = cleaned;
            cleaned = LEADING_SIZE.matcher(cleaned).replaceFirst("");
            cleaned = LEADING_CONTAINER_OF.matcher(cleaned).replaceFirst("");
            cleaned = LEADING_CONTAINER.matcher(cleaned).replaceFirst("");
            cleaned = BRAND.matcher(cleaned).replaceFirst("");
            cleaned = TRAILING_NOISE.matcher(cleaned).replaceFirst("");
            cleaned = cleaned.replaceAll("\\bchil(?:ies|is)\\b", "chiles").trim();
            if (cleaned.equals(before)) {
                break;
            }
        }
        return cleaned;
    }

    /** Words after the ingredient that only say which part: "parsley leaves", "walnut halves". */
    private static final Set<String> TRAILING_PARTS = Set.of("leaves", "leaf", "sprigs", "sprig", "stalks", "stalk",
            "halves", "pieces", "bits", "chunks", "kernels");

    /** The name without a trailing part word, or "" when it has none. */
    static String withoutTrailingPart(String name) {
        int lastSpace = name.lastIndexOf(' ');
        if (lastSpace < 0) {
            return "";
        }
        return TRAILING_PARTS.contains(name.substring(lastSpace + 1)) ? name.substring(0, lastSpace) : "";
    }

    /**
     * True for prep and quality words like "chopped" or "boneless". The parser uses
     * this too.
     */
    public static boolean isDescriptor(String word) {
        return word != null && DESCRIPTORS.contains(word.toLowerCase(Locale.ROOT));
    }

    /**
     * Lowercase, fold accents ("crème" -> "creme", "jalapeño" -> "jalapeno"), keep
     * letters, digits, %, hyphens and apostrophes, collapse spaces.
     */
    static String normalize(String name) {
        if (name == null) {
            return "";
        }
        return Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .replace('’', '\'')
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9%'\\- ]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    /** Drops descriptor words and anything with a digit in it ("93%", "1-inch"). */
    static String stripDescriptors(String name) {
        return Arrays.stream(name.split(" "))
                .filter(word -> !DESCRIPTORS.contains(word))
                .filter(word -> !word.matches(".*\\d.*"))
                .collect(Collectors.joining(" "));
    }

    /**
     * Naive English singular of the last word only: "cherry tomatoes" -> "cherry
     * tomato".
     */
    static String singular(String name) {
        int lastSpace = name.lastIndexOf(' ');
        String head = name.substring(0, lastSpace + 1);
        String word = name.substring(lastSpace + 1);

        if (word.endsWith("ies") && word.length() > 4) {
            word = word.substring(0, word.length() - 3) + "y"; // berries -> berry
        } else if (word.endsWith("oes") || word.endsWith("ches") || word.endsWith("shes")
                || word.endsWith("sses") || word.endsWith("xes")) {
            word = word.substring(0, word.length() - 2); // tomatoes -> tomato
        } else if (word.endsWith("s") && !word.endsWith("ss") && word.length() > 3) {
            word = word.substring(0, word.length() - 1); // carrots -> carrot
        }
        return head + word;
    }
}