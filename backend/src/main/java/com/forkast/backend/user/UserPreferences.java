package com.forkast.backend.user;

import static com.forkast.backend.common.ValidationUtils.requireNonNull;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.Instant;
import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.forkast.backend.diet.DietaryLabel;
import com.forkast.backend.mealplan.MealSlot;

import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.MapKeyColumn;
import jakarta.persistence.MapKeyEnumerated;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Id;
import jakarta.persistence.CollectionTable;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "user_preferences")
public class UserPreferences {

    // ---------- id ----------

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // ---------- columns ----------

    @Column(name = "weekly_budget", nullable = false, precision = 10, scale = 2)
    private BigDecimal weeklyBudget;

    @Column(name = "household_serving_size", nullable = false)
    private int householdServingSize = 1;

    @Column(name = "max_calories_per_meal")
    private Integer maxCaloriesPerMeal;

    @Column(name = "max_calories_per_day")
    private Integer maxCaloriesPerDay;

    @Column(name = "protein_target_grams")
    private Integer proteinTargetGrams;

    @Column(name = "carbs_target_grams")
    private Integer carbsTargetGrams;

    @Column(name = "fat_target_grams")
    private Integer fatTargetGrams;

    @Column(name = "repeat_avoidance_days", nullable = false)
    private int repeatAvoidanceDays = 14;

    @Enumerated(EnumType.STRING)
    @Column(name = "plan_start_day", nullable = false, length = 10)
    private DayOfWeek planStartDay = DayOfWeek.SUNDAY;

    @Column(name = "prefers_meal_prep", nullable = false)
    private boolean prefersMealPrep = false;

    /**
     * Dinner leftovers fill the next day's lunch, within the 3-day freshness window
     */
    @Column(name = "leftovers_for_lunch", nullable = false)
    private boolean leftoversForLunch = false;

    /** The weekly job makes next week's plan automatically */
    @Column(name = "auto_plan_enabled", nullable = false)
    private boolean autoPlanEnabled = true;

    /** The day it does (at generate-at, local time); null = the night before planStartDay */
    @Enumerated(EnumType.STRING)
    @Column(name = "auto_plan_day", length = 10)
    private DayOfWeek autoPlanDay;

    // ---------- timestamps ----------

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ---------- relationships ----------

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @ManyToMany
    @JoinTable(name = "user_dietary_restrictions", joinColumns = @JoinColumn(name = "user_preference_id"), inverseJoinColumns = @JoinColumn(name = "dietary_label_id"))
    private Set<DietaryLabel> dietaryRestrictions = new HashSet<>();

    @ElementCollection
    @CollectionTable(name = "user_meal_slots", joinColumns = @JoinColumn(name = "user_preference_id"))
    @MapKeyEnumerated(EnumType.STRING)
    @MapKeyColumn(name = "meal_slot")
    @Column(name = "recipes_per_week", nullable = false)
    private Map<MealSlot, Integer> mealSlots = new EnumMap<>(MealSlot.class);
    // ---------- constructors ----------

    protected UserPreferences() {
    }

    public UserPreferences(User user, BigDecimal weeklyBudget) {
        this.user = user;
        this.weeklyBudget = weeklyBudget;
    }

    // ---------- relationship helpers ----------

    public void addDietaryRestriction(DietaryLabel label) {
        dietaryRestrictions.add(label);
    }

    public void removeDietaryRestriction(DietaryLabel label) {
        dietaryRestrictions.remove(label);
    }

    // ---------- getters / setters ----------

    public UUID getId() {
        return id;
    }

    public User getUser() {
        return user;
    }

    public BigDecimal getWeeklyBudget() {
        return weeklyBudget;
    }

    public void setWeeklyBudget(BigDecimal weeklyBudget) {
        this.weeklyBudget = requireNonNull(weeklyBudget, "weeklyBudget").setScale(2, RoundingMode.HALF_UP);
    }

    public int getHouseholdServingSize() {
        return householdServingSize;
    }

    public void setHouseholdServingSize(int householdServingSize) {
        this.householdServingSize = householdServingSize;
    }

    public Integer getMaxCaloriesPerMeal() {
        return maxCaloriesPerMeal;
    }

    public void setMaxCaloriesPerMeal(Integer maxCaloriesPerMeal) {
        this.maxCaloriesPerMeal = maxCaloriesPerMeal;
    }

    public Integer getMaxCaloriesPerDay() {
        return maxCaloriesPerDay;
    }

    public void setMaxCaloriesPerDay(Integer maxCaloriesPerDay) {
        this.maxCaloriesPerDay = maxCaloriesPerDay;
    }

    public Integer getProteinTargetGrams() {
        return proteinTargetGrams;
    }

    public void setProteinTargetGrams(Integer proteinTargetGrams) {
        this.proteinTargetGrams = proteinTargetGrams;
    }

    public Integer getCarbsTargetGrams() {
        return carbsTargetGrams;
    }

    public void setCarbsTargetGrams(Integer carbsTargetGrams) {
        this.carbsTargetGrams = carbsTargetGrams;
    }

    public Integer getFatTargetGrams() {
        return fatTargetGrams;
    }

    public void setFatTargetGrams(Integer fatTargetGrams) {
        this.fatTargetGrams = fatTargetGrams;
    }

    public int getRepeatAvoidanceDays() {
        return repeatAvoidanceDays;
    }

    public void setRepeatAvoidanceDays(int repeatAvoidanceDays) {
        this.repeatAvoidanceDays = repeatAvoidanceDays;
    }

    public Set<DietaryLabel> getDietaryRestrictions() {
        return Collections.unmodifiableSet(dietaryRestrictions);
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public DayOfWeek getPlanStartDay() {
        return planStartDay;
    }

    public void setPlanStartDay(DayOfWeek planStartDay) {
        this.planStartDay = requireNonNull(planStartDay, "planStartDay");
    }

    public boolean isPrefersMealPrep() {
        return prefersMealPrep;
    }

    public void setPrefersMealPrep(boolean prefersMealPrep) {
        this.prefersMealPrep = prefersMealPrep;
    }

    public boolean isLeftoversForLunch() {
        return leftoversForLunch;
    }

    public void setLeftoversForLunch(boolean leftoversForLunch) {
        this.leftoversForLunch = leftoversForLunch;
    }

    public boolean isAutoPlanEnabled() {
        return autoPlanEnabled;
    }

    public void setAutoPlanEnabled(boolean autoPlanEnabled) {
        this.autoPlanEnabled = autoPlanEnabled;
    }

    /** The stored day, or null for the night before the plan start day. */
    public DayOfWeek getAutoPlanDay() {
        return autoPlanDay;
    }

    /** The day the plan is actually made: the stored one, or the day before the start day. */
    public DayOfWeek getEffectiveAutoPlanDay() {
        return autoPlanDay != null ? autoPlanDay : planStartDay.minus(1);
    }

    public void setAutoPlanDay(DayOfWeek autoPlanDay) {
        this.autoPlanDay = autoPlanDay;
    }

    public Map<MealSlot, Integer> getMealSlots() {
        return Collections.unmodifiableMap(mealSlots);
    }

    /** Replaces every meal slot. Slots not in the new map are deleted. */
    public void replaceMealSlots(Map<MealSlot, Integer> newSlots) {
        requireNonNull(newSlots, "mealSlots");
        if (newSlots.isEmpty()) {
            throw new IllegalArgumentException("At least one meal slot is required");
        }
        newSlots.forEach((slot, count) -> {
            if (slot == null || count == null || count < 1 || count > 7) {
                throw new IllegalArgumentException("Each meal slot needs a count from 1 to 7");
            }
        });
        mealSlots.clear();
        mealSlots.putAll(newSlots);
    }

    /** Replaces every dietary restriction. */
    public void replaceDietaryRestrictions(Set<DietaryLabel> labels) {
        dietaryRestrictions.clear();
        if (labels != null) {
            dietaryRestrictions.addAll(labels);
        }
    }
}