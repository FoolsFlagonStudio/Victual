package com.forkast.backend.recipe;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.forkast.backend.diet.DietaryLabel;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

@Entity
@Table(name = "recipes")
public class Recipe {

    // ---------- id ----------

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // ---------- columns ----------

    @Column(nullable = false)
    private String name;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "prep_time_minutes")
    private Integer prepTimeMinutes;

    @Column(name = "cook_time_minutes")
    private Integer cookTimeMinutes;

    @Column(name = "base_servings", nullable = false, updatable = false)
    private int baseServings;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(name = "source_url", unique = true, length = 2048)
    private String sourceUrl;

    @Column(name = "source_host")
    private String sourceHost;

    @Column(name = "image_url", length = 2048)
    private String imageUrl;

    @Column(length = 100)
    private String category;

    @Column(length = 100)
    private String cuisine;

    @Column(columnDefinition = "text")
    private String keywords;

    @Column(name = "meal_prep_score", nullable = false)
    private int mealPrepScore = 0;

    @Column(name = "calories_per_serving", precision = 7, scale = 2)
    private BigDecimal caloriesPerServing;

    @Column(name = "protein_g_per_serving", precision = 7, scale = 2)
    private BigDecimal proteinGPerServing;

    @Column(name = "carbs_g_per_serving", precision = 7, scale = 2)
    private BigDecimal carbsGPerServing;

    @Column(name = "fat_g_per_serving", precision = 7, scale = 2)
    private BigDecimal fatGPerServing;

    @Column(name = "nutrition_complete", nullable = false)
    private boolean nutritionComplete = false;

    @Column(name = "breakfast_score", nullable = false)
    private int breakfastScore = 0;

    @Column(name = "lunch_score", nullable = false)
    private int lunchScore = 0;

    @Column(name = "dinner_score", nullable = false)
    private int dinnerScore = 0;

    @Column(name = "side_score", nullable = false)
    private int sideScore = 0;

    @Column(name = "cost_per_serving", precision = 8, scale = 2)
    private BigDecimal costPerServing;

    @Column(name = "cost_complete", nullable = false)
    private boolean costComplete = false;

    // ---------- timestamps ----------

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ---------- relationships ----------

    @OneToMany(mappedBy = "recipe", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("stepNumber ASC")
    private List<RecipeStep> steps = new ArrayList<>();

    @OneToMany(mappedBy = "recipe", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<RecipeIngredient> ingredients = new ArrayList<>();

    @ManyToMany
    @JoinTable(name = "recipe_dietary_labels", joinColumns = @JoinColumn(name = "recipe_id"), inverseJoinColumns = @JoinColumn(name = "dietary_label_id"))
    private Set<DietaryLabel> dietaryLabels = new HashSet<>();

    // ---------- constructors ----------

    protected Recipe() {
        // required by JPA
    }

    public Recipe(String name, int baseServings) {
        setName(name);
        if (baseServings < 1) {
            throw new IllegalArgumentException("baseServings must be at least 1");
        }
        this.baseServings = baseServings;
    }

    // ---------- relationship helpers ----------

    public void addStep(RecipeStep step) {
        steps.add(step);
        step.setRecipe(this);
    }

    public void removeStep(RecipeStep step) {
        steps.remove(step);
        step.setRecipe(null);
    }

    public void addIngredient(RecipeIngredient ingredient) {
        ingredient.setPosition(ingredients.size() + 1);
        ingredients.add(ingredient);
        ingredient.setRecipe(this);
    }

    public void removeIngredient(RecipeIngredient ingredient) {
        ingredients.remove(ingredient);
        ingredient.setRecipe(null);
    }

    public void addDietaryLabel(DietaryLabel label) {
        dietaryLabels.add(label);
    }

    public void removeDietaryLabel(DietaryLabel label) {
        dietaryLabels.remove(label);
    }

    // ---------- getters / setters ----------

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = requireText(name, "name");
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = trimToNull(description);
    }

    public Integer getPrepTimeMinutes() {
        return prepTimeMinutes;
    }

    public void setPrepTimeMinutes(Integer prepTimeMinutes) {
        this.prepTimeMinutes = requireNonNegative(prepTimeMinutes, "prepTimeMinutes");
    }

    public Integer getCookTimeMinutes() {
        return cookTimeMinutes;
    }

    public void setCookTimeMinutes(Integer cookTimeMinutes) {
        this.cookTimeMinutes = requireNonNegative(cookTimeMinutes, "cookTimeMinutes");
    }

    /** Derived from prep + cook time; not stored. */
    public Integer getTotalTimeMinutes() {
        if (prepTimeMinutes == null && cookTimeMinutes == null) {
            return null;
        }
        int prep = prepTimeMinutes == null ? 0 : prepTimeMinutes;
        int cook = cookTimeMinutes == null ? 0 : cookTimeMinutes;
        return prep + cook;
    }

    public int getBaseServings() {
        return baseServings;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = trimToNull(notes);
    }

    public List<RecipeStep> getSteps() {
        return Collections.unmodifiableList(steps);
    }

    public List<RecipeIngredient> getIngredients() {
        return Collections.unmodifiableList(ingredients);
    }

    public Set<DietaryLabel> getDietaryLabels() {
        return Collections.unmodifiableSet(dietaryLabels);
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public String getSourceUrl() {
        return sourceUrl;
    }

    public String getSourceHost() {
        return sourceHost;
    }

    public void setSource(String sourceUrl, String sourceHost) {
        this.sourceUrl = trimToNull(sourceUrl);
        this.sourceHost = trimToNull(sourceHost);
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = trimToNull(imageUrl);
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = trimToNull(category);
    }

    public String getCuisine() {
        return cuisine;
    }

    public void setCuisine(String cuisine) {
        this.cuisine = trimToNull(cuisine);
    }

    public String getKeywords() {
        return keywords;
    }

    public void setKeywords(String keywords) {
        this.keywords = trimToNull(keywords);
    }

    public int getMealPrepScore() {
        return mealPrepScore;
    }

    public void setMealPrepScore(int mealPrepScore) {
        if (mealPrepScore < 0 || mealPrepScore > 100) {
            throw new IllegalArgumentException("mealPrepScore must be 0 to 100");
        }
        this.mealPrepScore = mealPrepScore;
    }

    public BigDecimal getCaloriesPerServing() {
        return caloriesPerServing;
    }

    public BigDecimal getProteinGPerServing() {
        return proteinGPerServing;
    }

    public BigDecimal getCarbsGPerServing() {
        return carbsGPerServing;
    }

    public BigDecimal getFatGPerServing() {
        return fatGPerServing;
    }

    public boolean isNutritionComplete() {
        return nutritionComplete;
    }

    /** Sets all per-serving nutrition at once; values may be null when unknown. */
    public void setNutrition(BigDecimal calories, BigDecimal protein, BigDecimal carbs,
            BigDecimal fat, boolean complete) {
        this.caloriesPerServing = calories;
        this.proteinGPerServing = protein;
        this.carbsGPerServing = carbs;
        this.fatGPerServing = fat;
        this.nutritionComplete = complete;
    }

    /** 0 to 100 from SlotClassifier; a recipe can fill a slot at 50 or more. */
    public int getBreakfastScore() {
        return breakfastScore;
    }

    public int getLunchScore() {
        return lunchScore;
    }

    public int getDinnerScore() {
        return dinnerScore;
    }

    /** 0 to 100 from SlotClassifier; offered as a side to a main at 50 or more. */
    public int getSideScore() {
        return sideScore;
    }

    public void setSideScore(int sideScore) {
        this.sideScore = requireScore(sideScore, "sideScore");
    }

    /** Sets all three slot scores at once, after classification. */
    public void setSlotScores(int breakfast, int lunch, int dinner) {
        this.breakfastScore = requireScore(breakfast, "breakfastScore");
        this.lunchScore = requireScore(lunch, "lunchScore");
        this.dinnerScore = requireScore(dinner, "dinnerScore");
    }

    private static int requireScore(int score, String field) {
        if (score < 0 || score > 100) {
            throw new IllegalArgumentException(field + " must be 0 to 100");
        }
        return score;
    }

    /** Estimated cost of one serving in USD; null when no line could be priced. */
    public BigDecimal getCostPerServing() {
        return costPerServing;
    }

    /** False when any required line has no price or can't be converted to grams. */
    public boolean isCostComplete() {
        return costComplete;
    }

    /**
     * Sets cost the way setNutrition sets nutrition: both at once, after a
     * calculation.
     */
    public void setCost(BigDecimal costPerServing, boolean complete) {
        if (costPerServing != null && costPerServing.signum() < 0) {
            throw new IllegalArgumentException("costPerServing can't be negative");
        }
        this.costPerServing = costPerServing;
        this.costComplete = complete;
    }

    // ---------- private helpers ----------

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value.trim();
    }

    private static String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private static Integer requireNonNegative(Integer value, String field) {
        if (value != null && value < 0) {
            throw new IllegalArgumentException(field + " cannot be negative");
        }
        return value;
    }
}