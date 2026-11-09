package com.forkast.backend.ingest;

import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/admin/recipes")
public class AdminRecipeController {

    private final RecipeIngestService ingestService;
    private final RecipeRescoreService rescoreService;
    private final CatalogReportService catalogReportService;
    private final RecipeRemovalService removalService;
    private final RecipeAuditService auditService;

    /** Recipe ids to remove (POST /api/admin/recipes/remove). */
    public record RemoveRequest(List<UUID> ids) {
    }

    public AdminRecipeController(RecipeIngestService ingestService, RecipeRescoreService rescoreService,
            CatalogReportService catalogReportService, RecipeRemovalService removalService,
            RecipeAuditService auditService) {
        this.ingestService = ingestService;
        this.rescoreService = rescoreService;
        this.catalogReportService = catalogReportService;
        this.removalService = removalService;
        this.auditService = auditService;
    }

    /**
     * Always 200 for a well-formed batch; per-recipe problems are listed in
     * "failed".
     */
    @PostMapping("/ingest")
    public RecipeIngestResult ingest(@Valid @RequestBody RecipeIngestBatch batch) {
        return ingestService.ingest(batch.recipes());
    }

    /**
     * Recomputes every recipe's breakfast, lunch, dinner and side scores from its
     * name, category
     * and keywords. Run after changing SlotClassifier (and once after V11, which
     * adds side scores).
     */
    @PostMapping("/rescore")
    public RecipeRescoreService.Result rescore() {
        return rescoreService.rescoreAll();
    }

    /**
     * Why recipes have no complete cost: every gap (unmatched line, unpriced
     * ingredient, or a price that doesn't fit the line's unit), biggest fixes first.
     * Read by data_pipeline/catalog_report.py.
     */
    @GetMapping("/catalog-report")
    public CatalogReportService.Report catalogReport() {
        return catalogReportService.report();
    }

    /**
     * Removes every recipe from one site: DELETE /api/admin/recipes?sourceHost=homechef.com.
     * dryRun=true only counts. 409 when meal plans use them, unless force=true (which
     * deletes those plans).
     */
    @DeleteMapping
    public RecipeRemovalService.Result removeBySource(@RequestParam String sourceHost,
            @RequestParam(defaultValue = "false") boolean dryRun, @RequestParam(defaultValue = "false") boolean force) {
        return removalService.removeBySource(sourceHost, dryRun, force);
    }

    /**
     * Every recipe with its category, slot and side scores, cost and ingredients, for
     * reviewing the catalog by hand. Read by data_pipeline/meal_audit.py.
     */
    @GetMapping("/audit")
    public List<RecipeAuditService.Row> audit() {
        return auditService.rows();
    }

    /**
     * Removes hand-picked recipes (things that aren't a meal): POST
     * /api/admin/recipes/remove?dryRun=true with {"ids": [...]}. 409 when meal plans
     * use them as a main, unless force=true (which deletes those plans).
     */
    @PostMapping("/remove")
    public RecipeRemovalService.IdsResult removeByIds(@RequestBody RemoveRequest request,
            @RequestParam(defaultValue = "false") boolean dryRun, @RequestParam(defaultValue = "false") boolean force) {
        return removalService.removeByIds(request.ids(), dryRun, force);
    }
}
