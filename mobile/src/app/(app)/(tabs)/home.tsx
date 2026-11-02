import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { BudgetCard, DayMeals, PlanActions, SwapSheet } from '@/components/app/PlanPieces';
import { EmptyState, ErrorNote, Loading, PageTitle, PreviewBanner, Screen, SectionTitle } from '@/components/app/ui';
import { Text } from '@/components/Text';
import { useAppData } from '@/data/AppData';
import { DAYS } from '@/onboarding/model';
import { addDays, formatRange, todayISO, weekStartFor } from '@/lib/dates';

export default function Home() {
  const { user } = useAuth();
  const { prefs, plan, planError, planBusy, generate, refresh } = useAppData();
  const [refreshing, setRefreshing] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);

  const today = todayISO();
  const weekStart = plan?.weekStartDate ?? (prefs ? weekStartFor(today, prefs.planStartDay) : today);
  const todays = plan?.meals.filter((m) => m.date === today) ?? [];
  const budget = Number(prefs?.weeklyBudget ?? plan?.budgetTarget ?? 0);
  const over = !!plan && plan.estimatedTotalCost > budget;
  const autoDay = prefs?.autoPlanEnabled !== false && prefs?.autoPlanDay ? DAYS.find((d) => d.day === prefs.autoPlanDay)?.long : null;

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refresh();
            setRefreshing(false);
          }}
        />
      }
    >
      <PreviewBanner />
      <PageTitle eyebrow={formatRange(weekStart, addDays(weekStart, 6))} title={`Hi, ${user?.firstName ?? 'there'}`} />

      <BudgetCard plan={plan ?? null} budget={budget} onPress={() => router.push('/budget')} onSwap={() => setSwapOpen(true)} />

      <SectionTitle>Today</SectionTitle>
      {plan === undefined ? (
        <Loading />
      ) : planError && !plan ? (
        <ErrorNote message={planError} onRetry={refresh} />
      ) : !plan ? (
        <EmptyState
          title="Your week is wide open."
          body={`Let's fill it with meals that fit your budget.${autoDay ? `\nOr wait, we'll plan it for you on ${autoDay}.` : ''}`}
          action="Plan my week"
          onAction={() => generate().catch(() => {})}
          busy={planBusy}
        />
      ) : todays.length === 0 ? (
        <Text variant="bodySmall" color="subtle">
          Nothing planned for today. Check the Plan tab for the rest of your week.
        </Text>
      ) : (
        <>
          <DayMeals meals={todays} />
          <PlanActions meals={todays} />
        </>
      )}
      {planError && plan ? <ErrorNote message={planError} /> : null}

      {/* Over budget: "Swap meals?" opens the swap sheet in budget mode: the whole week, priciest first. */}
      {plan ? (
        <SwapSheet visible={swapOpen} onClose={() => setSwapOpen(false)} meals={plan.meals} initialTab="suggestions" overBy={over ? plan.estimatedTotalCost - budget : undefined} />
      ) : null}
      <View style={{ height: 8 }} />
    </Screen>
  );
}
