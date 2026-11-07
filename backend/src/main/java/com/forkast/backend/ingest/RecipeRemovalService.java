package com.forkast.backend.ingest;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.forkast.backend.common.exception.ApiException;

/**
 * Removes recipes we decided not to keep: every recipe from one site (a meal kit's
 * recipes built on its own sauce bases and seasoning packets), or a hand-picked list
 * (things that aren't a meal, like "Flour Tortillas" or "Pizza Dough"). Their lines,
 * steps, labels, favorites and history go with them; a plan using one as a side just
 * loses the side.
 *
 * Meal plans that use one as a main block the removal (409) unless force is set,
 * which deletes those plans too: fine before launch, when they're test plans.
 */
@Service
public class RecipeRemovalService {

    /** What was (or, for a dry run, would be) removed from one site. */
    public record Result(String sourceHost, int recipes, int mealPlans, boolean dryRun) {
    }

    /** What was (or would be) removed from a list of ids; notFound lists ids with no recipe. */
    public record IdsResult(int recipes, int mealPlans, boolean dryRun, List<UUID> notFound) {
    }

    /** The site's recipes, whether the host was saved with "www." or without. */
    private static final String SAME_HOST = "regexp_replace(lower(source_host), '^www\\.', '') = lower(?)";

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
        List<UUID> ids = jdbc.queryForList("select id from recipes where " + SAME_HOST, UUID.class, host);
        int plans = remove(ids, dryRun, force, host + " recipes");
        return new Result(host, ids.size(), plans, dryRun || ids.isEmpty());
    }

    @Transactional
    public IdsResult removeByIds(Collection<UUID> requested, boolean dryRun, boolean force) {
        if (requested == null || requested.isEmpty()) {
            throw ApiException.badRequest("ids is required.");
        }
        Set<UUID> wanted = new LinkedHashSet<>(requested);
        List<UUID> found = jdbc.queryForList("select id from recipes where id in (" + placeholders(wanted.size())
                + ")", UUID.class, wanted.toArray());
        List<UUID> notFound = new ArrayList<>(wanted);
        notFound.removeAll(found);
        int plans = remove(found, dryRun, force, "these recipes");
        return new IdsResult(found.size(), plans, dryRun || found.isEmpty(), Collections.unmodifiableList(notFound));
    }

    /** Deletes the recipes and everything hanging off them; returns how many meal plans use them as a main. */
    private int remove(List<UUID> ids, boolean dryRun, boolean force, String what) {
        if (ids.isEmpty()) {
            return 0;
        }
        String in = "(" + placeholders(ids.size()) + ")";
        Object[] args = ids.toArray();
        Integer plans = jdbc.queryForObject(
                "select count(distinct meal_plan_id) from plan_selections where recipe_id in " + in,
                Integer.class, args);
        int planCount = plans == null ? 0 : plans;
        if (dryRun) {
            return planCount;
        }
        if (planCount > 0 && !force) {
            throw ApiException.conflict(planCount + " meal plans use " + what
                    + ". Add force=true to delete those plans too.");
        }

        jdbc.update("delete from meal_plans where id in (select meal_plan_id from plan_selections where recipe_id in "
                + in + ")", args);
        // sides: the FK sets side_recipe_id to null; clear the rest of the side with it
        jdbc.update("update plan_selections set side_portion_multiplier = null, side_estimated_cost = null, "
                + "side_chosen = false where side_recipe_id in " + in, args);
        for (String table : new String[] { "favorites", "recipe_history", "recipe_dietary_labels",
                "recipe_ingredients", "recipe_steps" }) {
            jdbc.update("delete from " + table + " where recipe_id in " + in, args);
        }
        jdbc.update("delete from recipes where id in " + in, args);
        return planCount;
    }

    private static String placeholders(int count) {
        return String.join(",", Collections.nCopies(count, "?"));
    }
}
