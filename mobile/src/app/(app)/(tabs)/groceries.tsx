import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import type { Aisle, GroceryListItem } from '@/api/mealPlans';
import { EmptyState, ErrorNote, Loading, PageTitle, PreviewBanner, Screen, SegmentBar, tap } from '@/components/app/ui';
import { Text } from '@/components/Text';
import { useAppData } from '@/data/AppData';
import { formatRange } from '@/lib/dates';
import { ingredientText, money } from '@/lib/format';
import { Icon } from '@/theme/icons';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/themeContext';

// Store-walk order, with the labels and aisle icons from the Figma icon sheet.
const AISLES: { aisle: Aisle; label: string; Glyph: (typeof Icon)[keyof typeof Icon] }[] = [
  { aisle: 'MEAT', label: 'Meats', Glyph: Icon.meat },
  { aisle: 'SEAFOOD', label: 'Seafood', Glyph: Icon.seafood },
  { aisle: 'PRODUCE', label: 'Produce', Glyph: Icon.produce },
  { aisle: 'DAIRY', label: 'Dairy', Glyph: Icon.dairy },
  { aisle: 'EGGS', label: 'Eggs', Glyph: Icon.eggs },
  { aisle: 'BAKERY', label: 'Bakery', Glyph: Icon.bakery },
  { aisle: 'FROZEN', label: 'Frozen', Glyph: Icon.frozen },
  { aisle: 'PANTRY', label: 'Pantry', Glyph: Icon.pantry },
  { aisle: 'OTHER', label: 'Other', Glyph: Icon.other },
];

export default function Groceries() {
  const { colors } = useTheme();
  const { plan, grocery, generate, planBusy, refresh, setPurchased, setNeedToBuy } = useAppData();
  const [refreshing, setRefreshing] = useState(false);
  const all = grocery.data?.items ?? [];
  // Pantry staples (oil, salt, flour...) sit in their own section until you say you need them.
  const items = all.filter((i) => !i.pantry || i.needToBuy);
  const pantry = all.filter((i) => i.pantry && !i.needToBuy);
  const done = items.filter((i) => i.purchased).length;

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
      <PageTitle eyebrow={plan ? `${formatRange(plan.weekStartDate, plan.weekEndDate)} · about ${money(grocery.data?.estimatedTotalCost ?? plan.estimatedTotalCost, true)}` : undefined} title="Groceries" />

      {plan === undefined || (grocery.loading && !grocery.data) ? (
        <Loading />
      ) : !plan ? (
        <EmptyState title="No grocery list yet." body="Plan your week and we'll add up everything you need, grouped by aisle." action="Plan my week" onAction={() => generate().catch(() => {})} busy={planBusy} />
      ) : grocery.error && !grocery.data ? (
        <ErrorNote message={grocery.error} onRetry={refresh} />
      ) : (
        <>
          <View style={{ gap: 8, marginBottom: 8 }}>
            <Text variant="label" color="subtle" accessibilityLiveRegion="polite">
              {done === items.length && items.length ? 'All done. Happy cooking!' : `${done} of ${items.length} in your cart`}
            </Text>
            <SegmentBar segments={[{ value: items.length ? done / items.length : 0, color: colors.selected }]} track={colors.border} height={6} />
          </View>
          {AISLES.map(({ aisle, label, Glyph }) => {
            const list = items.filter((i) => i.aisle === aisle).sort((a, b) => Number(a.purchased) - Number(b.purchased));
            if (!list.length) return null;
            return (
              <View key={aisle} style={{ marginTop: 26 }}>
                <View style={styles.aisleHead}>
                  <Glyph size={18} color={colors.primary} strokeWidth={1.75} />
                  <Text variant="option" color="textStrong" accessibilityRole="header" style={{ fontFamily: fontFamily('ui', 600) }}>
                    {label}
                  </Text>
                </View>
                {list.map((item) => (
                  <GroceryRow
                    key={item.id}
                    item={item}
                    onToggle={() => setPurchased(item.id, !item.purchased)}
                    onUndoNeed={item.pantry ? () => setNeedToBuy(item.id, false) : undefined}
                  />
                ))}
              </View>
            );
          })}
          {pantry.length ? (
            <View style={{ marginTop: 34 }}>
              <View style={styles.aisleHead}>
                <Icon.pantry size={18} color={colors.primary} strokeWidth={1.75} />
                <Text variant="option" color="textStrong" accessibilityRole="header" style={{ fontFamily: fontFamily('ui', 600) }}>
                  Check your pantry
                </Text>
              </View>
              <Text variant="label" color="subtle" style={{ marginBottom: 6 }}>
                Staples you probably have, left out of your total. Out of one? Tap Need it to add it to your list.
              </Text>
              {pantry.map((item) => (
                <View key={item.id} style={styles.row}>
                  <Text variant="option" color="text" style={{ flex: 1 }}>
                    {ingredientText({ amount: item.totalAmount, displayAmount: item.displayAmount, unit: item.unit, name: item.name })}
                  </Text>
                  <Text
                    variant="label"
                    style={{ textDecorationLine: 'underline', color: colors.selected }}
                    accessibilityRole="button"
                    accessibilityLabel={`Need ${item.name}: add it to your list`}
                    onPress={() => (tap(), setNeedToBuy(item.id, true))}
                  >
                    Need it
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {grocery.error ? <ErrorNote message={grocery.error} /> : null}
          <Text variant="fine" color="muted" style={{ marginTop: 28 }}>
            Amounts cover every planned serving, leftovers and sides included. Prices are estimates and stores sell whole packages, so your total may differ.
          </Text>
        </>
      )}
    </Screen>
  );
}

function GroceryRow({ item, onToggle, onUndoNeed }: { item: GroceryListItem; onToggle: () => void; onUndoNeed?: () => void }) {
  const { colors } = useTheme();
  const text = ingredientText({ amount: item.totalAmount, displayAmount: item.displayAmount, unit: item.unit, name: item.name });
  return (
    <Pressable
      onPress={() => {
        tap();
        onToggle();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.purchased }}
      aria-checked={item.purchased}
      accessibilityLabel={text}
      style={styles.row}
    >
      <View style={[styles.box, item.purchased ? { backgroundColor: colors.selected, borderColor: colors.selected } : { borderColor: colors.muted }]} />
      <View style={{ flex: 1 }}>
        <Text variant="option" style={[{ color: item.purchased ? colors.muted : colors.text }, item.purchased && { textDecorationLine: 'line-through' }]}>
          {text}
        </Text>
        {item.packageText || item.estimatedCost != null ? (
          <Text variant="label" color="muted">
            {[item.packageText, item.estimatedCost != null ? money(item.estimatedCost) : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      {onUndoNeed ? (
        <Text variant="label" color="subtle" style={{ textDecorationLine: 'underline' }} accessibilityRole="button" accessibilityLabel={`Have ${item.name}: move it back to the pantry`} onPress={() => (tap(), onUndoNeed())}>
          Have it
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  aisleHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 22, paddingVertical: 13, paddingLeft: 2 },
  box: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 3 },
});
