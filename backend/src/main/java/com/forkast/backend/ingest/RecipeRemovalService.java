package com.forkast.backend.ingest;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.forkast.backend.common.exception.ApiException;

/**
 * Removes every recipe scraped from one site (sources whose recipes we decided not
 * to keep, like a meal kit's recipes built on its own sauce bases and seasoning
 * packets). Their lines, steps, labels, favorites and history go with them; a plan
 * using one as a side just loses the side.
 *
 * Meal plans that use one as a main block the removal (409) unless force is set,
 * which deletes those plans too: fine before launch, when they're test plans.
 */
@Service
public class RecipeRemovalService {

    /** What was (or, for a dry run, would be) removed. */
    public record Result(String sourceHost, int recipes, int mealPlans, boolean dryRun) {
    }

    /** The site's recipes, whether the host was saved with "www." or without. */
    private static final String SAME_HOST = "regexp_replace(lower(source_host), '^www\\.', '') = lower(?)";
    private static final String RECIPES = "(select id from recipes where " + SAME_HOST + ")";

    private final JdbcTemplate jdbc;

    public RecipeRemovalService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public Result removeBySource(String sourceHost, boolean dryRun, boolean force) {
        String host = sourceHost == null ? "" : sourceHost.trim().replaceFirst("^www\\.", "");
        if (host.isEmpty()) {
            throw ApiException.badRequest("sourceHost is required (e.g. homechef.com).");
        }
        Integer recipes = jdbc.queryForObject("select count(*) from recipes where " + SAME_HOST,
                Integer.class, host);
        Integer plans = jdbc.queryForObject(
                "select count(distinct meal_plan_id) from plan_selections where recipe_id in " + RECIPES,
                Integer.class, host);
        int recipeCount = recipes == null ? 0 : recipes;
        int planCount = plans == null ? 0 : plans;
        if (dryRun || recipeCount == 0) {
            return new Result(host, recipeCount, planCount, true);
        }
        if (planCount > 0 && !force) {
            throw ApiException.conflict(planCount + " meal plans use " + host
                    + " recipes. Add force=true to delete those plans too.");
        }

        jdbc.update("delete from meal_plans where id in (select meal_plan_id from plan_selections where recipe_id in "
                + RECIPES + ")", host);
        // sides: the FK sets side_recipe_id to null; clear the rest of the side with it
        jdbc.update("update plan_selections set side_portion_multiplier = null, side_estimated_cost = null, "
                + "side_chosen = false where side_recipe_id in " + RECIPES, host);
        for (String table : new String[] { "favorites", "recipe_history", "recipe_dietary_labels",
                "recipe_ingredients", "recipe_steps" }) {
            jdbc.update("delete from " + table + " where recipe_id in " + RECIPES, host);
        }
        jdbc.update("delete from recipes where " + SAME_HOST, host);
        return new Result(host, recipeCount, planCount, false);
    }
}
