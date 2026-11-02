package com.forkast.backend.pricing;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.forkast.backend.ingredient.IngredientPrice;
import com.forkast.backend.ingredient.PriceSource;

/**
 * Picks one price per ingredient from its price history, trying each step in
 * order and
 * stopping at the first that has one:
 *
 * 1. Kroger, recorded within live-max-age (14 days)
 * 2. BLS, recorded within bls-max-age (60 days; it publishes monthly)
 * 3. The latest price from any source except the seed, however old; stale when
 * it's older
 * than live-max-age
 * 4. The seed price, a hand-entered estimate
 * 5. Nothing: the caller marks recipe cost incomplete
 *
 * A step that has only one of the two measures (Kroger sells kale "1 each", so no price
 * per 100 g) takes the other from the first later step that has it.
 *
 * Within a step, each product counts once, with its latest price, and the
 * cheapest wins. An
 * ingredient mapped to both loose onions and a 3 lb bag gets the bag's lower
 * price per 100 g:
 * the mappings are chosen by hand, so every one of them is a fair buy, and a
 * budget app should
 * assume the cheaper one.
 *
 * Rows without a unit price (a size that couldn't be read) are skipped. "now"
 * is passed in,
 * so tests don't depend on the clock.
 */
@Component
public class PriceResolver {

    private final Duration liveMaxAge;
    private final Duration blsMaxAge;

    public PriceResolver(PricingProperties properties) {
        this.liveMaxAge = properties.liveMaxAge();
        this.blsMaxAge = properties.blsMaxAge();
    }

    public Optional<ResolvedPrice> resolve(Collection<IngredientPrice> history, Instant now) {
        List<IngredientPrice> usable = history.stream()
                .filter(IngredientPrice::hasUnitPrice)
                .toList();
        if (usable.isEmpty()) {
            return Optional.empty();
        }
        Instant liveCutoff = now.minus(liveMaxAge);
        Instant blsCutoff = now.minus(blsMaxAge);

        // Every step's answer, in order. The first one wins; a measure it lacks (a Kroger
        // "1 each" price has no price per 100 g) is filled from the next step that has it,
        // so "8 oz kale" can use the seed estimate while "1 bunch kale" uses Kroger's.
        List<Optional<ResolvedPrice>> steps = new ArrayList<>();
        // 1. Kroger, current
        steps.add(cheapest(usable,
                p -> p.getSource() == PriceSource.KROGER && !p.getRecordedAt().isBefore(liveCutoff), false));
        // 2. BLS, current
        steps.add(cheapest(usable,
                p -> p.getSource() == PriceSource.BLS && !p.getRecordedAt().isBefore(blsCutoff), false));
        // 3. The latest real price, however old
        Optional<IngredientPrice> newest = usable.stream()
                .filter(p -> p.getSource() != PriceSource.SEED)
                .max(Comparator.comparing(IngredientPrice::getRecordedAt));
        steps.add(newest.flatMap(n -> cheapest(usable, p -> p.getSource() == n.getSource(),
                n.getRecordedAt().isBefore(liveCutoff))));
        // 4. The seed estimate
        steps.add(cheapest(usable, p -> p.getSource() == PriceSource.SEED, false));

        List<ResolvedPrice> found = steps.stream().flatMap(Optional::stream).toList();
        if (found.isEmpty()) {
            return Optional.empty();
        }
        ResolvedPrice first = found.get(0);
        BigDecimal per100g = found.stream().map(ResolvedPrice::per100g).filter(Objects::nonNull)
                .findFirst().orElse(null);
        BigDecimal perItem = found.stream().map(ResolvedPrice::perItem).filter(Objects::nonNull)
                .findFirst().orElse(null);
        return Optional.of(new ResolvedPrice(per100g, perItem, first.source(), first.recordedAt(), first.stale()));
    }

    /**
     * Among the prices that pass the filter: the latest per product, then the
     * lowest price per
     * 100 g and the lowest price per item. They can come from different products,
     * which is
     * fine: each is the cheapest way to buy the ingredient by that measure.
     */
    private static Optional<ResolvedPrice> cheapest(List<IngredientPrice> prices,
            Predicate<IngredientPrice> filter, boolean stale) {
        List<IngredientPrice> latestPerProduct = prices.stream()
                .filter(filter)
                .collect(Collectors.toMap(PriceResolver::productKey, Function.identity(),
                        (a, b) -> a.getRecordedAt().isAfter(b.getRecordedAt()) ? a : b))
                .values().stream()
                .toList();
        if (latestPerProduct.isEmpty()) {
            return Optional.empty();
        }

        BigDecimal per100g = latestPerProduct.stream()
                .map(IngredientPrice::getPricePer100g)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .orElse(null);
        BigDecimal perItem = latestPerProduct.stream()
                .map(IngredientPrice::getPricePerItem)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .orElse(null);
        IngredientPrice newest = latestPerProduct.stream()
                .max(Comparator.comparing(IngredientPrice::getRecordedAt))
                .orElseThrow();

        return Optional.of(new ResolvedPrice(per100g, perItem, newest.getSource(), newest.getRecordedAt(), stale));
    }

    /**
     * Rows with no product id (seed, manual) all count as one product, so the
     * newest wins.
     */
    private static String productKey(IngredientPrice price) {
        return price.getSource() + ":" + (price.getExternalId() == null ? "" : price.getExternalId());
    }
}