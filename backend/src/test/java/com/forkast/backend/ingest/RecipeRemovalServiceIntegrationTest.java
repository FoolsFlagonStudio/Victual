package com.forkast.backend.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.forkast.backend.common.exception.ApiException;

/** Removing a site's recipes, against the real database; everything rolls back. */
@SpringBootTest
@ActiveProfiles("local")
@Transactional
class RecipeRemovalServiceIntegrationTest {

    @Autowired
    private RecipeRemovalService removalService;
    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void aDryRunCountsWithoutDeleting() {
        String host = jdbc.queryForObject("select source_host from recipes where source_host is not null limit 1",
                String.class);
        Integer before = jdbc.queryForObject("select count(*) from recipes", Integer.class);

        RecipeRemovalService.Result result = removalService.removeBySource(host, true, false);

        assertThat(result.dryRun()).isTrue();
        assertThat(result.recipes()).isPositive();
        assertThat(jdbc.queryForObject("select count(*) from recipes", Integer.class)).isEqualTo(before);
    }

    @Test
    void removingASiteDeletesItsRecipesAndEverythingHangingOffThem() {
        String host = jdbc.queryForObject("select source_host from recipes where source_host is not null "
                + "group by source_host order by count(*) limit 1", String.class);

        RecipeRemovalService.Result result = removalService.removeBySource(host, false, true);

        assertThat(result.recipes()).isPositive();
        assertThat(jdbc.queryForObject("select count(*) from recipes where source_host = ?", Integer.class, host))
                .isZero();
        assertThat(jdbc.queryForObject("select count(*) from recipe_ingredients ri "
                + "left join recipes r on r.id = ri.recipe_id where r.id is null", Integer.class)).isZero();
    }

    @Test
    void anUnknownSiteRemovesNothingAndABlankOneIsRefused() {
        assertThat(removalService.removeBySource("no-such-site.example", false, false).recipes()).isZero();
        assertThatThrownBy(() -> removalService.removeBySource("  ", false, false)).isInstanceOf(ApiException.class);
    }
}
