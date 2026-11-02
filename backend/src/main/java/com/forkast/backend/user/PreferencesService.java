package com.forkast.backend.user;

import java.time.DayOfWeek;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.forkast.backend.common.exception.ApiException;
import com.forkast.backend.diet.DietaryLabel;
import com.forkast.backend.diet.DietaryLabelRepository;
import com.forkast.backend.user.dto.PreferencesRequest;
import com.forkast.backend.user.dto.PreferencesResponse;

@Service
public class PreferencesService {
    private final UserPreferencesRepository userPreferencesRepository;
    private final UserRepository userRepository;
    private final DietaryLabelRepository dietaryLabelRepository;

    public PreferencesService(UserPreferencesRepository userPreferencesRepository,
            UserRepository userRepository,
            DietaryLabelRepository dietaryLabelRepository) {
        this.userPreferencesRepository = userPreferencesRepository;
        this.userRepository = userRepository;
        this.dietaryLabelRepository = dietaryLabelRepository;
    }

    // create
    @Transactional
    public PreferencesResponse create(UUID userId, PreferencesRequest request) {
        if (userPreferencesRepository.existsByUserId(userId)) {
            throw ApiException.conflict("Preferences already exist. Use PUT to update them.");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("User not found."));

        UserPreferences preferences = new UserPreferences(user, request.weeklyBudget());
        apply(preferences, request);
        userPreferencesRepository.saveAndFlush(preferences);

        return PreferencesResponse.from(preferences);
    }

    // get
    @Transactional(readOnly = true)
    public PreferencesResponse getUserPreferences(UUID userId) {
        return PreferencesResponse.from(findPreferences(userId));
    }

    // replace
    @Transactional
    public PreferencesResponse replace(UUID userId, PreferencesRequest request) {
        UserPreferences preferences = findPreferences(userId);
        apply(preferences, request);
        userPreferencesRepository.flush();
        return PreferencesResponse.from(preferences);
    }

    // ---------- helpers ----------

    /**
     * Copies every field from the request onto the entity. Used by create and
     * replace.
     */
    private void apply(UserPreferences preferences, PreferencesRequest request) {
        // 1. Cross-field rule
        if (request.maxCaloriesPerMeal() != null
                && request.maxCaloriesPerDay() != null
                && request.maxCaloriesPerDay() < request.maxCaloriesPerMeal()) {
            throw ApiException.badRequest("Daily calories must be at least the per-meal limit.");
        }

        // 2. Simple fields
        preferences.setWeeklyBudget(request.weeklyBudget());
        preferences.setHouseholdServingSize(request.householdServingSize());
        preferences.setMaxCaloriesPerMeal(request.maxCaloriesPerMeal());
        preferences.setMaxCaloriesPerDay(request.maxCaloriesPerDay());
        preferences.setProteinTargetGrams(request.proteinTargetGrams());
        preferences.setCarbsTargetGrams(request.carbsTargetGrams());
        preferences.setFatTargetGrams(request.fatTargetGrams());
        preferences.setRepeatAvoidanceDays(request.repeatAvoidanceDays());
        preferences.setPlanStartDay(request.planStartDay());
        preferences.setPrefersMealPrep(Boolean.TRUE.equals(request.prefersMealPrep()));
        preferences.setLeftoversForLunch(Boolean.TRUE.equals(request.leftoversForLunch()));
        preferences.setAutoPlanEnabled(!Boolean.FALSE.equals(request.autoPlanEnabled()));
        // the night before the start day is the default, so it's stored as null and
        // follows the start day if that changes
        DayOfWeek autoDay = request.autoPlanDay();
        preferences.setAutoPlanDay(
                autoDay == null || autoDay == request.planStartDay().minus(1) ? null : autoDay);

        // 3. Dietary labels: every id must exist
        Set<UUID> ids = request.dietaryLabelIds() == null ? Set.of() : request.dietaryLabelIds();
        List<DietaryLabel> labels = dietaryLabelRepository.findAllById(ids);
        if (labels.size() != ids.size()) {
            throw ApiException.badRequest("One or more dietary restrictions are invalid.");
        }
        preferences.replaceDietaryRestrictions(new HashSet<>(labels));

        // 4. Meal slots
        preferences.replaceMealSlots(request.mealSlots());
    }

    private UserPreferences findPreferences(UUID userId) {
        return userPreferencesRepository.findByUserId(userId)
                .orElseThrow(() -> ApiException.notFound("Preferences have not been set up yet."));
    }
}