import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { MealSlot } from '@/api/preferences';
import { BudgetHistoryChart, SLOT_COLORS, SwapSheet } from '@/components/app/PlanPieces';
import { BackHeader, Callout, EmptyState, Loading, PreviewBanner, Row, Screen, SectionTitle, SegmentBar } from '@/components/app/ui';
import { Text } from '@/components/Text';
import { useAppData } from '@/data/AppData';
import { money } from '@/lib/format';
import { Icon } from '@/theme/icons';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/themeContext';

const SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: 'BREAKFAST', label: 'Breakfast' },
  { slot: 'LUNCH', label: 'Lunch' },
  { slot: 'DINNER', label: 'Dinner' },
];

export default function Budget() {
  const { colors, mode } = useTheme();
  const { plan, prefs, history, generate, planBusy } = useAppData();
  const budget = Number(prefs?.weeklyBudget ?? plan?.budgetTarget ?? 0);
  const total = plan?.estimatedTotalCost ?? 0;
  const scale = Math.max(budget, total) || 1;
  const over = total > budget;
  const [swapping, setSwapping] = useState(false);

  // Oldest to newest, last 9 weeks, current week included.
  const weeks = [...history.data]
    .sort((a, b) => (a.weekStartDate < b.weekStartDate ? -1 : 1))
    .slice(-9)
    .map((w) => ({ id: w.id, weekStartDate: w.weekStartDate, weekEndDate: w.weekEndDate, total: w.id === plan?.id ? total : w.estimatedTotalCost, budget: w.budgetTarget }));
  const finished = weeks.filter((w) => w.id !== plan?.id);
  const underCount = finished.filter((w) => w.total <= w.budget).length;

  return (
    <Screen header={<BackHeader title="Budget" />}>
      <PreviewBanner />
      <View style={styles.head}>
        <Text variant="option" color="selected" style={{ fontFamily: fontFamily('ui', 600) }}>
          This week
        </Text>
        <Text variant="label" color="subtle">
          Budget {money(budget, true)}
        </Text>
      </View>

      {plan === undefined ? (
        <Loading />
      ) : !plan ? (
        <EmptyState title="Nothing planned yet." body="Plan your week to see where your budget goes." action="Plan my week" onAction={() => generate().catch(() => {})} busy={planBusy} />
      ) : (
        <>
          <Text style={[styles.total, { color: colors.selected }]} accessibilityLabel={`${money(total)} of ${money(budget, true)} budget`}>
            {money(total)}
            {plan.costComplete ? '' : '+'}
          </Text>
          <SegmentBar
            track={mode === 'dark' ? '#555' : '#E5DFDB'}
            height={12}
            segments={SLOTS.map(({ slot }) => ({ value: (plan.costBySlot[slot] ?? 0) / scale, color: SLOT_COLORS[slot] }))}
          />
          <View style={{ marginTop: 18, gap: 4 }}>
            {SLOTS.filter(({ slot }) => plan.costBySlot[slot] != null).map(({ slot, label }) => (
              <View key={slot} style={styles.legendRow}>
                <View style={[styles.swatch, { backgroundColor: SLOT_COLORS[slot], borderColor: mode === 'dark' ? '#777' : 'transparent' }]} />
                <Text variant="option" color="text" style={{ flex: 1 }}>
                  {label}
                </Text>
                <Text variant="option" color="heading" style={{ fontFamily: fontFamily('ui', 600) }}>
                  {money(plan.costBySlot[slot])}
                </Text>
              </View>
            ))}
          </View>
          <View style={{ marginTop: 18 }}>
            <Callout tone={over ? 'warn' : 'good'}>
              {over ? `${money(total - budget)} over budget this week.` : `${money(budget - total)} under budget this week`}
            </Callout>
            {over ? (
              <Text variant="label" style={{ textDecorationLine: 'underline', marginTop: 10, textAlign: 'center', color: colors.selected }} accessibilityRole="button" onPress={() => setSwapping(true)}>
                Swap a pricey meal
              </Text>
            ) : null}
            <SwapSheet visible={swapping} onClose={() => setSwapping(false)} meals={plan.meals} initialTab="suggestions" overBy={over ? total - budget : undefined} />
          </View>
          {!plan.costComplete ? (
            <Text variant="fine" color="muted" style={{ marginTop: 8 }}>
              A few ingredients couldn't be priced, so the real total is a little higher.
            </Text>
          ) : null}
        </>
      )}

      <SectionTitle>Past weeks</SectionTitle>
      {weeks.length > 1 ? (
        <>
          <BudgetHistoryChart weeks={weeks} />
          {finished.length ? (
            <View style={{ marginTop: 22 }}>
              <Callout center>
                You stayed under budget: {underCount} of {finished.length} week{finished.length === 1 ? '' : 's'}
              </Callout>
            </View>
          ) : null}
        </>
      ) : (
        <Text variant="bodySmall" color="subtle">
          Your spending history fills in here week by week.
        </Text>
      )}

      <View style={{ marginTop: 18 }}>
        <Row Glyph={Icon.budget} label="Change weekly budget" value={money(budget, true)} onPress={() => router.push('/settings/budget')} />
      </View>
      <Text variant="fine" color="muted" style={{ marginTop: 14 }}>
        Costs are estimates from average grocery prices for the servings you'll cook. Stores sell whole packages, so the register total can differ.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 },
  total: { fontFamily: fontFamily('ui', 700), fontSize: 46, lineHeight: 56, marginTop: 18, marginBottom: 18 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  swatch: { width: 13, height: 13, borderRadius: 3, borderWidth: 1 },
});
