package com.forkast.backend.recipe;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.forkast.backend.common.PageResponse;
import com.forkast.backend.common.exception.ApiException;
import com.forkast.backend.diet.DietaryLabel;
import com.forkast.backend.diet.DietaryLabelRepository;
import com.forkast.backend.favorite.FavoriteRepository;
import com.forkast.backend.recipe.fit.FitResult;
import com.forkast.backend.recipe.fit.FitTargets;
import com.forkast.backend.recipe.fit.RecipeFitEvaluator;
import com.forkast.backend.recipe.fit.RecipeNutrition;
import com.forkast.backend.recipe.scale.IngredientScaler;
import com.forkast.backend.recipe.scale.ScaledAmount;
import com.forkast.backend.recipe.search.RecipeSearchCriteria;
import com.forkast.backend.recipe.search.RecipeSearchRequest;
import com.forkast.backend.mealplan.MealSlot;
import com.forkast.backend.recipe.search.RecipeSort;
import com.forkast.backend.recipe.search.RecipeSpecifications;
import com.forkast.backend.recipe.search.RecipeSummaryResponse;
import com.forkast.backend.user.UserPreferences;
import com.forkast.backend.user.UserPreferencesRepository;

/**
 * Read-only recipe queries for the app: search now, detail and favorites in the
 * next steps.
 */
@Service
public class RecipeQueryService {

    private final RecipeRepository recipeRepository;
    private final UserPreferencesRepository preferencesRepository;
    private final DietaryLabelRepository labelRepository;
    private final FavoriteRepository favoriteRepository;
    private final RecipeFitEvaluator fitEvaluator;

    public RecipeQueryService(RecipeRepository recipeRepository,
            UserPreferencesRepository preferencesRepository,
            DietaryLabelRepository labelRepository,
            FavoriteRepository favoriteRepository,
            RecipeFitEvaluator fitEvaluator) {
        this.recipeRepository = recipeRepository;
        this.preferencesRepository = preferencesRepository;
        this.labelRepository = labelRepository;
        this.favoriteRepository = favoriteRepository;
        this.fitEvaluator = fitEvaluator;
    }

    @Transactional(readOnly = true)
    public PageResponse<RecipeSummaryResponse> search(UUID userId, RecipeSearchRequest request) {
        UserPreferences preferences = preferencesRepository.findByUserId(userId).orElse(null);
        FitTargets targets = FitTargets.from(preferences);
        RecipeSort sort = RecipeSort.from(request.sort());
        int page = request.pageOrDefault();
        int size = request.sizeOrDefault();

        Set<DietaryLabel> requiredLabels = restrictionsOf(preferences);
        requiredLabels.addAll(resolveLabels(request.labels()));

        Set<MealSlot> slots = EnumSet.noneOf(MealSlot.class);
        boolean sides = false;
        for (String meal : request.meals() == null ? List.<String>of() : request.meals()) {
            String m = meal.trim().toUpperCase(Locale.ROOT);
            if (m.equals("SIDE") || m.equals("SIDES")) {
                sides = true;
            } else if (m.equals("BREAKFAST") || m.equals("LUNCH") || m.equals("DINNER")) {
                slots.add(MealSlot.valueOf(m));
            } else if (!m.isEmpty()) {
                throw ApiException.badRequest("Unknown meal '" + meal + "': use breakfast, lunch, dinner or side.");
            }
        }

        Specification<Recipe> spec = RecipeSpecifications.matching(new RecipeSearchCriteria(
                request.q(), requiredLabels, request.minProtein(), request.maxCalories(), request.maxTime(),
                request.maxCost(), slots, sides));

        List<UUID> pageIds;
        long total;
        if (sort == RecipeSort.FIT || sort == RecipeSort.TIME) {
            // These orders come from Java (the fit penalty, prep + cook), so sort every
            // match here
            // and slice out the page. Fine for a few thousand recipes.
            List<Recipe> matches = recipeRepository.findAll(spec);
            Comparator<Recipe> order = sort == RecipeSort.FIT ? byFit(targets) : byTotalTime();
            total = matches.size();
            pageIds = matches.stream()
                    .sorted(order)
                    .skip((long) page * size)
                    .limit(size)
                    .map(Recipe::getId)
                    .toList();
        } else {
            Page<Recipe> result = recipeRepository.findAll(spec, PageRequest.of(page, size, sqlSort(sort)));
            total = result.getTotalElements();
            pageIds = result.getContent().stream().map(Recipe::getId).toList();
        }

        return new PageResponse<>(summaries(userId, pageIds, targets), page, size, total);
    }

    /**
     * One recipe scaled to `servings` (default: the user's household size). A
     * recipe the user's
     * restrictions exclude is a 404, the same as one that doesn't exist.
     */
    @Transactional(readOnly = true)
    public RecipeDetailResponse detail(UUID userId, UUID recipeId, Integer servings) {
        UserPreferences preferences = preferencesRepository.findByUserId(userId).orElse(null);
        Recipe recipe = recipeRepository.findWithIngredientsById(recipeId)
                .orElseThrow(() -> ApiException.notFound("Recipe not found."));
        if (!recipe.getDietaryLabels().containsAll(restrictionsOf(preferences))) {
            throw ApiException.notFound("Recipe not found.");
        }

        int targetServings = servings != null ? servings
                : preferences != null ? preferences.getHouseholdServingSize()
                        : recipe.getBaseServings();
        BigDecimal factor = IngredientScaler.factor(targetServings, recipe.getBaseServings());

        List<RecipeDetailResponse.IngredientLine> ingredients = recipe.getIngredients().stream()
                .map(line -> {
                    ScaledAmount scaled = IngredientScaler.scale(line.getAmount(), line.getUnit(), factor);
                    String name = line.getIngredient() != null ? line.getIngredient().getName() : line.getParsedName();
                    return new RecipeDetailResponse.IngredientLine(name, scaled.amount(), scaled.displayAmount(),
                            scaled.unit(), line.getPrepNote(), line.isOptional(), line.getRawText());
                })
                .toList();
        List<RecipeDetailResponse.Step> steps = recipe.getSteps().stream()
                .map(step -> new RecipeDetailResponse.Step(step.getStepNumber(), step.getInstructionText()))
                .toList();

        return new RecipeDetailResponse(
                recipe.getId(), recipe.getName(), recipe.getDescription(), recipe.getImageUrl(),
                recipe.getPrepTimeMinutes(), recipe.getCookTimeMinutes(), RecipeSummaryResponse.totalMinutes(recipe),
                recipe.getBaseServings(), targetServings,
                recipe.getCategory(), recipe.getCuisine(), recipe.getSourceUrl(), recipe.getSourceHost(),
                recipe.getCaloriesPerServing(), recipe.getProteinGPerServing(),
                recipe.getCarbsGPerServing(), recipe.getFatGPerServing(),
                recipe.isNutritionComplete(),
                recipe.getCostPerServing(), estimatedCost(recipe.getCostPerServing(), targetServings),
                recipe.isCostComplete(),
                recipe.getMealPrepScore(),
                recipe.getDietaryLabels().stream().map(DietaryLabel::getName).sorted().toList(),
                evaluate(recipe, FitTargets.from(preferences)).flags(),
                favoriteRepository.existsByUserIdAndRecipeId(userId, recipeId),
                ingredients, steps);
    }

    /**
     * The recipe, or 404 if it doesn't exist or the user's restrictions exclude it.
     */
    @Transactional(readOnly = true)
    public Recipe requireVisible(UUID userId, UUID recipeId) {
        UserPreferences preferences = preferencesRepository.findByUserId(userId).orElse(null);
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> ApiException.notFound("Recipe not found."));
        if (!recipe.getDietaryLabels().containsAll(restrictionsOf(preferences))) {
            throw ApiException.notFound("Recipe not found.");
        }
        return recipe;
    }

    /**
     * The user's favorites, newest first, as search cards. A favorite the user's
     * current
     * restrictions exclude is hidden, not deleted, so dropping the restriction
     * brings it back.
     */
    @Transactional(readOnly = true)
    public PageResponse<RecipeSummaryResponse> favorites(UUID userId, int page, int size) {
        UserPreferences preferences = preferencesRepository.findByUserId(userId).orElse(null);
        Set<DietaryLabel> restrictions = restrictionsOf(preferences);

        List<UUID> newestFirst = favoriteRepository.findRecipeIdsNewestFirst(userId);
        List<UUID> visible = newestFirst;
        if (!restrictions.isEmpty() && !newestFirst.isEmpty()) {
            Map<UUID, Recipe> byId = recipeRepository.findWithLabelsByIdIn(newestFirst).stream()
                    .collect(Collectors.toMap(Recipe::getId, Function.identity()));
            visible = newestFirst.stream()
                    .filter(id -> byId.get(id).getDietaryLabels().containsAll(restrictions))
                    .toList();
        }

        List<UUID> pageIds = visible.stream().skip((long) page * size).limit(size).toList();
        return new PageResponse<>(summaries(userId, pageIds, FitTargets.from(preferences)), page, size, visible.size());
    }

    // ---------- helpers ----------

    private static BigDecimal estimatedCost(BigDecimal perServing, int servings) {
        return perServing == null ? null
                : perServing.multiply(BigDecimal.valueOf(servings)).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Builds the cards for one page in a fixed number of queries: one for the
     * recipes with
     * their labels, one for which of them are favorites. Keeps the order of ids.
     */
    List<RecipeSummaryResponse> summaries(UUID userId, List<UUID> ids, FitTargets targets) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<UUID, Recipe> byId = recipeRepository.findWithLabelsByIdIn(ids).stream()
                .collect(Collectors.toMap(Recipe::getId, Function.identity()));
        Set<UUID> favorites = favoriteRepository.findFavoritedRecipeIds(userId, ids);

        return ids.stream()
                .map(byId::get)
                .map(recipe -> RecipeSummaryResponse.from(
                        recipe, evaluate(recipe, targets), favorites.contains(recipe.getId())))
                .toList();
    }

    private FitResult evaluate(Recipe recipe, FitTargets targets) {
        return fitEvaluator.evaluate(RecipeNutrition.of(recipe), targets);
    }

    /** A mutable copy, so request labels can be added to it. */
    Set<DietaryLabel> restrictionsOf(UserPreferences preferences) {
        return preferences == null ? new HashSet<>() : new HashSet<>(preferences.getDietaryRestrictions());
    }

    private Set<DietaryLabel> resolveLabels(Collection<String> names) {
        Set<DietaryLabel> labels = new HashSet<>();
        if (names == null) {
            return labels;
        }
        for (String name : names) {
            if (name == null || name.isBlank()) {
                continue;
            }
            labels.add(labelRepository.findByNameIgnoreCase(name.trim())
                    .orElseThrow(() -> ApiException.badRequest("Unknown label '" + name.trim() + "'.")));
        }
        return labels;
    }

    /**
     * Lowest penalty first; ties go to the better meal-prep score, then the name.
     */
    private Comparator<Recipe> byFit(FitTargets targets) {
        Map<UUID, Double> penalties = new HashMap<>();
        Function<Recipe, Double> penalty = recipe -> penalties.computeIfAbsent(recipe.getId(),
                id -> evaluate(recipe, targets).penalty());
        return Comparator.comparing(penalty)
                .thenComparing(Recipe::getMealPrepScore, Comparator.reverseOrder())
                .thenComparing(Recipe::getName);
    }

    /** Quickest first; recipes with no times last. */
    private static Comparator<Recipe> byTotalTime() {
        return Comparator.comparing(RecipeSummaryResponse::totalMinutes,
                Comparator.nullsLast(Comparator.<Integer>naturalOrder()))
                .thenComparing(Recipe::getName);
    }

    /**
     * Recipes missing the sorted value go last; the name breaks ties so pages are
     * stable.
     */
    private static Sort sqlSort(RecipeSort sort) {
        Sort.Order primary = switch (sort) {
            case PROTEIN -> Sort.Order.desc("proteinGPerServing").nullsLast();
            case CALORIES -> Sort.Order.asc("caloriesPerServing").nullsLast();
            case MEAL_PREP -> Sort.Order.desc("mealPrepScore");
            case NEWEST -> Sort.Order.desc("createdAt");
            case COST -> Sort.Order.asc("costPerServing").nullsLast();
            default -> throw new IllegalStateException("sorted in Java: " + sort);
        };
        return Sort.by(primary, Sort.Order.asc("name"));
    }
}