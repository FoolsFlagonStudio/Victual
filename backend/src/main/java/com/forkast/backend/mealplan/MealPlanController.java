package com.forkast.backend.mealplan;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.forkast.backend.auth.AuthenticatedUser;
import com.forkast.backend.common.PageResponse;
import com.forkast.backend.mealplan.dto.AddMealRequest;
import com.forkast.backend.mealplan.dto.GeneratePlanRequest;
import com.forkast.backend.mealplan.dto.MealPlanDetailResponse;
import com.forkast.backend.mealplan.dto.MealPlanSummaryResponse;
import com.forkast.backend.mealplan.dto.SelectionUpdateRequest;
import com.forkast.backend.mealplan.dto.SuggestionResponse;
import com.forkast.backend.mealplan.dto.SwapRequest;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

@RestController
@RequestMapping("/api/meal-plans")
public class MealPlanController {

    private final MealPlanService mealPlanService;
    private final MealPlanEditService editService;

    public MealPlanController(MealPlanService mealPlanService, MealPlanEditService editService) {
        this.mealPlanService = mealPlanService;
        this.editService = editService;
    }

    /**
     * The body is optional: no body (or no weekStart) plans the next plan start
     * day.
     */
    @PostMapping("/generate")
    @ResponseStatus(HttpStatus.CREATED)
    public MealPlanDetailResponse generate(@AuthenticationPrincipal AuthenticatedUser currentUser,
            @RequestBody(required = false) GeneratePlanRequest request) {
        return mealPlanService.generate(currentUser.id(), request == null ? null : request.weekStart());
    }

    @GetMapping
    public PageResponse<MealPlanSummaryResponse> list(@AuthenticationPrincipal AuthenticatedUser currentUser,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "10") @Min(1) @Max(50) int size) {
        return mealPlanService.list(currentUser.id(), page, size);
    }

    /**
     * The plan covering today in the user's timezone. A literal path, so it wins
     * over /{id}.
     */
    @GetMapping("/current")
    public MealPlanDetailResponse current(@AuthenticationPrincipal AuthenticatedUser currentUser) {
        return mealPlanService.current(currentUser.id());
    }

    @GetMapping("/{id}")
    public MealPlanDetailResponse detail(@AuthenticationPrincipal AuthenticatedUser currentUser,
            @PathVariable UUID id) {
        return mealPlanService.detail(currentUser.id(), id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser currentUser, @PathVariable UUID id) {
        mealPlanService.delete(currentUser.id(), id);
    }

    // ---------- editing ----------

    /** Every unlocked selection that hasn't started is drawn again. */
    @PostMapping("/{id}/regenerate")
    public MealPlanDetailResponse regenerate(@AuthenticationPrincipal AuthenticatedUser currentUser,
            @PathVariable UUID id) {
        return editService.regenerate(currentUser.id(), id);
    }

    /**
     * {"locked": true|false}: a locked selection keeps its recipe when the plan is
     * regenerated.
     */
    @PatchMapping("/{id}/selections/{selectionId}")
    public MealPlanDetailResponse updateSelection(@AuthenticationPrincipal AuthenticatedUser currentUser,
            @PathVariable UUID id, @PathVariable UUID selectionId, @Valid @RequestBody SelectionUpdateRequest request) {
        return editService.setLocked(currentUser.id(), id, selectionId, request.locked());
    }

    /**
     * {"recipeId": "..."} to use that recipe; no body (or no recipeId) to pick one
     * for me.
     */
    @PostMapping("/{id}/selections/{selectionId}/swap")
    public MealPlanDetailResponse swap(@AuthenticationPrincipal AuthenticatedUser currentUser,
            @PathVariable UUID id, @PathVariable UUID selectionId,
            @RequestBody(required = false) SwapRequest request) {
        return editService.swap(currentUser.id(), id, selectionId, request == null ? null : request.recipeId());
    }

    /**
     * Up to 5 recipes that could replace this selection, best first, with the cost
     * change of each.
     */
    @GetMapping("/{id}/selections/{selectionId}/suggestions")
    public List<SuggestionResponse> suggestions(@AuthenticationPrincipal AuthenticatedUser currentUser,
            @PathVariable UUID id, @PathVariable UUID selectionId) {
        return editService.suggestions(currentUser.id(), id, selectionId);
    }

    /**
     * Puts a recipe on one date and slot for one day, creating that week's plan
     * when there isn't
     * one. 409 when the slot already has a meal (swap it instead) or the recipe is
     * already in the
     * plan; 400 when the day is over.
     */
    @PostMapping("/meals")
    @ResponseStatus(HttpStatus.CREATED)
    public MealPlanDetailResponse addMeal(@AuthenticationPrincipal AuthenticatedUser currentUser,
            @Valid @RequestBody AddMealRequest request) {
        return editService.addMeal(currentUser.id(), request.date(), request.slot(), request.recipeId());
    }

    // ---------- sides ----------

    /**
     * {"recipeId": "..."} to use that recipe as the side; no body (or no recipeId)
     * to pick one.
     */
    @PostMapping("/{id}/selections/{selectionId}/side")
    public MealPlanDetailResponse setSide(@AuthenticationPrincipal AuthenticatedUser currentUser,
            @PathVariable UUID id, @PathVariable UUID selectionId,
            @RequestBody(required = false) SwapRequest request) {
        return editService.setSide(currentUser.id(), id, selectionId, request == null ? null : request.recipeId());
    }

    @DeleteMapping("/{id}/selections/{selectionId}/side")
    public MealPlanDetailResponse removeSide(@AuthenticationPrincipal AuthenticatedUser currentUser,
            @PathVariable UUID id, @PathVariable UUID selectionId) {
        return editService.removeSide(currentUser.id(), id, selectionId);
    }

    /** Sides that could go with this selection's main, best first, with the cost change of each. */
    @GetMapping("/{id}/selections/{selectionId}/side-suggestions")
    public List<SuggestionResponse> sideSuggestions(@AuthenticationPrincipal AuthenticatedUser currentUser,
            @PathVariable UUID id, @PathVariable UUID selectionId) {
        return editService.sideSuggestions(currentUser.id(), id, selectionId);
    }
}
