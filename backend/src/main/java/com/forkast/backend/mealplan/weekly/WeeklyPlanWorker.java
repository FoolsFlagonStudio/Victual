package com.forkast.backend.mealplan.weekly;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.forkast.backend.history.RecipeHistory;
import com.forkast.backend.history.RecipeHistoryRepository;
import com.forkast.backend.mealplan.MealPlan;
import com.forkast.backend.mealplan.MealPlanRepository;
import com.forkast.backend.mealplan.MealPlanService;
import com.forkast.backend.mealplan.PlanSelection;
import com.forkast.backend.mealplan.PlanSource;
import com.forkast.backend.mealplan.planner.PlannerProperties;
import com.forkast.backend.user.User;
import com.forkast.backend.user.UserPreferences;
import com.forkast.backend.user.UserPreferencesRepository;

/**
 * The weekly job's units of work, each in its own transaction. WeeklyPlanJob
 * calls them from
 * outside any transaction, so one user's failure rolls back only that user.
 * They're plain
 * 
 * @Transactional (not REQUIRES_NEW) so a test's transaction can wrap and roll
 *                them back.
 */
@Service
public class WeeklyPlanWorker {

    /** A user whose next plan is due, and the week it's for. */
    public record Due(UUID userId, LocalDate weekStart) {
    }

    /**
     * Plans this old have ended in every timezone (start + 6 days, plus a day of
     * slack).
     */
    static final int DAYS_UNTIL_ENDED_EVERYWHERE = 8;

    private final UserPreferencesRepository preferencesRepository;
    private final MealPlanRepository planRepository;
    private final RecipeHistoryRepository historyRepository;
    private final MealPlanService planService;
    private final PlannerProperties properties;
    private final Clock clock;

    public WeeklyPlanWorker(UserPreferencesRepository preferencesRepository, MealPlanRepository planRepository,
            RecipeHistoryRepository historyRepository, MealPlanService planService, PlannerProperties properties,
            Clock clock) {
        this.preferencesRepository = preferencesRepository;
        this.planRepository = planRepository;
        this.historyRepository = historyRepository;
        this.planService = planService;
        this.properties = properties;
        this.clock = clock;
    }

    // ---------- plans ----------

    /**
     * Users with at least one meal slot and automatic plans on, whose plan is due
     * at `now`, and who don't have it yet.
     */
    @Transactional(readOnly = true)
    public List<Due> dueUsers(Instant now) {
        List<Due> due = new ArrayList<>();
        for (UserPreferences preferences : preferencesRepository.findAllWithUser()) {
            if (preferences.getMealSlots().isEmpty() || !preferences.isAutoPlanEnabled()) {
                continue;
            }
            User user = preferences.getUser();
            Optional<LocalDate> week = PlanTiming.dueWeekStart(now.atZone(user.getZoneId()),
                    preferences.getPlanStartDay(), properties.generateAt(), preferences.getAutoPlanDay());
            if (week.isPresent() && !planRepository.existsByUserIdAndWeekStartDate(user.getId(), week.get())) {
                due.add(new Due(user.getId(), week.get()));
            }
        }
        return due;
    }

    /**
     * Makes one user's plan for that week. Returns false when it already exists (a
     * second run,
     * or the user made one by hand); the unique key on user + week catches a race.
     */
    @Transactional
    public boolean generateFor(UUID userId, LocalDate weekStart) {
        if (planRepository.existsByUserIdAndWeekStartDate(userId, weekStart)) {
            return false;
        }
        UserPreferences preferences = preferencesRepository.findByUserId(userId).orElse(null);
        if (preferences == null || preferences.getMealSlots().isEmpty()) {
            return false;
        }
        MealPlan plan = planService.build(preferences.getUser(), preferences, weekStart, PlanSource.AUTO,
                ThreadLocalRandom.current().nextLong());
        planRepository.saveAndFlush(plan);
        return true;
    }

    // ---------- history ----------

    /**
     * Plans whose week has ended everywhere and whose meals aren't in
     * recipe_history yet.
     */
    @Transactional(readOnly = true)
    public List<UUID> endedPlansWithoutHistory(Instant now) {
        LocalDate cutoff = LocalDate.ofInstant(now, ZoneOffset.UTC).minusDays(DAYS_UNTIL_ENDED_EVERYWHERE);
        return planRepository.findIdsWithoutHistoryStartingBy(cutoff);
    }

    /**
     * One recipe_history row per selection, dated noon on its cook day in the
     * user's timezone
     * (so it reads back as that date anywhere the user is). Returns the rows
     * written.
     */
    @Transactional
    public int recordHistory(UUID planId) {
        MealPlan plan = planRepository.findById(planId).orElse(null);
        if (plan == null || plan.getHistoryRecordedAt() != null) {
            return 0;
        }
        User user = plan.getUser();
        int written = 0;
        for (PlanSelection selection : plan.getSelections()) {
            Instant servedAt = selection.getStartDate().atTime(LocalTime.NOON).atZone(user.getZoneId()).toInstant();
            historyRepository.save(new RecipeHistory(user, selection.getRecipe(), servedAt));
            written++;
        }
        plan.markHistoryRecorded(Instant.now(clock));
        return written;
    }
}