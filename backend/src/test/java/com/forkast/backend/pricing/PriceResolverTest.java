package com.forkast.backend.pricing;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.forkast.backend.ingredient.Ingredient;
import com.forkast.backend.ingredient.IngredientPrice;
import com.forkast.backend.ingredient.PriceSource;
import com.forkast.backend.ingredient.SoldBy;

/**
 * One test per step of the fallback chain, plus how products within a step
 * combine.
 */
class PriceResolverTest {

    private static final Instant NOW = Instant.parse("2026-10-08T12:00:00Z");
    private static final Ingredient ONION = new Ingredient("onion");

    private final PriceResolver resolver = new PriceResolver(
            new PricingProperties(Duration.ofDays(14), Duration.ofDays(45)));

    private static Instant daysAgo(int days) {
        return NOW.minus(Duration.ofDays(days));
    }

    private static IngredientPrice price(PriceSource source, String externalId, int daysAgo,
            String per100g, String perItem) {
        return IngredientPrice.builder(ONION, source, new BigDecimal("1.00"), BigDecimal.ONE, "lb")
                .recordedAt(daysAgo(daysAgo))
                .product(externalId, "1 lb", SoldBy.WEIGHT)
                .unitPrices(per100g == null ? null : new BigDecimal(per100g),
                        perItem == null ? null : new BigDecimal(perItem))
                .build();
    }

    // ---------- the chain ----------

    @Test
    void freshKrogerWinsOverEverything() {
        ResolvedPrice resolved = resolver.resolve(List.of(
                price(PriceSource.SEED, null, 1, "0.10", null),
                price(PriceSource.BLS, "APU0000712311", 5, "0.20", null),
                price(PriceSource.KROGER, "4093", 3, "0.28", null)), NOW).orElseThrow();

        assertThat(resolved.source()).isEqualTo(PriceSource.KROGER);
        assertThat(resolved.per100g()).isEqualByComparingTo("0.28");
        assertThat(resolved.stale()).isFalse();
    }

    @Test
    void freshBlsWhenKrogerIsOld() {
        ResolvedPrice resolved = resolver.resolve(List.of(
                price(PriceSource.KROGER, "4093", 20, "0.28", null),
                price(PriceSource.BLS, "APU0000712311", 30, "0.31", null)), NOW).orElseThrow();

        assertThat(resolved.source()).isEqualTo(PriceSource.BLS);
        assertThat(resolved.per100g()).isEqualByComparingTo("0.31");
        assertThat(resolved.stale()).isFalse();
    }

    @Test
    void newestRealPriceFlaggedStaleWhenNothingIsCurrent() {
        ResolvedPrice resolved = resolver.resolve(List.of(
                price(PriceSource.KROGER, "4093", 20, "0.28", null),
                price(PriceSource.BLS, "APU0000712311", 60, "0.31", null),
                price(PriceSource.SEED, null, 1, "0.25", null)), NOW).orElseThrow();

        assertThat(resolved.source()).isEqualTo(PriceSource.KROGER);
        assertThat(resolved.per100g()).isEqualByComparingTo("0.28");
        assertThat(resolved.stale()).isTrue();
    }

    @Test
    void missingMeasureComesFromALaterStep() {
        // Kroger sells it per item only; the seed has a price per 100 g
        ResolvedPrice resolved = resolver.resolve(List.of(
                price(PriceSource.KROGER, "4627", 2, null, "1.49"),
                price(PriceSource.SEED, null, 1, "0.88", null)), NOW).orElseThrow();

        assertThat(resolved.source()).isEqualTo(PriceSource.KROGER);
        assertThat(resolved.perItem()).isEqualByComparingTo("1.49");
        assertThat(resolved.per100g()).isEqualByComparingTo("0.88");
    }

    @Test
    void laterStepNeverOverridesAMeasureTheWinnerHas() {
        ResolvedPrice resolved = resolver.resolve(List.of(
                price(PriceSource.KROGER, "4627", 2, "0.50", null),
                price(PriceSource.SEED, null, 1, "0.10", "0.99")), NOW).orElseThrow();

        assertThat(resolved.per100g()).isEqualByComparingTo("0.50");
        assertThat(resolved.perItem()).isEqualByComparingTo("0.99");
    }

    @Test
    void recentManualPriceIsNotStale() {
        ResolvedPrice resolved = resolver.resolve(List.of(
                price(PriceSource.MANUAL, null, 2, "0.30", null)), NOW).orElseThrow();

        assertThat(resolved.source()).isEqualTo(PriceSource.MANUAL);
        assertThat(resolved.stale()).isFalse();
    }

    @Test
    void seedOnlyWhenThereIsNoRealPrice() {
        ResolvedPrice resolved = resolver.resolve(List.of(
                price(PriceSource.SEED, null, 400, "0.20", null),
                price(PriceSource.SEED, null, 10, "0.25", null)), NOW).orElseThrow();

        assertThat(resolved.source()).isEqualTo(PriceSource.SEED);
        assertThat(resolved.per100g()).isEqualByComparingTo("0.25"); // the newest seed row
        assertThat(resolved.stale()).isFalse();
    }

    @Test
    void nothingUsableIsEmpty() {
        assertThat(resolver.resolve(List.of(), NOW)).isEmpty();
        // a price whose size couldn't be read has no unit price, so it doesn't count
        assertThat(resolver.resolve(List.of(price(PriceSource.KROGER, "4093", 1, null, null)), NOW)).isEmpty();
    }

    @Test
    void windowEdgesAreInclusive() {
        ResolvedPrice resolved = resolver.resolve(List.of(
                price(PriceSource.KROGER, "4093", 14, "0.28", null)), NOW).orElseThrow();

        assertThat(resolved.stale()).isFalse();
    }

    // ---------- products within a step ----------

    @Test
    void eachProductCountsOnceWithItsLatestPrice() {
        ResolvedPrice resolved = resolver.resolve(List.of(
                price(PriceSource.KROGER, "4093", 10, "0.10", null), // old price of the same product
                price(PriceSource.KROGER, "4093", 2, "0.28", null)), NOW).orElseThrow();

        assertThat(resolved.per100g()).isEqualByComparingTo("0.28");
        assertThat(resolved.recordedAt()).isEqualTo(daysAgo(2));
    }

    @Test
    void cheapestProductWinsForEachMeasure() {
        ResolvedPrice resolved = resolver.resolve(List.of(
                price(PriceSource.KROGER, "4093", 2, "0.2844", "0.6450"), // loose onions
                price(PriceSource.KROGER, "1111091682", 2, "0.2785", null)), NOW).orElseThrow();

        assertThat(resolved.per100g()).isEqualByComparingTo("0.2785"); // the 3 lb bag
        assertThat(resolved.perItem()).isEqualByComparingTo("0.6450"); // only loose has one
    }
}