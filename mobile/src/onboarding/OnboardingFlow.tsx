import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, BackHandler, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { todayISO, weekStartFor } from '@/lib/dates';
import { mealPlansApi } from '@/api/mealPlans';
import { preferencesApi, type DietaryLabel } from '@/api/preferences';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useTheme } from '@/theme/themeContext';
import { BuildingPlan } from './BuildingPlan';
import { onboardingDraft } from './draft';
import { ProgressDots } from './components';
import { STEPS, canContinue, initialAnswers, toPreferencesRequest, type Answers, type Step } from './model';
import { Allergies, Budget, Diet, Household, Intro, Macros, Meals, PerWeek, Review, WeekStart, type StepProps } from './steps';

const MIN_BUILDING_MS = 2600;

export function OnboardingFlow() {
  const { colors } = useTheme();
  const { authedRequest, updateUser, user } = useAuth();
  const userId = user?.id ?? '';
  const insets = useSafeAreaInsets();

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [labels, setLabels] = useState<DietaryLabel[] | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [areaHeight, setAreaHeight] = useState(0);
  const [restored, setRestored] = useState(false);
  const step = STEPS[index];

  // Resume a saved draft (app closed mid-onboarding), then keep it up to date.
  useEffect(() => {
    let cancelled = false;
    onboardingDraft.load(userId).then((draft) => {
      if (cancelled) return;
      if (draft) {
        setAnswers(draft.answers);
        setIndex(draft.index);
      }
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!restored || building) return;
    const t = setTimeout(() => onboardingDraft.save(userId, { index, answers }), 300);
    return () => clearTimeout(t);
  }, [restored, building, userId, index, answers]);

  // Dietary label ids are needed to save diets/allergies; fetch early.
  useEffect(() => {
    preferencesApi.dietaryLabels().then(setLabels).catch(() => {});
  }, []);

  const update: StepProps['update'] = useCallback(
    (patch) => setAnswers((a) => ({ ...a, ...(typeof patch === 'function' ? patch(a) : patch) })),
    [],
  );

  // Fade + slight slide between steps. Runs after the new step has mounted;
  // starting it in goTo() raced the remount and left the step invisible.
  const anim = useRef(new Animated.Value(0)).current;
  const direction = useRef(1);
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim, index]);

  const goTo = useCallback(
    (next: number) => {
      direction.current = next > index ? 1 : -1;
      setIndex(next);
    },
    [index],
  );

  // Android back button steps backwards instead of leaving onboarding.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (building || index === 0) return false;
      goTo(index - 1);
      return true;
    });
    return () => sub.remove();
  }, [building, index, goTo]);

  async function finish() {
    setBuilding(true);
    setBuildError(null);
    const started = Date.now();
    try {
      const allLabels = labels ?? (await preferencesApi.dietaryLabels());
      setLabels(allLabels);
      const body = toPreferencesRequest(answers, allLabels);
      try {
        await preferencesApi.create(authedRequest, body);
      } catch (e) {
        // Already saved (e.g. a retry after a dropped response): replace instead.
        if (e instanceof ApiError && e.status === 409) await preferencesApi.replace(authedRequest, body);
        else throw e;
      }
      // Build the first week right away. If it fails, Home shows "Plan my week" instead.
      // This week, from today on (the planner skips days that are already over).
      await mealPlansApi.generate(authedRequest, weekStartFor(todayISO(), answers.weekStart)).catch(() => null);
      await new Promise((r) => setTimeout(r, Math.max(0, MIN_BUILDING_MS - (Date.now() - started))));
      await onboardingDraft.clear(userId);
      updateUser({ onboardingCompleted: true });
      router.replace('/home');
    } catch (e) {
      setBuildError(e instanceof ApiError ? e.message : "We couldn't save your plan settings. Check your connection and try again.");
    }
  }

  // A brief blank while the draft loads beats flashing step 1 and then jumping.
  if (!restored) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  if (building) {
    return <BuildingPlan error={buildError} onRetry={finish} onBack={() => setBuilding(false)} />;
  }

  const stepProps = { answers, update };
  const content: Record<Step, ReactNode> = {
    intro: <Intro onStart={() => goTo(1)} />,
    budget: <Budget {...stepProps} />,
    household: <Household {...stepProps} />,
    meals: <Meals {...stepProps} />,
    perWeek: <PerWeek {...stepProps} />,
    weekStart: <WeekStart {...stepProps} />,
    diet: <Diet {...stepProps} />,
    allergies: <Allergies {...stepProps} />,
    macros: <Macros {...stepProps} />,
    review: <Review answers={answers} onEdit={(s) => goTo(STEPS.indexOf(s))} />,
  };

  const macrosEmpty = Object.values(answers.macros).every((v) => !v);
  const nextLabel = step === 'review' ? 'Build my plan' : step === 'macros' && macrosEmpty ? 'Skip' : 'Next';
  // Designs place content ~120pt below the progress dots when the area between
  // dots and footer is ~710pt tall (402x874 frame); shrink that gap on shorter phones.
  const contentTop = Math.round(Math.min(120, Math.max(16, (areaHeight - 470) * 0.5)));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.top, { paddingTop: insets.top + 14 }]}>
        <ProgressDots count={STEPS.length} current={index} onJump={goTo} />
      </View>

      <ScrollView
        onLayout={(e) => setAreaHeight(e.nativeEvent.layout.height)}
        contentContainerStyle={[styles.scroll, { paddingTop: contentTop }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Animated.View
          key={step}
          style={[
            styles.column,
            {
              opacity: anim,
              transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [16 * direction.current, 0] }) }],
            },
          ]}
        >
          {content[step]}
        </Animated.View>
      </ScrollView>

      {step !== 'intro' && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <Pressable onPress={() => goTo(index - 1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Previous">
            <Text variant="buttonLarge" style={[styles.previous, { color: colors.selected }]}>
              PREVIOUS
            </Text>
          </Pressable>
          <Button
            label={nextLabel}
            size="lg"
            disabled={!canContinue(step, answers)}
            onPress={step === 'review' ? finish : () => goTo(index + 1)}
          />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 24 },
  scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 24, paddingBottom: 24 },
  column: { width: '100%', maxWidth: 330 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 30, paddingTop: 12 },
  previous: { textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});
