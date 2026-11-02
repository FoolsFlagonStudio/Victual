import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { router } from 'expo-router';
import type { MealPlan } from '@/api/mealPlans';
import { MealCard } from '@/components/app/MealCard';
import { DayMeals, PlanActions } from '@/components/app/PlanPieces';
import { EmptyState, ErrorNote, Loading, PreviewBanner, Screen } from '@/components/app/ui';
import { Text } from '@/components/Text';
import { useAppData } from '@/data/AppData';
import { Chip } from '@/onboarding/components';
import { addDays, dayLabel, dayOfWeek, formatRange, todayISO } from '@/lib/dates';
import { money } from '@/lib/format';
import { Icon } from '@/theme/icons';
import { useTheme } from '@/theme/themeContext';

export default function Plan() {
  const { colors } = useTheme();
  const [view, setView] = useState<'week' | 'history'>('week');
  return (
    <Screen>
      <PreviewBanner />
      <View style={styles.toggle} accessibilityRole="tablist">
        {(['week', 'history'] as const).map((v, i) => (
          <View key={v} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            <Pressable onPress={() => setView(v)} accessibilityRole="tab" accessibilityState={{ selected: view === v }} style={styles.toggleItem}>
              <Text variant="buttonLarge" color="selected" style={view === v && styles.underline}>
                {v === 'week' ? 'THIS WEEK' : 'HISTORY'}
              </Text>
            </Pressable>
            {i === 0 ? <View style={[styles.divider, { backgroundColor: colors.heading }]} /> : null}
          </View>
        ))}
      </View>
      {view === 'week' ? <ThisWeek /> : <History />}
    </Screen>
  );
}

function ThisWeek() {
  const { colors } = useTheme();
  const { plan, planError, planBusy, generate, refresh, prefs } = useAppData();
  const today = todayISO();
  const days = useMemo(() => (plan ? Array.from({ length: 7 }, (_, i) => addDays(plan.weekStartDate, i)) : []), [plan]);
  const [day, setDay] = useState(today);
  const chips = useRef<ScrollViewInstance>(null);
  const chipX = useRef<Record<string, number>>({});
  useEffect(() => {
    if (days.length && !days.includes(day)) setDay(days.includes(today) ? today : days[0]);
  }, [days, day, today]);
  // Keep the selected day's chip in view (today is often off-screen to the right).
  const reveal = (d: string) => chips.current?.scrollTo({ x: Math.max(0, (chipX.current[d] ?? 0) - 40), animated: true });

  if (plan === undefined) return <Loading />;
  if (!plan) {
    return planError ? (
      <ErrorNote message={planError} onRetry={refresh} />
    ) : (
      <EmptyState title="No plan for this week yet." body="We'll pick recipes that fit your budget and build your grocery list." action="Plan my week" onAction={() => generate().catch(() => {})} busy={planBusy} />
    );
  }

  const meals = plan.meals.filter((m) => m.date === day);
  const budget = Number(prefs?.weeklyBudget ?? plan.budgetTarget);

  return (
    <View>
      <Text variant="label" color="subtle" style={{ textAlign: 'center', marginBottom: 14 }}>
        {formatRange(plan.weekStartDate, plan.weekEndDate)} · {money(plan.estimatedTotalCost, true)} of {money(budget, true)}
      </Text>
      <ScrollView ref={chips} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days} accessibilityRole="radiogroup">
        {days.map((d) => (
          <View
            key={d}
            onLayout={(e) => {
              chipX.current[d] = e.nativeEvent.layout.x;
              if (d === day) reveal(d);
            }}
          >
            <Chip label={d === today ? 'Today' : dayLabel(dayOfWeek(d))} accessibilityLabel={dayLabel(dayOfWeek(d))} selected={d === day} onPress={() => (setDay(d), reveal(d))} />
          </View>
        ))}
      </ScrollView>
      <View style={{ marginTop: 30 }}>
        {meals.length ? <DayMeals meals={meals} /> : day < today ? <Text variant="bodySmall" color="subtle">Nothing was planned this day.</Text> : null}
        {/* Open slots (a partial week, or fewer recipes than days): find a recipe and use Add to plan. */}
        {plan.openMeals
          .filter((o) => o.date === day)
          .map((o) => (
            <Pressable
              key={o.slot}
              onPress={() => router.push('/recipes')}
              accessibilityRole="button"
              accessibilityLabel={`Nothing planned for ${o.slot.toLowerCase()}. Find a recipe`}
              style={[styles.open, { borderColor: colors.primary, marginTop: meals.length ? 14 : 0 }]}
            >
              <Text variant="label" color="subtle" style={{ flex: 1 }}>
                No {o.slot.toLowerCase()} planned
              </Text>
              <Text variant="label" style={{ textDecorationLine: 'underline', color: colors.selected }}>
                Find a recipe
              </Text>
            </Pressable>
          ))}
      </View>
      <PlanActions meals={meals} />
      {planError ? <ErrorNote message={planError} /> : null}
    </View>
  );
}

function History() {
  const { colors } = useTheme();
  const { history, plan, getPlan, isFavorite, toggleFavorite } = useAppData();
  const weeks = history.data.filter((w) => w.id !== plan?.id); // newest first
  const [i, setI] = useState(0);
  const [detail, setDetail] = useState<MealPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const week = weeks[i];

  useEffect(() => {
    if (!week) return;
    let cancelled = false;
    setDetail(null);
    setError(null);
    getPlan(week.id).then((p) => !cancelled && setDetail(p)).catch(() => !cancelled && setError("Couldn't load that week."));
    return () => {
      cancelled = true;
    };
  }, [week, getPlan]);

  if (history.loading && !weeks.length) return <Loading />;
  if (!weeks.length) return <EmptyState title="No past weeks yet." body="Each finished week shows up here with what you ate and what it cost." />;

  const cooked = detail?.meals.filter((m) => !m.leftover) ?? [];
  const over = week.estimatedTotalCost > week.budgetTarget;

  return (
    <View>
      <View style={styles.weekNav}>
        <Pressable onPress={() => setI((n) => Math.min(weeks.length - 1, n + 1))} disabled={i >= weeks.length - 1} hitSlop={12} accessibilityRole="button" accessibilityLabel="Previous week" style={{ opacity: i >= weeks.length - 1 ? 0.3 : 1 }}>
          <Icon.back size={22} color={colors.subtle} />
        </Pressable>
        <Text variant="buttonLarge" color="selected" style={{ minWidth: 190, textAlign: 'center' }}>
          {formatRange(week.weekStartDate, week.weekEndDate, true).toUpperCase()}
        </Text>
        <Pressable onPress={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0} hitSlop={12} accessibilityRole="button" accessibilityLabel="Next week" style={{ opacity: i === 0 ? 0.3 : 1 }}>
          <Icon.next size={22} color={colors.subtle} />
        </Pressable>
      </View>
      <Text variant="label" color="subtle" style={{ textAlign: 'center', marginTop: 10 }}>
        {money(week.estimatedTotalCost)} of {money(week.budgetTarget, true)} · {over ? `${money(week.estimatedTotalCost - week.budgetTarget)} over` : `${money(week.budgetTarget - week.estimatedTotalCost)} under`}
      </Text>
      <View style={{ marginTop: 26, gap: 14 }}>
        {error ? <ErrorNote message={error} /> : null}
        {!detail && !error ? <Loading /> : null}
        {cooked.map((m) => (
          <MealCard
            key={m.id}
            recipe={m.recipe}
            slot={m.slot}
            favorite={isFavorite(m.recipe)}
            onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: m.recipe.id, servings: String(m.servings) } })}
            onToggleFavorite={() => toggleFavorite(m.recipe)}
            side={m.side}
            onPressSide={() => m.side && router.push({ pathname: '/recipe/[id]', params: { id: m.side.id, servings: String(m.servings) } })}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', marginTop: 30, marginBottom: 32 },
  toggleItem: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  underline: { textDecorationLine: 'underline' },
  divider: { width: 1, height: 40 },
  days: { gap: 12, paddingHorizontal: 2, paddingVertical: 4 },
  open: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed' },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
});
