import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Vibration, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { recipesApi, type RecipeDetail } from '@/api/recipes';
import { useAuth } from '@/auth/AuthProvider';
import { Sheet } from '@/components/app/Sheet';
import { ErrorNote, Loading, tap } from '@/components/app/ui';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { ingredientText } from '@/lib/format';
import { cancelTimerAlert, scheduleTimerAlert } from '@/lib/timerAlerts';
import { Icon } from '@/theme/icons';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/themeContext';

/** First time span in a step: "15-20 minutes" -> 15 min, "1 hour" -> 60 min. */
export function stepTimerSeconds(text: string): number | null {
  const m = text.match(/(\d+)(?:\s*(?:-|–|to)\s*\d+)?\s*(hours?|hrs?|minutes?|mins?)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return /^h/i.test(m[2]) ? n * 3600 : n * 60;
}

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

export default function CookMode() {
  useKeepAwake(); // screen stays on while cooking
  const { id, servings } = useLocalSearchParams<{ id: string; servings?: string }>();
  const { authedRequest } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);
  const timers = useStepTimers(recipe?.name ?? '');

  useEffect(() => {
    recipesApi
      .detail(authedRequest, id, servings ? Number(servings) : undefined)
      .then(setRecipe)
      .catch(() => setError("Couldn't load this recipe."));
  }, [authedRequest, id, servings]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  if (!recipe) {
    return <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 40 }]}>{error ? <ErrorNote message={error} /> : <Loading />}</View>;
  }

  const total = recipe.steps.length;
  const current = recipe.steps[step];

  if (done) return <Done recipe={recipe} onClose={close} />;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <View style={styles.top}>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Exit cook mode">
          <Icon.close size={26} color={colors.text} />
        </Pressable>
        <Text variant="label" color="subtle" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
          {recipe.name}
        </Text>
        <Pressable onPress={() => setShowIngredients(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Show ingredients">
          <Icon.groceries size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={[styles.progress, { backgroundColor: colors.primary }]} accessibilityRole="progressbar" accessibilityLabel={`Step ${step + 1} of ${total}`}>
        <View style={{ width: `${((step + 1) / total) * 100}%`, height: '100%', backgroundColor: colors.selected, borderRadius: 2 }} />
      </View>
      <Text variant="label" color="subtle" style={{ textAlign: 'center', marginTop: 10 }}>
        Step {step + 1} of {total}
      </Text>

      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="body" color="text" style={styles.stepText} accessibilityLiveRegion="polite">
          {current.text}
        </Text>
        <StepTimer seconds={stepTimerSeconds(current.text)} state={timers.get(step, stepTimerSeconds(current.text))} onStart={() => timers.start(step, stepTimerSeconds(current.text))} onPause={() => timers.pause(step)} onReset={() => timers.reset(step)} />
      </ScrollView>

      {/* Timers left running on other steps keep counting; tap one to go back to it. */}
      {timers.others(step).length ? (
        <View style={styles.otherTimers}>
          {timers.others(step).map((t) => (
            <Pressable key={t.step} onPress={() => setStep(t.step)} accessibilityRole="button" accessibilityLabel={`Step ${t.step + 1} timer, ${t.left === 0 ? "time's up" : clock(t.left)}. Go to step`} style={[styles.otherTimer, { backgroundColor: t.left === 0 ? colors.danger : colors.primary }]}>
              <Icon.resetTimer size={16} color={t.left === 0 ? colors.background : colors.onAccent} strokeWidth={2} />
              <Text variant="label" style={{ color: t.left === 0 ? colors.background : colors.onAccent }}>
                Step {t.step + 1} · {t.left === 0 ? "Time's up" : clock(t.left)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.footer}>
        <Pressable onPress={() => setStep((s) => s - 1)} disabled={step === 0} hitSlop={12} accessibilityRole="button" accessibilityLabel="Previous step" style={{ opacity: step === 0 ? 0.3 : 1 }}>
          <Text variant="buttonLarge" style={{ color: colors.selected }}>
            PREVIOUS
          </Text>
        </Pressable>
        <Button label={step === total - 1 ? 'Finish' : 'Next'} size="lg" onPress={() => (step === total - 1 ? setDone(true) : setStep((s) => s + 1))} />
      </View>

      <Sheet visible={showIngredients} onClose={() => setShowIngredients(false)} title="Ingredients">
        {recipe.ingredients.map((l, i) => (
          <Text key={i} variant="option" color="text" style={{ paddingVertical: 6 }}>
            {ingredientText(l)}
            {l.prepNote ? `, ${l.prepNote}` : ''}
            {l.optional ? ' (optional)' : ''}
          </Text>
        ))}
      </Sheet>
    </View>
  );
}

type TimerState = { left: number; endsAt: number | null; alertId: string | null };

/**
 * Every step's timer, owned by the screen so a running timer keeps going when you
 * move to another step. Based on the clock, so it stays right while the app is in
 * the background, and each running timer schedules a notification for when it ends.
 */
function useStepTimers(recipeName: string) {
  const [timers, setTimers] = useState<Record<number, TimerState>>({});
  const [, setTick] = useState(0);
  const buzzed = useRef(new Set<number>());
  const latest = useRef(timers);
  useEffect(() => {
    latest.current = timers;
  });
  const running = Object.values(timers).some((t) => t.endsAt != null);

  // Tick while anything is running; finished timers stop and buzz once.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setTick((n) => n + 1);
      const now = Date.now();
      const finished = Object.entries(latest.current).filter(([, v]) => v.endsAt != null && v.endsAt <= now);
      if (!finished.length) return;
      setTimers((all) => {
        const next = { ...all };
        for (const [k] of finished) next[Number(k)] = { left: 0, endsAt: null, alertId: null };
        return next;
      });
      if (finished.some(([k]) => !buzzed.current.has(Number(k))) && Platform.OS !== 'web') Vibration.vibrate([0, 400, 200, 400]);
      finished.forEach(([k]) => buzzed.current.add(Number(k)));
    }, 250);
    return () => clearInterval(t);
  }, [running]);

  // Leaving cook mode cancels any alerts still pending.
  useEffect(() => () => Object.values(latest.current).forEach((t) => cancelTimerAlert(t.alertId)), []);

  const leftOf = (t: TimerState) => (t.endsAt == null ? t.left : Math.max(0, Math.round((t.endsAt - Date.now()) / 1000)));

  const start = useCallback(
    (step: number, seconds: number | null) => {
      if (!seconds) return;
      const cur = latest.current[step];
      const from = !cur || cur.left === 0 ? seconds : cur.left;
      const endsAt = Date.now() + from * 1000;
      buzzed.current.delete(step);
      setTimers((all) => ({ ...all, [step]: { left: from, endsAt, alertId: null } }));
      scheduleTimerAlert(endsAt, recipeName, step).then((alertId) => {
        // Paused or reset before the alert was scheduled: cancel it straight away.
        if (latest.current[step]?.endsAt !== endsAt) return cancelTimerAlert(alertId);
        setTimers((all) => ({ ...all, [step]: { ...all[step], alertId } }));
      });
    },
    [recipeName],
  );

  const stop = useCallback((step: number, reset: boolean) => {
    const cur = latest.current[step];
    if (!cur) return;
    cancelTimerAlert(cur.alertId);
    buzzed.current.delete(step);
    setTimers((all) => {
      const next = { ...all };
      if (reset) delete next[step];
      else next[step] = { left: leftOf(cur), endsAt: null, alertId: null };
      return next;
    });
  }, []);

  return {
    get: (step: number, seconds: number | null) => {
      const t = timers[step];
      return t ? { left: leftOf(t), running: t.endsAt != null } : { left: seconds ?? 0, running: false };
    },
    start,
    pause: (step: number) => stop(step, false),
    reset: (step: number) => stop(step, true),
    /** Timers on other steps that are running or have just finished. */
    others: (step: number) =>
      Object.entries(timers)
        .map(([k, t]) => ({ step: Number(k), left: leftOf(t), running: t.endsAt != null }))
        .filter((t) => t.step !== step && (t.running || t.left === 0))
        .sort((a, b) => a.step - b.step),
  };
}

/** Countdown for steps that mention a time. State lives in useStepTimers. */
function StepTimer({
  seconds,
  state,
  onStart,
  onPause,
  onReset,
}: {
  seconds: number | null;
  state: { left: number; running: boolean };
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
}) {
  const { colors } = useTheme();
  if (!seconds) return null;
  const { left, running } = state;

  return (
    <View style={styles.timer}>
      <Pressable
        onPress={() => {
          tap();
          onReset();
        }}
        accessibilityRole="button"
        accessibilityLabel="Reset timer"
        style={[styles.timerButton, { backgroundColor: colors.primary }]}
      >
        <Icon.resetTimer size={28} color={colors.onAccent} strokeWidth={1.75} />
      </Pressable>
      <View style={{ alignItems: 'center', minWidth: 140 }}>
        <Text style={{ fontFamily: fontFamily('ui', 500), fontSize: 60, lineHeight: 70, color: colors.textStrong }} accessibilityLabel={`Timer ${clock(left)}`}>
          {clock(left)}
        </Text>
        {left === 0 ? (
          <Text variant="label" color="danger" accessibilityLiveRegion="assertive">
            Time's up
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={() => {
          tap();
          if (running) onPause();
          else onStart();
        }}
        accessibilityRole="button"
        accessibilityLabel={running ? 'Pause timer' : 'Start timer'}
        style={[styles.timerButton, { backgroundColor: colors.primary }]}
      >
        {running ? <Icon.pause size={28} color={colors.onAccent} strokeWidth={1.75} /> : <Icon.play size={28} color={colors.onAccent} strokeWidth={1.75} />}
      </Pressable>
    </View>
  );
}

const RATINGS_KEY = 'victual.ratings';

/** Finished screen with a quick thumbs up/down. Ratings stay on the device until the backend stores them. */
function Done({ recipe, onClose }: { recipe: RecipeDetail; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const rate = useMemo(
    () => async (r: 'up' | 'down') => {
      tap();
      setRating(r);
      try {
        const all = JSON.parse((await AsyncStorage.getItem(RATINGS_KEY)) ?? '{}');
        await AsyncStorage.setItem(RATINGS_KEY, JSON.stringify({ ...all, [recipe.id]: r }));
      } catch {
        /* best effort */
      }
    },
    [recipe.id],
  );

  return (
    <View style={[styles.screen, styles.done, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Icon.done size={72} color={colors.primary} strokeWidth={1.5} />
      <Text variant="title" color="heading" style={{ textAlign: 'center', marginTop: 24 }}>
        Enjoy your meal!
      </Text>
      <Text variant="lead" color="subtle" style={{ textAlign: 'center', marginTop: 10 }}>
        How was the {recipe.name.toLowerCase()}?
      </Text>
      <View style={{ flexDirection: 'row', gap: 26, marginTop: 26 }}>
        {(['up', 'down'] as const).map((r) => {
          const Glyph = r === 'up' ? Icon.rateUp : Icon.rateDown;
          const on = rating === r;
          return (
            <Pressable
              key={r}
              onPress={() => rate(r)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={r === 'up' ? 'Loved it' : 'Not for me'}
              style={[styles.rate, { backgroundColor: on ? colors.selected : colors.primary }]}
            >
              <Glyph size={28} color={on ? colors.onSelected : colors.onAccent} strokeWidth={1.75} />
            </Pressable>
          );
        })}
      </View>
      {rating ? (
        <Text variant="label" color="subtle" style={{ marginTop: 14 }}>
          {rating === 'up' ? "Noted. We'll suggest it again." : "Thanks. We'll suggest it less."}
        </Text>
      ) : null}
      <Button label="Done" size="lg" onPress={onClose} style={{ marginTop: 40 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 24 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 44 },
  progress: { height: 4, borderRadius: 2, marginTop: 44, marginHorizontal: 40, overflow: 'hidden' },
  body: { flexGrow: 1, paddingTop: 48, paddingHorizontal: 12 },
  stepText: { textAlign: 'center', fontSize: 19, lineHeight: 28 },
  timer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, marginTop: 40 },
  timerButton: { width: 56, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  otherTimers: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 14 },
  otherTimer: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 999 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  done: { alignItems: 'center', justifyContent: 'center' },
  rate: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});
