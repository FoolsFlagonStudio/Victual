package com.forkast.backend.recipe.search;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.forkast.backend.diet.DietaryLabel;
import com.forkast.backend.diet.DietaryLabelRepository;
import com.forkast.backend.ingest.SlotScores;
import com.forkast.backend.mealplan.MealSlot;
import com.forkast.backend.recipe.Recipe;
import com.forkast.backend.recipe.RecipeRepository;

/**
 * Runs the specifications against the scraped recipes.
 * Read-only; @Transactional keeps the
 * session open so lazy labels can be checked, and rolls back anyway.
 */
@SpringBootTest
@ActiveProfiles("local")
@Transactional
class RecipeSpecificationsIntegrationTest {

    @Autowired
    private RecipeRepository recipeRepository;
    @Autowired
    private DietaryLabelRepository labelRepository;

    private RecipeSearchCriteria only(Set<DietaryLabel> labels, BigDecimal minProtein,
            BigDecimal maxCalories, Integer maxMinutes, String text) {
        return new RecipeSearchCriteria(text, labels, minProtein, maxCalories, maxMinutes, null);
    }

    @Test
    void requiredLabelIsAHardFilter() {
        DietaryLabel dairyFree = labelRepository.findByNameIgnoreCase("dairy-free").orElseThrow();

        List<Recipe> found = recipeRepository.findAll(
                RecipeSpecifications.matching(only(Set.of(dairyFree), null, null, null, null)));

        assertThat(found).isNotEmpty();
        assertThat(found).allSatisfy(recipe -> assertThat(recipe.getDietaryLabels()).contains(dairyFree));
        assertThat(found.size()).isLessThan((int) recipeRepository.count());
    }

    @Test
    void everyRequiredLabelMustBePresent() {
        DietaryLabel dairyFree = labelRepository.findByNameIgnoreCase("dairy-free").orElseThrow();
        DietaryLabel glutenFree = labelRepository.findByNameIgnoreCase("gluten-free").orElseThrow();

        List<Recipe> found = recipeRepository.findAll(
                RecipeSpecifications.matching(only(Set.of(dairyFree, glutenFree), null, null, null, null)));

        assertThat(found).allSatisfy(recipe -> assertThat(recipe.getDietaryLabels()).contains(dairyFree, glutenFree));
    }

    @Test
    void nutritionFiltersExcludeRecipesOutsideTheRange() {
        List<Recipe> found = recipeRepository.findAll(RecipeSpecifications.matching(
                only(Set.of(), new BigDecimal("20"), new BigDecimal("600"), null, null)));

        assertThat(found).isNotEmpty().allSatisfy(recipe -> {
            assertThat(recipe.getProteinGPerServing()).isGreaterThanOrEqualTo(new BigDecimal("20"));
            assertThat(recipe.getCaloriesPerServing()).isLessThanOrEqualTo(new BigDecimal("600"));
        });
    }

    @Test
    void maxCostExcludesDearerAndUnpricedRecipes() {
        List<Recipe> found = recipeRepository.findAll(RecipeSpecifications.matching(
                new RecipeSearchCriteria(null, Set.of(), null, null, null, new BigDecimal("3.00"))));

        assertThat(found).isNotEmpty().allSatisfy(recipe -> assertThat(recipe.getCostPerServing())
                .isNotNull()
                .isLessThanOrEqualTo(new BigDecimal("3.00")));
    }

    @Test
    void mealFilterKeepsRecipesThatFitAnyChosenMeal() {
        List<Recipe> found = recipeRepository.findAll(RecipeSpecifications.matching(new RecipeSearchCriteria(
                null, Set.of(), null, null, null, null, Set.of(MealSlot.LUNCH, MealSlot.DINNER), false)));

        assertThat(found).isNotEmpty().allSatisfy(recipe -> assertThat(
                recipe.getLunchScore() >= SlotScores.FITS || recipe.getDinnerScore() >= SlotScores.FITS).isTrue());
        assertThat(found.size()).isLessThan((int) recipeRepository.count());
    }

    @Test
    void maxTimeKeepsRecipesWithNoTimes() {
        List<Recipe> found = recipeRepository.findAll(
                RecipeSpecifications.matching(only(Set.of(), null, null, 30, null)));

        assertThat(found).allSatisfy(recipe -> {
            boolean noTimes = recipe.getPrepTimeMinutes() == null && recipe.getCookTimeMinutes() == null;
            int total = (recipe.getPrepTimeMinutes() == null ? 0 : recipe.getPrepTimeMinutes())
                    + (recipe.getCookTimeMinutes() == null ? 0 : recipe.getCookTimeMinutes());
            assertThat(noTimes || total <= 30).isTrue();
        });
    }

    @Test
    void textMatchesNamesCaseInsensitively() {
        List<Recipe> found = recipeRepository.findAll(
                RecipeSpecifications.matching(only(Set.of(), null, null, null, "CHILI")));

        assertThat(found).isNotEmpty()
                .allSatisfy(recipe -> assertThat(recipe.getName().toLowerCase()).contains("chili"));
    }
}