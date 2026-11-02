package com.forkast.backend.mealplan;

import static com.forkast.backend.common.ValidationUtils.requireNonNull;
import static com.forkast.backend.common.ValidationUtils.requirePositive;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.forkast.backend.recipe.Recipe;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * One recipe choice in a plan: cooked once on startDate and eaten for
 * daysCovered days.
 * Lock, swap and regenerate act on selections; the calendar rows (PlannedMeal)
 * belong to them.
 *
 * servings = household size x days eaten (plus a household for a leftover
 * lunch);
 * portionMultiplier = servings / the recipe's base servings, kept exact to 3
 * decimals and
 * rounded only for display.
 */
@Entity
@Table(name = "plan_selections", uniqueConstraints = @UniqueConstraint(name = "uk_plan_selections", columnNames = {
        "meal_plan_id", "meal_slot", "position" }))
public class PlanSelection {

    // ---------- id ----------

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // ---------- columns ----------

    @Enumerated(EnumType.STRING)
    @Column(name = "meal_slot", nullable = false, length = 10, updatable = false)
    private MealSlot mealSlot;

    /** 1..n within the slot, in date order */
    @Column(nullable = false, updatable = false)
    private int position;

    @Column(name = "start_date", nullable = false, updatable = false)
    private LocalDate startDate;

    @Column(name = "days_covered", nullable = false, updatable = false)
    private int daysCovered;

    @Column(nullable = false)
    private int servings;

    @Column(name = "portion_multiplier", nullable = false, precision = 6, scale = 3)
    private BigDecimal portionMultiplier;

    @Column(name = "estimated_cost", precision = 10, scale = 2)
    private BigDecimal estimatedCost;

    @Column(nullable = false)
    private boolean locked = false;

    /** Cooked alongside the main for the same servings; null when the main is a whole meal. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "side_recipe_id")
    private Recipe sideRecipe;

    @Column(name = "side_portion_multiplier", precision = 6, scale = 3)
    private BigDecimal sidePortionMultiplier;

    @Column(name = "side_estimated_cost", precision = 10, scale = 2)
    private BigDecimal sideEstimatedCost;

    /** The user picked this side, so it stays when the main changes */
    @Column(name = "side_chosen", nullable = false)
    private boolean sideChosen = false;

    // ---------- timestamps ----------

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ---------- relationships ----------

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "meal_plan_id", nullable = false, updatable = false)
    private MealPlan mealPlan;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipe_id", nullable = false)
    private Recipe recipe;

    @OneToMany(mappedBy = "selection", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PlannedMeal> meals = new ArrayList<>();

    // ---------- constructors ----------

    protected PlanSelection() {
        // required by JPA
    }

    public PlanSelection(MealSlot mealSlot, int position, LocalDate startDate, int daysCovered) {
        this.mealSlot = requireNonNull(mealSlot, "mealSlot");
        if (position < 1) {
            throw new IllegalArgumentException("position must be at least 1");
        }
        if (daysCovered < 1 || daysCovered > 7) {
            throw new IllegalArgumentException("daysCovered must be 1 to 7");
        }
        this.position = position;
        this.startDate = requireNonNull(startDate, "startDate");
        this.daysCovered = daysCovered;
    }

    // ---------- behavior ----------

    /**
     * Sets or swaps the recipe with the servings it must make. Both change
     * together, because
     * the multiplier depends on the recipe's base servings.
     */
    public void assignRecipe(Recipe recipe, int servings, BigDecimal portionMultiplier, BigDecimal estimatedCost) {
        if (servings < 1) {
            throw new IllegalArgumentException("servings must be at least 1");
        }
        if (estimatedCost != null && estimatedCost.signum() < 0) {
            throw new IllegalArgumentException("estimatedCost cannot be negative");
        }
        this.recipe = requireNonNull(recipe, "recipe");
        this.servings = servings;
        this.portionMultiplier = requirePositive(portionMultiplier, "portionMultiplier");
        this.estimatedCost = estimatedCost;
    }

    /** Adds a calendar row. The selection must already belong to a plan. */
    public PlannedMeal addMeal(LocalDate date, MealSlot slot, boolean leftover) {
        if (mealPlan == null) {
            throw new IllegalStateException("Add the selection to a plan before its meals");
        }
        PlannedMeal meal = new PlannedMeal(this, date, slot, leftover);
        meals.add(meal);
        return meal;
    }

    /** Sets the side, scaled to this selection's servings. */
    public void assignSide(Recipe recipe, BigDecimal portionMultiplier, BigDecimal estimatedCost) {
        if (estimatedCost != null && estimatedCost.signum() < 0) {
            throw new IllegalArgumentException("side estimatedCost cannot be negative");
        }
        this.sideRecipe = requireNonNull(recipe, "side recipe");
        this.sidePortionMultiplier = requirePositive(portionMultiplier, "sidePortionMultiplier");
        this.sideEstimatedCost = estimatedCost;
        this.sideChosen = false;
    }

    /** A side the user picked: kept when the main is swapped or regenerated. */
    public void chooseSide(Recipe recipe, BigDecimal portionMultiplier, BigDecimal estimatedCost) {
        assignSide(recipe, portionMultiplier, estimatedCost);
        this.sideChosen = true;
    }

    public void clearSide() {
        this.sideRecipe = null;
        this.sidePortionMultiplier = null;
        this.sideEstimatedCost = null;
        this.sideChosen = false;
    }

    public boolean isSideChosen() {
        return sideRecipe != null && sideChosen;
    }

    /** The main's cost plus the side's. */
    public BigDecimal getTotalCost() {
        if (estimatedCost == null && sideEstimatedCost == null) {
            return null;
        }
        BigDecimal main = estimatedCost == null ? BigDecimal.ZERO : estimatedCost;
        return sideEstimatedCost == null ? main : main.add(sideEstimatedCost);
    }

    public void lock() {
        this.locked = true;
    }

    public void unlock() {
        this.locked = false;
    }

    /** The last date this selection is eaten (leftover lunches included). */
    public LocalDate getLastMealDate() {
        return meals.stream().map(PlannedMeal::getMealDate).max(Comparator.naturalOrder()).orElse(startDate);
    }

    /**
     * True once its first meal is today or earlier: past meals are never changed.
     */
    public boolean hasStarted(LocalDate today) {
        return !startDate.isAfter(today);
    }

    // ---------- getters ----------

    public UUID getId() {
        return id;
    }

    public MealSlot getMealSlot() {
        return mealSlot;
    }

    public int getPosition() {
        return position;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public int getDaysCovered() {
        return daysCovered;
    }

    public int getServings() {
        return servings;
    }

    public BigDecimal getPortionMultiplier() {
        return portionMultiplier;
    }

    public BigDecimal getEstimatedCost() {
        return estimatedCost;
    }

    public boolean isLocked() {
        return locked;
    }

    public Recipe getRecipe() {
        return recipe;
    }

    public Recipe getSideRecipe() {
        return sideRecipe;
    }

    public BigDecimal getSidePortionMultiplier() {
        return sidePortionMultiplier;
    }

    public BigDecimal getSideEstimatedCost() {
        return sideEstimatedCost;
    }

    /** Calendar rows by date, breakfast to dinner. */
    public List<PlannedMeal> getMeals() {
        List<PlannedMeal> sorted = new ArrayList<>(meals);
        sorted.sort(Comparator.comparing(PlannedMeal::getMealDate).thenComparing(PlannedMeal::getMealSlot));
        return Collections.unmodifiableList(sorted);
    }

    public MealPlan getMealPlan() {
        return mealPlan;
    }

    void setMealPlan(MealPlan mealPlan) { // package-private: only MealPlan calls this
        this.mealPlan = mealPlan;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}