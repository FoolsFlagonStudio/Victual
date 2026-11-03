package com.forkast.backend.ingest;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.forkast.backend.ingredient.IngredientNames;

/**
 * Turns one raw ingredient line ("2-3 cloves garlic, minced") into a
 * ParsedLine.
 * Pure string work with no database access, so it is unit-tested directly.
 *
 * The parser only splits the line. It does not decide which catalog ingredient
 * a name
 * refers to; descriptor words like "chopped" stay in the name for
 * IngredientMatcher.
 */
@Component
public class IngredientLineParser {

    /**
     * A mixed number ("1 1/2"), a fraction ("3/4"), a decimal (".5", "2.5") or a
     * whole number.
     */
    private static final String NUMBER = "(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d*\\.\\d+|\\d+)";

    /** A leading amount, optionally a range ("2-3", "2 to 3"). */
    private static final Pattern AMOUNT = Pattern.compile(
            "^(" + NUMBER + ")(?:\\s*(?:-|to)\\s*(" + NUMBER + "))?\\s*");

    private static final Pattern A_OR_AN = Pattern.compile("^(?:a|an|one)\\s+", Pattern.CASE_INSENSITIVE);

    /** "pinch salt" with no number in front means one pinch. */
    private static final Pattern LEADING_PINCH = Pattern.compile(
            "^(?:pinch|pinches|dash|dashes)\\s+(?:of\\s+)?", Pattern.CASE_INSENSITIVE);

    private static final String CONTAINER_WORD = "(?:cans?|jars?|packages?|pkgs?|bags?|box(?:es)?|containers?|cartons?|bottles?)";

    /** A container size after the count: "(15 oz) can", "(14.5-ounce) cans". */
    private static final Pattern CONTAINER = Pattern.compile(
            "^\\(\\s*(" + NUMBER + ")\\s*-?\\s*([a-z. ]+?)\\s*\\)\\s*" + CONTAINER_WORD + "?\\s*",
            Pattern.CASE_INSENSITIVE);

    /**
     * The same without parentheses: "10oz. can", "28-ounce can". The container word
     * must follow.
     */
    private static final Pattern BARE_CONTAINER = Pattern.compile(
            "^(" + NUMBER + ")\\s*-?\\s*([a-z]+\\.?)\\s+(?=" + CONTAINER_WORD + "\\b)",
            Pattern.CASE_INSENSITIVE);

    /**
     * A container word left at the front after the size was read: "4 oz. can green
     * chiles".
     */
    private static final Pattern LEADING_CONTAINER = Pattern.compile(
            "^" + CONTAINER_WORD + "\\b\\s*", Pattern.CASE_INSENSITIVE);

    private static final Pattern SIZE_WORD = Pattern.compile(
            "^(extra[- ]large|small|medium|large|jumbo)\\b\\s*", Pattern.CASE_INSENSITIVE);

    private static final Pattern LEADING_OF = Pattern.compile("^of\\s+", Pattern.CASE_INSENSITIVE);
    private static final Pattern OPTIONAL = Pattern.compile(
            "\\(\\s*optional\\s*\\)|,?\\s*\\boptional\\b", Pattern.CASE_INSENSITIVE);
    /**
     * Lines that aren't food ("8 wooden skewers", "4 turns on a pepper grinder") or are
     * only a garnish: kept on the recipe but optional, so they don't count toward cost or
     * nutrition and don't hold the recipe's cost back as incomplete.
     */
    private static final Pattern NOT_FOOD = Pattern.compile(
            "\\b(skewers?|cedar planks?|toothpicks?|(kitchen|butcher'?s) twine|parchment( paper)?|"
                    + "(aluminum )?foil|pepper grinder|brine|pan drippings)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern GARNISH = Pattern.compile("\\bgarnish(es|ing)?\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern TO_TASTE = Pattern.compile(
            ",?\\s*(?:or\\s+)?to\\s+taste\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern PARENS = Pattern.compile("\\(([^)]*)\\)");
    private static final Pattern EDGE_PUNCTUATION = Pattern.compile("^[\\s,.;:*-]+|[\\s,.;:*-]+$");

    /**
     * Prices some blogs put in the line, like "($0.64)" or "(divided, $0.12**)".
     * They're
     * estimates from when the recipe was written; live prices come from the pricing
     * service.
     */
    private static final Pattern PRICE = Pattern.compile(",?\\s*\\$\\s?\\d+(?:\\.\\d{1,2})?\\**");
    private static final Pattern EMPTY_PARENS = Pattern.compile("\\(\\s*\\)");

    /**
     * A metric weight in parentheses after a unit word, like "1 pound (454g)
     * rigatoni". It's
     * the same quantity restated, and left in the prep note it wouldn't scale with
     * the amount.
     * Only after a word, so a container size like "1 (400g) can" still reaches
     * CONTAINER.
     */
    private static final Pattern METRIC_WEIGHT = Pattern.compile(
            "(?<=[A-Za-z.]\\s)\\(\\s*\\d+(?:\\.\\d+)?\\s*(?:g|grams?|ml)\\b\\s*,?\\s*",
            Pattern.CASE_INSENSITIVE);

    private static final Map<Character, String> UNICODE_FRACTIONS = Map.ofEntries(
            Map.entry('½', "1/2"), Map.entry('⅓', "1/3"), Map.entry('⅔', "2/3"),
            Map.entry('¼', "1/4"), Map.entry('¾', "3/4"), Map.entry('⅕', "1/5"),
            Map.entry('⅖', "2/5"), Map.entry('⅗', "3/5"), Map.entry('⅘', "4/5"),
            Map.entry('⅙', "1/6"), Map.entry('⅚', "5/6"), Map.entry('⅛', "1/8"),
            Map.entry('⅜', "3/8"), Map.entry('⅝', "5/8"), Map.entry('⅞', "7/8"));

    public ParsedLine parse(String raw) {
        String text = stripPrices(normalize(raw));
        if (text.isEmpty() || text.endsWith(":")) {
            return ParsedLine.skipped(); // blank line or a section header like "For the sauce:"
        }

        boolean optional = OPTIONAL.matcher(text).find() || GARNISH.matcher(text).find();
        text = OPTIONAL.matcher(text).replaceAll("").trim();
        boolean toTaste = TO_TASTE.matcher(text).find();
        text = TO_TASTE.matcher(text).replaceAll("").trim();

        // 1. Amount
        BigDecimal amount = null;
        Unit unit = null;
        Matcher amountMatch = AMOUNT.matcher(text);
        Matcher articleMatch = A_OR_AN.matcher(text);
        Matcher pinchMatch = LEADING_PINCH.matcher(text);
        if (amountMatch.find()) {
            amount = parseNumber(amountMatch.group(1));
            if (amountMatch.group(2) != null) {
                amount = rangeOrMixed(amount, parseNumber(amountMatch.group(2)));
            }
            text = text.substring(amountMatch.end());
        } else if (pinchMatch.find()) {
            amount = BigDecimal.ONE; // "pinch salt"
            unit = Unit.PINCH;
            text = text.substring(pinchMatch.end());
        } else if (articleMatch.find()) {
            amount = BigDecimal.ONE; // "a pinch of salt"
            text = text.substring(articleMatch.end());
        }

        // 2. Container size: "1 (15 oz) can" or "1 10oz. can" means that size in total
        if (amount != null && unit == null) {
            for (Pattern pattern : List.of(CONTAINER, BARE_CONTAINER)) {
                Matcher container = pattern.matcher(text);
                if (container.find()) {
                    Optional<Unit> sizeUnit = Unit.fromWord(container.group(2));
                    BigDecimal size = parseNumber(container.group(1));
                    if (sizeUnit.isPresent() && size != null) {
                        amount = amount.multiply(size);
                        unit = sizeUnit.get();
                        text = text.substring(container.end());
                        break;
                    }
                }
            }
        }

        // 3. Unit word, with size words allowed before it ("2 large cloves garlic") or
        // after it
        List<String> notes = new ArrayList<>();
        text = takeSizeWord(text, notes);
        if (amount != null && unit == null) {
            text = takeDescriptorBeforeUnit(text, notes); // "1/4 packed cup basil"
            UnitMatch unitMatch = readUnit(text);
            if (unitMatch != null) {
                unit = unitMatch.unit();
                text = text.substring(unitMatch.length());
            }
        }
        text = LEADING_OF.matcher(text.trim()).replaceFirst("");
        if (unit != null && unit != Unit.CAN) {
            text = LEADING_CONTAINER.matcher(text).replaceFirst(""); // "4 oz. can green chiles"
        }
        text = takeSizeWord(text, notes);

        // 4. Name and prep note: "(...)" and anything after the name's comma go to the
        // note
        Matcher parens = PARENS.matcher(text);
        List<String> parenNotes = new ArrayList<>();
        while (parens.find()) {
            parenNotes.add(parens.group(1));
        }
        text = PARENS.matcher(text).replaceAll(" ");

        // A comma after descriptor words is still part of the name: "boneless, skinless
        // chicken breast"
        List<String> segments = new ArrayList<>(List.of(text.split(",", -1)));
        while (segments.size() > 1 && allDescriptors(segments.get(0))) {
            segments.set(1, segments.get(0).trim() + " " + segments.get(1).trim());
            segments.remove(0);
        }
        String name = segments.get(0);
        if (segments.size() > 1) {
            notes.add(String.join(",", segments.subList(1, segments.size())));
        }
        notes.addAll(parenNotes);

        name = clean(name).toLowerCase(Locale.ROOT);
        if (name.isEmpty()) {
            return ParsedLine.skipped(); // nothing left to match, e.g. a stray "2"
        }

        if (NOT_FOOD.matcher(name).find()) {
            optional = true;
        }

        if (amount == null && toTaste) {
            unit = Unit.TO_TASTE;
        } else if (amount != null && unit == null) {
            unit = Unit.COUNT; // "3 eggs"
        }

        return new ParsedLine(amount, unit, name, joinNotes(notes), optional, false);
    }

    // ---------- helpers ----------

    private record UnitMatch(Unit unit, int length) {
    }

    /** Tries a two-word unit ("fl oz") before a one-word unit ("cups"). */
    private static UnitMatch readUnit(String text) {
        Matcher words = Pattern.compile("^(\\S+)(\\s+(\\S+))?").matcher(text);
        if (!words.find()) {
            return null;
        }
        if (words.group(3) != null) {
            Optional<Unit> twoWord = Unit.fromWord(words.group(1) + " " + words.group(3));
            if (twoWord.isPresent()) {
                return new UnitMatch(twoWord.get(), words.end());
            }
        }
        return Unit.fromWord(words.group(1))
                .map(unit -> new UnitMatch(unit, words.end(1)))
                .orElse(null);
    }

    /**
     * Moves a descriptor that sits right before a unit word into the notes: "packed
     * cup" -> note "packed".
     */
    private static String takeDescriptorBeforeUnit(String text, List<String> notes) {
        String[] words = text.trim().split("\\s+", 3);
        if (words.length >= 2 && IngredientNames.isDescriptor(words[0]) && Unit.fromWord(words[1]).isPresent()) {
            notes.add(words[0].toLowerCase(Locale.ROOT));
            return text.trim().substring(words[0].length()).trim();
        }
        return text;
    }

    private static boolean allDescriptors(String segment) {
        String trimmed = segment.trim();
        if (trimmed.isEmpty()) {
            return false;
        }
        for (String word : trimmed.split("\\s+")) {
            if (!IngredientNames.isDescriptor(word)) {
                return false;
            }
        }
        return true;
    }

    private static String takeSizeWord(String text, List<String> notes) {
        Matcher size = SIZE_WORD.matcher(text.trim());
        if (size.find()) {
            notes.add(size.group(1).toLowerCase(Locale.ROOT));
            return text.trim().substring(size.end());
        }
        return text;
    }

    /**
     * Removes prices and restated metric weights:
     * "1/4 cup (60g) olive oil ($0.64)" -> "1/4 cup olive oil"; "(divided, $0.12)"
     * -> "(divided)".
     */
    static String stripPrices(String text) {
        String withoutPrices = PRICE.matcher(text).replaceAll("");
        withoutPrices = METRIC_WEIGHT.matcher(withoutPrices).replaceAll("(");
        return EMPTY_PARENS.matcher(withoutPrices).replaceAll("").replaceAll("\\s+", " ").trim();
    }

    /**
     * Replaces unicode fractions and dashes, then collapses whitespace. "1½"
     * becomes "1 1/2".
     */
    private static String normalize(String raw) {
        if (raw == null) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        for (char c : raw.toCharArray()) {
            String fraction = UNICODE_FRACTIONS.get(c);
            if (fraction != null) {
                out.append(' ').append(fraction);
            } else if (c == '⁄') { // fraction slash
                out.append('/');
            } else if (c == '–' || c == '—') {
                out.append('-');
            } else if (c == ' ') { // non-breaking space
                out.append(' ');
            } else {
                out.append(c);
            }
        }
        return out.toString().replaceAll("\\s+", " ").trim();
    }

    /**
     * "1 1/2" -> 1.5, "3/4" -> 0.75, ".5" -> 0.5. Returns null for a zero
     * denominator.
     */
    static BigDecimal parseNumber(String text) {
        String value = text.trim();
        if (value.contains(" ")) {
            String[] parts = value.split("\\s+");
            BigDecimal fraction = parseNumber(parts[1]);
            return fraction == null ? null : new BigDecimal(parts[0]).add(fraction);
        }
        if (value.contains("/")) {
            String[] parts = value.split("/");
            BigDecimal denominator = new BigDecimal(parts[1]);
            if (denominator.signum() == 0) {
                return null;
            }
            return new BigDecimal(parts[0]).divide(denominator, 4, RoundingMode.HALF_UP);
        }
        return new BigDecimal(value);
    }

    /**
     * A range uses the upper number so grocery budgets don't come up short ("2-3"
     * -> 3).
     * When the second number is smaller it was a hyphenated mixed number ("1-1/2"
     * -> 1.5).
     */
    private static BigDecimal rangeOrMixed(BigDecimal first, BigDecimal second) {
        if (first == null || second == null) {
            return first != null ? first : second;
        }
        return second.compareTo(first) < 0 ? first.add(second) : second;
    }

    private static String clean(String text) {
        return EDGE_PUNCTUATION.matcher(text.replaceAll("\\s+", " ")).replaceAll("");
    }

    private static String joinNotes(List<String> notes) {
        List<String> cleaned = notes.stream()
                .map(IngredientLineParser::clean)
                .filter(note -> !note.isEmpty())
                .toList();
        return cleaned.isEmpty() ? null : String.join(", ", cleaned);
    }
}