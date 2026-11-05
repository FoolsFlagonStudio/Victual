package com.forkast.backend.recipe;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RecipeRepository extends JpaRepository<Recipe, UUID>, JpaSpecificationExecutor<Recipe> {

    List<Recipe> findByNameContainingIgnoreCase(String text);

    boolean existsBySourceUrl(String sourceUrl);

    @Query("select r.id from Recipe r")
    List<UUID> findAllIds();

    /** Every recipe with its lines and their ingredients, in one query (the catalog report). */
    @Query("select distinct r from Recipe r left join fetch r.ingredients ri left join fetch ri.ingredient")
    List<Recipe> findAllWithIngredients();

    /**
     * For the planner's shared-ingredient scoring, in one query: each recipe's required
     * ingredients that aren't pantry staples, as (recipe id, ingredient id, is protein)
     * rows. Protein means tagged meat, poultry, fish or shellfish.
     */
    @Query(value = """
            select cast(ri.recipe_id as varchar), cast(ri.ingredient_id as varchar),
                   exists (select 1 from ingredient_tags t where t.ingredient_id = ri.ingredient_id
                           and t.tag in ('MEAT', 'POULTRY', 'FISH', 'SHELLFISH'))
            from recipe_ingredients ri
            join ingredients i on i.id = ri.ingredient_id
            where ri.is_optional = false and i.pantry_staple = false
            """, nativeQuery = true)
    List<Object[]> findPlanningIngredients();

    /**
     * Loads a page of recipes with their labels in one query, instead of one query
     * per recipe.
     */
    @Query("select distinct r from Recipe r left join fetch r.dietaryLabels where r.id in :ids")
    List<Recipe> findWithLabelsByIdIn(@Param("ids") Collection<UUID> ids);

    @Query("select r from Recipe r left join fetch r.ingredients ri left join fetch ri.ingredient where r.id = :id")
    Optional<Recipe> findWithIngredientsById(@Param("id") UUID id);
}