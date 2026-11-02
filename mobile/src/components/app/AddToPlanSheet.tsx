// "Add to plan" from a recipe: pick a day and a meal. An open slot gets the recipe;
// a planned one is swapped (every day that recipe covers); with no plan for the week
// yet you can plan the week around it, or just add this one meal.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { ApiError } from '@/api/client';
import { mealPlansApi, type MealPlan, type PlannedMeal } from '@/api/mealPlans';
import type { MealSlot } from '@/api/preferences';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useAppData } from '@/data/AppData';
import { addDays, dayLabel, dayOfWeek, shortDate, todayISO, weekStartFor } from '@/lib/dates';
import { Chip } from '@/onboarding/components';
import { Sheet } from './Sheet';
import { ErrorNote, tap } from './ui';

const SLOTS: MealSlot[] = ['BREAKFAST', 'LUNCH', 'DINNER'];
const slotName = (s: MealSlot) => s.charAt(0) + s.slice(1).toLowerCase();
const BREAKFAST_WORDS = /oat|egg|pancake|waffle|yogurt|parfait|smoothie|toast|muffin|granola|breakfast|frittata|omelet|hash|burrito/i;

type Props = {
  visible: boolean;
  onClose: () => void;
  recipe: { id: string; name: string };
  /** Called with a short confirmation once the plan has changed. */
  onDone: (message: string) => void;
};

export function AddToPlanSheet({ visible, onClose, recipe, onDone }: Props) {
  const { authedRequest } = useAuth();
  const { plan, prefs, history, getPlan, refresh, addMeal, swap } = useAppData();
  const today = todayISO();
  const thisWeek = prefs ? weekStartFor(today, prefs.planStartDay) : today;
  const nextWeek = addDays(thisWeek, 7);

  // Today through the end of next week; next week's plan is loaded if it exists.
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = today; d < addDays(nextWeek, 7); d = addDays(d, 1)) out.push(d);
    return out;
  }, [today, nextWeek]);
  const slots = useMemo(() => {
    const planned = SLOTS.filter((s) => prefs?.mealSlots[s]);
    return planned.length ? planned : SLOTS;
  }, [prefs]);

  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<MealSlot>('DINNER');
  const [nextPlan, setNextPlan] = useState<MealPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh choices each time it opens.
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setDate(todayISO());
    const guess: MealSlot = BREAKFAST_WORDS.test(recipe.name) ? 'BREAKFAST' : 'DINNER';
    setSlot(slots.includes(guess) ? guess : slots[slots.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const nextWeekId = history.data.find((w) => w.weekStartDate === nextWeek)?.id;
  useEffect(() => {
    if (!visible) return;
    setNextPlan(null);
    if (nextWeekId) getPlan(nextWeekId).then(setNextPlan).catch(() => {});
  }, [visible, nextWeekId, getPlan]);

  const inThisWeek = date < nextWeek;
  const weekPlan = inThisWeek ? (plan && plan.weekStartDate === thisWeek ? plan : null) : nextPlan;
  const occupant: PlannedMeal | undefined = weekPlan?.meals.find((m) => m.date === date && m.slot === slot);
  const run = occupant && weekPlan ? weekPlan.meals.filter((m) => m.selectionId === occupant.selectionId) : [];
  const where = `${date === today ? 'today' : dayLabel(dayOfWeek(date))}'s ${slot.toLowerCase()}`;
  const alreadyThere = occupant?.recipe.id === recipe.id;
  // A recipe is in a week's plan once (the backend refuses a second copy).
  const elsewhere = weekPlan?.meals.find((m) => m.recipe.id === recipe.id && m.selectionId !== occupant?.selectionId);

  async function act(fn: () => Promise<string>) {
    tap();
    setBusy(true);
    setError(null);
    try {
      onDone(await fn());
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const swapIn = () =>
    act(async () => {
      if (!occupant || !weekPlan) return '';
      if (weekPlan.id === plan?.id) await swap(occupant.id, recipe.id);
      else setNextPlan(await mealPlansApi.swap(authedRequest, weekPlan, occupant, recipe.id));
      return `Swapped into ${where}.`;
    });

  const add = () =>
    act(async () => {
      await addMeal({ date, slot, recipeId: recipe.id });
      if (!inThisWeek) setNextPlan(null);
      return `Added to ${where}.`;
    });

  // No plan this week yet: build one, then put this recipe in the chosen slot.
  const planAround = () =>
    act(async () => {
      const made = await mealPlansApi.generate(authedRequest, thisWeek);
      const there = made.meals.find((m) => m.date === date && m.slot === slot);
      if (there && there.recipe.id !== recipe.id && !there.started) await mealPlansApi.swap(authedRequest, made, there, recipe.id);
      else if (!there) await mealPlansApi.addMeal(authedRequest, { date, slot, recipeId: recipe.id });
      await refresh();
      return `Planned your week with ${recipe.name} on ${where}.`;
    });

  return (
    <Sheet visible={visible} onClose={onClose} title="Add to plan">
      <Text variant="label" color="subtle">
        Day
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 8 }}>
        {days.map((d) => (
          <Chip
            key={d}
            label={d === today ? 'Today' : `${dayLabel(dayOfWeek(d)).slice(0, 3)} ${shortDate(d)}`}
            accessibilityLabel={`${dayLabel(dayOfWeek(d))} ${shortDate(d)}`}
            selected={d === date}
            onPress={() => setDate(d)}
          />
        ))}
      </ScrollView>
      <Text variant="label" color="subtle" style={{ marginTop: 12 }}>
        Meal
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 8 }}>
        {slots.map((s) => (
          <Chip key={s} label={slotName(s)} selected={s === slot} onPress={() => setSlot(s)} />
        ))}
      </View>

      <View style={{ marginTop: 18, gap: 12 }}>
        {!inThisWeek && !nextPlan && nextWeekId ? (
          <ActivityIndicator />
        ) : alreadyThere ? (
          <Text variant="bodySmall" color="subtle">
            {recipe.name} is already {where}.
          </Text>
        ) : elsewhere ? (
          <Text variant="bodySmall" color="subtle">
            {recipe.name} is already on {dayLabel(elsewhere.dayOfWeek)}'s {elsewhere.slot.toLowerCase()} that week. Swap that meal from the Plan tab, or pick another week.
          </Text>
        ) : occupant ? (
          occupant.started ? (
            <Text variant="bodySmall" color="subtle">
              {occupant.recipe.name} is {where} and has already started, so it can't be swapped. Pick another day.
            </Text>
          ) : (
            <>
              <Text variant="bodySmall" color="text">
                {where.charAt(0).toUpperCase() + where.slice(1)} is {occupant.recipe.name}
                {run.length > 1 ? `, cooked once for ${run.map((m) => dayLabel(m.dayOfWeek).slice(0, 3)).join(', ')}. Swapping changes all of them.` : '.'}
              </Text>
              <Button label={`Swap in ${recipe.name}`} size="lg" onPress={swapIn} loading={busy} />
            </>
          )
        ) : weekPlan || !inThisWeek ? (
          <Button label={`Add to ${where}`} size="lg" onPress={add} loading={busy} />
        ) : (
          <>
            <Text variant="bodySmall" color="text">
              There's no plan for this week yet.
            </Text>
            <Button label="Plan my week around it" size="lg" onPress={planAround} loading={busy} />
            <Text variant="label" style={{ textAlign: 'center', textDecorationLine: 'underline' }} accessibilityRole="button" onPress={busy ? undefined : add}>
              Just add this meal
            </Text>
          </>
        )}
        {error ? <ErrorNote message={error} /> : null}
      </View>
    </Sheet>
  );
}
