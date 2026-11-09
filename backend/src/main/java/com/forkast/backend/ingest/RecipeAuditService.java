package com.forkast.backend.ingest;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Every recipe with how the classifiers filed it, for reviewing the catalog by hand
 * (data_pipeline/meal_audit.py writes it to a CSV). Read-only.
 */
@Service
public class RecipeAuditService {

    /** One recipe: what it is, where it's from, and its slot and side scores. */
    public record Row(UUID id, String name, String sourceHost, String category, String keywords,
            int breakfast, int lunch, int dinner, int side, BigDecimal costPerServing, String ingredients) {
    }

    private final JdbcTemplate jdbc;

    public RecipeAuditService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Row> rows() {
        return jdbc.query("""
                select r.id, r.name, r.source_host, r.category, r.keywords,
                       r.breakfast_score, r.lunch_score, r.dinner_score, r.side_score, r.cost_per_serving,
                       (select string_agg(coalesce(i.name, ri.parsed_name), '; ' order by ri.position)
                          from recipe_ingredients ri left join ingredients i on i.id = ri.ingredient_id
                         where ri.recipe_id = r.id) as ingredients
                  from recipes r
                 order by r.name
                """, (rs, i) -> new Row(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getString("source_host"), rs.getString("category"), rs.getString("keywords"),
                rs.getInt("breakfast_score"), rs.getInt("lunch_score"), rs.getInt("dinner_score"),
                rs.getInt("side_score"), rs.getBigDecimal("cost_per_serving"), rs.getString("ingredients")));
    }
}
