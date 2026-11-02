package com.forkast.backend.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Comparator;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.forkast.backend.recipe.RecipeRepository;

/** The gap report against the real catalog: its numbers agree with the stored costs. */
@SpringBootTest
@ActiveProfiles("local")
@Transactional
class CatalogReportServiceIntegrationTest {

    @Autowired
    private CatalogReportService reportService;
    @Autowired
    private RecipeRepository recipeRepository;

    @Test
    void everyRecipeIsCompleteOrHasAGap() {
        CatalogReportService.Report report = reportService.report();

        assertThat(report.recipes()).isEqualTo((int) recipeRepository.count());
        assertThat(report.complete() + report.incomplete()).isEqualTo(report.recipes());
        assertThat(report.gaps()).allSatisfy(g -> {
            assertThat(g.completes()).isBetween(0, g.recipes());
            assertThat(g.recipes()).isBetween(1, g.lines());
        });
        assertThat(report.gaps().stream().mapToInt(CatalogReportService.Gap::lines).sum())
                .isEqualTo(report.gapLines());
    }

    @Test
    void biggestFixesComeFirst() {
        CatalogReportService.Report report = reportService.report();

        assertThat(report.gaps()).isSortedAccordingTo(
                Comparator.comparingInt(CatalogReportService.Gap::completes).reversed()
                        .thenComparing(Comparator.comparingInt(CatalogReportService.Gap::recipes).reversed())
                        .thenComparing(CatalogReportService.Gap::name));
    }
}
