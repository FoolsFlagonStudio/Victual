// Plan-related pieces used on Home, Plan and Budget.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Line, Rect } from 'react-native-svg';
import { mealPlansApi, type MealPlan, type PlannedMeal } from '@/api/mealPlans';
import type { RecipeSummary } from '@/api/recipes';
import { recipesApi, type MealFilter } from '@/api/recipes';
import { useAuth } from '@/auth/AuthProvider';
import { Text } from '@/components/Text';
import { useAppData } from '@/data/AppData';
import { dayLabel, formatRange, shortDate } from '@/lib/dates';
import { macroLine, money, perServing } from '@/lib/format';
import { fontFamily } from '@/theme/fonts';
import { tokens } from '@/theme/tokens';
import { useTheme } from '@/theme/themeContext';
import { ConfirmSheet, Sheet } from './Sheet';
import { MealCard } from './MealCard';
import { Icon } from '@/theme/icons';
import { ErrorNote, tap } from './ui';

/** Sage pill button (Regen / Swap). */
export function PillButton({ label, onPress, disabled, accessibilityLabel }: { label: string; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.pill, { backgroundColor: colors.primary, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      <Text variant="option" style={{ color: colors.onAccent }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Today's (or a chosen day's) meals with lock, favorite, and open-recipe. */
export function DayMeals({ meals }: { meals: PlannedMeal[] }) {
  const { isFavorite, toggleFavorite, toggleLock } = useAppData();
  return (
    <View style={{ gap: 14 }}>
      {meals.map((m) => (
        <MealCard
          key={m.id}
          recipe={m.recipe}
          slot={m.slot}
          leftover={m.leftover}
          locked={m.locked}
          favorite={isFavorite(m.recipe)}
          onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: m.recipe.id, servings: String(m.servings) } })}
          onToggleFavorite={() => toggleFavorite(m.recipe)}
          onToggleLock={() => toggleLock(m.id)}
          side={m.side}
          onPressSide={() => m.side && router.push({ pathname: '/recipe/[id]', params: { id: m.side.id, servings: String(m.servings) } })}
        />
      ))}
    </View>
  );
}

/**
 * Regen / Swap row plus the sheets they open. `meals` are the ones on screen.
 * (A separate Favs button was dropped: the swap sheet already has a Favorites tab.)
 */
export function PlanActions({ meals }: { meals: PlannedMeal[] }) {
  const { plan, regenerate, planBusy } = useAppData();
  const [confirm, setConfirm] = useState(false);
  const [swapping, setSwapping] = useState(false);
  if (!plan) return null;
  const locked = new Set(plan.meals.filter((m) => m.locked).map((m) => m.recipe.id)).size;

  return (
    <>
      <View style={styles.actions}>
        <PillButton label="Regen" accessibilityLabel="Regenerate this week" onPress={() => setConfirm(true)} disabled={planBusy} />
        <PillButton label="Swap" accessibilityLabel="Swap a meal" onPress={() => setSwapping(true)} disabled={planBusy} />
      </View>
      {planBusy ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      <ConfirmSheet
        visible={confirm}
        title="Regenerate this week?"
        body={
          locked
            ? `We'll pick new recipes for every meal except the ${locked} you've locked, and rebuild your grocery list.`
            : "We'll pick new recipes for the whole week and rebuild your grocery list. Lock any meal you want to keep first."
        }
        confirm="Regenerate"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          regenerate().catch(() => {});
        }}
      />
      <SwapSheet visible={swapping} initialTab="suggestions" meals={meals} onClose={() => setSwapping(false)} />
    </>
  );
}

type SwapProps = {
  visible: boolean;
  onClose: () => void;
  /** Meals to choose from. With one meal the picker is skipped. */
  meals: PlannedMeal[];
  initialTab: SwapTab;
  /**
   * Over budget by this much: the sheet becomes "Get back under budget", listing the
   * week's meals priciest first, flagging the ones whose swap could fix it, and
   * sorting replacements cheapest first.
   */
  overBy?: number;
};

type SwapTab = 'suggestions' | 'favorites' | 'search' | 'side';
type Option = { recipe: RecipeSummary; costChange: number | null };

/** What one meal costs across every day it covers, side included (estimate from per-serving costs). */
export function runCost(plan: MealPlan, meal: PlannedMeal): number {
  const days = plan.meals.filter((m) => m.selectionId === meal.selectionId);
  const per = (meal.recipe.costPerServing ?? 0) + (meal.side?.costPerServing ?? 0);
  return per * days.reduce((n, m) => n + m.servings, 0);
}

/** The cooked day of each recipe in `meals` (swapping a leftover swaps the meal it came from). */
function selectionsIn(plan: MealPlan, meals: PlannedMeal[]): PlannedMeal[] {
  const ids = new Set(meals.map((m) => m.selectionId));
  const seen = new Set<string>();
  return plan.meals.filter((m) => ids.has(m.selectionId) && !seen.has(m.selectionId) && (seen.add(m.selectionId), true));
}

/**
 * Pick a meal, then a replacement from suggestions, favorites or a search. Swaps every
 * leftover day too. Meals that have started can't be swapped. With sides on (the real
 * backend), the Side tab adds, changes or removes the side cooked with the main.
 */
export function SwapSheet({ visible, onClose, meals, initialTab, overBy }: SwapProps) {
  const { colors } = useTheme();
  const { authedRequest } = useAuth();
  const { plan, swap, setSide, removeSide } = useAppData();
  const [meal, setMeal] = useState<PlannedMeal | null>(null);
  const [tab, setTab] = useState<SwapTab>(initialTab);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const sides = mealPlansApi.sidesSupported();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const choices = useMemo(() => {
    if (!plan) return [];
    return selectionsIn(plan, meals)
      .filter((m) => !m.started)
      .sort((a, b) => (overBy ? runCost(plan, b) - runCost(plan, a) : 0));
  }, [plan, meals, overBy]);

  useEffect(() => {
    if (!visible) return;
    setTab(initialTab);
    setQ('');
    setMeal(choices.length === 1 && !overBy ? choices[0] : null);
  }, [visible, initialTab, choices]);

  // Keep the picked meal current after a side change (the plan object is replaced).
  const current = meal && plan ? (plan.meals.find((m) => m.id === meal.id) ?? meal) : meal;

  useEffect(() => {
    if (!visible || !meal || !plan) return;
    let cancelled = false;
    setOptions(null);
    setError(null);
    let load: Promise<Option[]>;
    if (tab === 'favorites') load = recipesApi.favorites(authedRequest, 0, 30).then((p) => p.items.map((recipe) => ({ recipe, costChange: null })));
    else if (tab === 'search')
      load = debounced
        ? recipesApi.search(authedRequest, { q: debounced, sort: 'fit', size: 25, meals: [meal.slot.toLowerCase() as MealFilter] }).then((p) => p.items.map((recipe) => ({ recipe, costChange: null })))
        : Promise.resolve([]);
    else if (tab === 'side') load = mealPlansApi.sideSuggestions(authedRequest, plan, meal);
    else load = mealPlansApi.suggestions(authedRequest, plan, meal);
    load
      .then((list) => {
        if (cancelled) return;
        const rest = list.filter((o) => o.recipe.id !== meal.recipe.id);
        // Over budget: cheapest swaps first.
        if (overBy && tab === 'suggestions') rest.sort((a, b) => (a.costChange ?? a.recipe.costPerServing ?? 0) - (b.costChange ?? b.recipe.costPerServing ?? 0));
        setOptions(rest);
      })
      .catch(() => !cancelled && setError("Couldn't load options. Try again."));
    return () => {
      cancelled = true;
    };
    // `plan` is left out on purpose: a side change replaces it, and the list shouldn't reload under your thumb.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, meal, tab, debounced, authedRequest]);

  const run = current && plan ? plan.meals.filter((m) => m.selectionId === current.selectionId) : [];
  const days = run.map((m) => dayLabel(m.dayOfWeek).slice(0, 3)).join(', ');
  const tabs: SwapTab[] = sides ? ['suggestions', 'favorites', 'search', 'side'] : ['suggestions', 'favorites', 'search'];
  const pick = (r: RecipeSummary) => {
    if (!current) return;
    tap();
    (tab === 'side' ? setSide(current.id, r.id) : swap(current.id, r.id)).catch(() => {});
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={current ? (tab === 'side' ? `Side for ${current.recipe.name}` : `Swap ${current.recipe.name}`) : overBy ? 'Get back under budget' : 'Which meal?'}>
      {!current ? (
        <View style={{ gap: 12 }}>
          {overBy && choices.length ? (
            <Text variant="bodySmall" color="subtle">
              You're {money(overBy)} over. These cost the most this week; swap one for something cheaper.
            </Text>
          ) : null}
          {choices.length === 0 ? (
            <Text variant="bodySmall" color="subtle">
              {plan && selectionsIn(plan, meals).length ? "These meals have started, so they can't be swapped." : 'No meals to swap here.'}
            </Text>
          ) : null}
          {choices.map((m) => {
            const cost = plan ? runCost(plan, m) : 0;
            // Swapping this for something nearly free would cover the overage.
            const couldFix = !!overBy && cost >= overBy;
            return (
              <Pressable
                key={m.id}
                onPress={() => setMeal(m)}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(m.dayOfWeek)} ${m.slot.toLowerCase()}, ${m.recipe.name}${overBy ? `, ${money(cost)} this week` : ''}`}
                style={({ pressed }) => [
                  styles.choice,
                  { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
                  couldFix && { borderWidth: 1.5, borderColor: tokens.palette.mauve },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="label" color="subtle">
                    {dayLabel(m.dayOfWeek)} {m.slot.toLowerCase()}
                    {overBy && plan && plan.meals.filter((x) => x.selectionId === m.selectionId).length > 1
                      ? ` · ${plan.meals.filter((x) => x.selectionId === m.selectionId).length} days`
                      : ''}
                  </Text>
                  <Text variant="option" color="heading">
                    {m.recipe.name}
                    {m.side ? ` + ${m.side.name}` : ''}
                  </Text>
                  {couldFix ? (
                    <Text variant="label" style={{ color: tokens.palette.plum, fontFamily: fontFamily('ui', 600) }}>
                      A cheaper swap here could fix it
                    </Text>
                  ) : null}
                </View>
                <Text variant="label" color={overBy ? 'heading' : 'subtle'} style={overBy ? { fontFamily: fontFamily('ui', 600) } : undefined}>
                  {overBy ? money(cost) : perServing(m.recipe)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View>
          <Text variant="label" color="subtle">
            {run.length > 1 ? `Changes ${days} (cooked once, then leftovers).` : `Changes ${days}.`}
          </Text>
          <View style={styles.tabs} accessibilityRole="tablist">
            {tabs.map((t) => (
              <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} style={styles.tab}>
                <Text variant="buttonLarge" color={tab === t ? 'selected' : 'subtle'} style={tab === t && { textDecorationLine: 'underline' }}>
                  {t.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === 'search' ? (
            <View style={[styles.search, { borderBottomColor: colors.divider }]}>
              <Icon.search size={18} color={colors.muted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search recipes or ingredients"
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                accessibilityLabel="Search recipes to swap in"
                style={[styles.searchInput, { color: colors.text }]}
              />
            </View>
          ) : null}

          {tab === 'side' ? (
            <View style={[styles.sideNow, { backgroundColor: colors.surface }]}>
              <View style={{ flex: 1 }}>
                <Text variant="label" color="subtle">
                  {current.side ? (current.sideChosen ? 'Your pick: stays if you swap the main' : 'Picked to go with it') : 'No side yet'}
                </Text>
                <Text variant="option" color="heading">
                  {current.side ? current.side.name : 'Pick one below, or let us choose'}
                </Text>
              </View>
              {current.side ? (
                <Text
                  variant="label"
                  style={{ textDecorationLine: 'underline' }}
                  accessibilityRole="button"
                  onPress={() => {
                    tap();
                    removeSide(current.id).catch(() => {});
                    onClose();
                  }}
                >
                  Remove
                </Text>
              ) : (
                <Text
                  variant="label"
                  style={{ textDecorationLine: 'underline' }}
                  accessibilityRole="button"
                  onPress={() => {
                    tap();
                    setSide(current.id, null).catch(() => {});
                    onClose();
                  }}
                >
                  Pick for me
                </Text>
              )}
            </View>
          ) : null}

          {error ? <ErrorNote message={error} /> : null}
          {!options && !error ? <ActivityIndicator style={{ marginVertical: 24 }} /> : null}
          {options && options.length === 0 ? (
            <Text variant="bodySmall" color="subtle" style={{ marginVertical: 16 }}>
              {tab === 'favorites'
                ? 'No favorites yet. Tap the heart on any recipe to save it here.'
                : tab === 'search'
                  ? debounced
                    ? `Nothing matches "${debounced}".`
                    : 'Type a recipe or an ingredient.'
                  : tab === 'side'
                    ? 'No sides to suggest right now.'
                    : 'No other recipes fit this meal right now.'}
            </Text>
          ) : null}
          {tab === 'search' && options?.length ? (
            <Text variant="fine" color="subtle" style={{ marginBottom: 8 }}>
              {current.slot.charAt(0) + current.slot.slice(1).toLowerCase()} recipes only{run.length > 1 ? `; it has to keep for ${run.length} days` : ''}.
            </Text>
          ) : null}
          <View style={{ gap: 10 }}>
            {options?.map(({ recipe: r, costChange }) => {
              const diff =
                costChange ?? (tab !== 'side' && r.costPerServing != null && current.recipe.costPerServing != null ? (r.costPerServing - current.recipe.costPerServing) * current.servings * run.length : null);
              return (
                <Pressable
                  key={r.id}
                  onPress={() => pick(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`${tab === 'side' ? 'Use' : 'Swap in'} ${r.name}, ${perServing(r) ?? ''}`}
                  style={({ pressed }) => [styles.choice, { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="option" color="heading">
                      {r.name}
                    </Text>
                    <Text variant="label" color="subtle">
                      {[perServing(r), macroLine(r)].filter(Boolean).join(' · ')}
                    </Text>
                    {overBy && diff != null && -diff >= overBy ? (
                      <Text variant="label" style={{ color: '#2F5A33', fontFamily: fontFamily('ui', 600) }}>
                        Gets you back under budget
                      </Text>
                    ) : null}
                  </View>
                  {diff != null && Math.abs(diff) >= 0.01 ? (
                    <Text variant="label" style={{ fontFamily: fontFamily('ui', 600), color: diff < 0 ? '#2F5A33' : colors.subtle }}>
                      {diff < 0 ? '-' : '+'}
                      {money(Math.abs(diff))}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          {choices.length > 1 ? (
            <Text variant="label" style={{ textDecorationLine: 'underline', marginTop: 16 }} onPress={() => setMeal(null)} accessibilityRole="button">
              Pick a different meal
            </Text>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}

/** Dark forest "This week's groceries" card from the Home designs. */
export function BudgetCard({ plan, budget, onPress, onSwap }: { plan: MealPlan | null; budget: number; onPress?: () => void; onSwap?: () => void }) {
  const total = plan?.estimatedTotalCost ?? 0;
  const over = total > budget;
  const diff = Math.abs(budget - total);
  const fill = budget > 0 ? Math.min(1, total / budget) : 0;
  const cream = tokens.palette.backgroundLight;
  const red = '#D9534A';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`This week's groceries: ${money(total, true)} of ${money(budget, true)}. ${plan ? (over ? `${money(diff, true)} over budget` : `${money(diff, true)} under budget`) : 'No plan yet'}. Open budget`}
      style={({ pressed }) => [styles.budgetCard, { opacity: pressed ? 0.95 : 1 }]}
    >
      <Text variant="label" style={{ color: '#C9D3CC' }}>
        This week's groceries
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
        <Text style={{ fontFamily: fontFamily('ui', 700), fontSize: 38, lineHeight: 46, color: cream }}>
          {money(total, true)}
          {!plan?.costComplete && plan ? '+' : ''}
        </Text>
        <Text variant="option" style={{ color: cream }}>
          of {money(budget, true)}
        </Text>
      </View>
      <View style={styles.budgetTrack}>
        <View style={{ width: `${fill * 100}%`, height: '100%', borderRadius: 4, backgroundColor: over ? red : tokens.palette.sage }} />
      </View>
      {plan ? (
        over ? (
          <Text variant="label" style={{ color: cream, marginTop: 12 }}>
            <Text style={{ fontFamily: fontFamily('ui', 700), color: cream }}>{money(diff, true)} </Text>
            <Text style={{ fontFamily: fontFamily('ui', 700), color: red }}>over</Text>
            <Text style={{ fontFamily: fontFamily('ui', 700), color: cream }}> budget: </Text>
            <Text style={{ color: cream, textDecorationLine: onSwap ? 'underline' : 'none' }} onPress={onSwap} accessibilityRole="button">
              Swap meals?
            </Text>
          </Text>
        ) : (
          <Text variant="label" style={{ color: tokens.palette.sage, marginTop: 12, fontFamily: fontFamily('ui', 600) }}>
            {money(diff, true)} under budget
          </Text>
        )
      ) : (
        <View style={{ height: 32 }} />
      )}
    </Pressable>
  );
}

const UNDER = '#5E9A63';
const OVER = '#A8487A';

/**
 * Weekly spend vs budget (oldest to newest). Bars above the dashed budget line
 * are over budget; color repeats that (validated for color-blind separation).
 * Tap a bar to read its exact numbers.
 */
export function BudgetHistoryChart({ weeks }: { weeks: { id: string; weekStartDate: string; weekEndDate: string; total: number; budget: number }[] }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const H = 150;
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.total, w.budget))) * 1.1;
  const gap = 8;
  const barW = weeks.length ? Math.max(8, (width - gap * (weeks.length - 1)) / weeks.length) : 0;
  const y = (v: number) => H - (v / max) * H;
  const current = weeks.find((w) => w.id === picked) ?? weeks[weeks.length - 1];
  const under = weeks.filter((w) => w.total <= w.budget).length;

  return (
    <View
      accessible
      accessibilityLabel={`Weekly grocery spend for the last ${weeks.length} weeks. Under budget ${under} of ${weeks.length} weeks.`}
    >
      {current ? (
        <Text variant="label" color="subtle" style={{ marginBottom: 10 }}>
          {formatRange(current.weekStartDate, current.weekEndDate)}:{' '}
          <Text variant="label" color="heading" style={{ fontFamily: fontFamily('ui', 600) }}>
            {money(current.total)}
          </Text>{' '}
          of {money(current.budget, true)}
          {current.total > current.budget ? ' (over)' : ''}
        </Text>
      ) : null}
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: H }}>
        {width > 0 ? (
          <Svg width={width} height={H}>
            {weeks.map((w, i) => {
              const x = i * (barW + gap);
              const top = y(w.total);
              const sel = current?.id === w.id;
              return (
                <Rect
                  key={w.id}
                  x={x}
                  y={top}
                  width={barW}
                  height={Math.max(2, H - top)}
                  rx={4}
                  fill={w.total > w.budget ? OVER : UNDER}
                  opacity={sel ? 1 : 0.72}
                  onPress={() => setPicked(w.id)}
                />
              );
            })}
            {/* Budget line: weeks can differ if the budget changed, so draw one segment per bar. */}
            {weeks.map((w, i) => (
              <Line key={`b-${w.id}`} x1={i * (barW + gap) - gap / 2} x2={i * (barW + gap) + barW + gap / 2} y1={y(w.budget)} y2={y(w.budget)} stroke={colors.heading} strokeWidth={1.5} strokeDasharray="4 3" />
            ))}
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {weeks.map((w, i) => (
          <Pressable key={w.id} onPress={() => setPicked(w.id)} style={{ width: barW, marginRight: i < weeks.length - 1 ? gap : 0, alignItems: 'center' }} accessibilityLabel={`Week of ${shortDate(w.weekStartDate)}`}>
            <Text style={{ fontSize: 9, lineHeight: 12, color: colors.subtle }} numberOfLines={1}>
              {shortDate(w.weekStartDate)}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.legend}>
        <Legend color={UNDER} label="Under budget" />
        <Legend color={OVER} label="Over budget" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 16, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.heading }} />
          <Text variant="fine" color="subtle">
            Budget
          </Text>
        </View>
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Text variant="fine" color="subtle">
        {label}
      </Text>
    </View>
  );
}

export const SLOT_COLORS = { BREAKFAST: tokens.palette.mauve, LUNCH: tokens.palette.sage, DINNER: tokens.palette.forest } as const;

const styles = StyleSheet.create({
  pill: { minWidth: 82, height: 36, paddingHorizontal: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 3px rgba(0, 0, 0, 0.25)' },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 30 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 4, marginTop: 16, marginBottom: 14 },
  tab: { paddingVertical: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, paddingBottom: 8, marginBottom: 14 },
  searchInput: { flex: 1, padding: 0, fontFamily: fontFamily('ui', 400), fontSize: 16 },
  sideNow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, marginBottom: 14, borderWidth: 1, borderColor: tokens.palette.sage },
  budgetCard: { backgroundColor: tokens.palette.forest, borderRadius: 18, padding: 22, boxShadow: '0 3px 6px rgba(0, 0, 0, 0.25)' },
  budgetTrack: { height: 8, borderRadius: 4, backgroundColor: '#41544A', marginTop: 16, overflow: 'hidden' },
  legend: { flexDirection: 'row', gap: 18, marginTop: 12, flexWrap: 'wrap' },
});

