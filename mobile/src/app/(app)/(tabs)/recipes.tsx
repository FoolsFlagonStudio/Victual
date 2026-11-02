import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { recipesApi, type MealFilter, type RecipeSearch, type RecipeSummary } from '@/api/recipes';
import { useAuth } from '@/auth/AuthProvider';
import { ErrorNote, Loading, tap } from '@/components/app/ui';
import { Text } from '@/components/Text';
import { useAppData } from '@/data/AppData';
import { Chip } from '@/onboarding/components';
import { macroLine, perServing } from '@/lib/format';
import { Icon } from '@/theme/icons';
import { fontFamily } from '@/theme/fonts';
import { tokens } from '@/theme/tokens';
import { useTheme } from '@/theme/themeContext';

type FilterKey = 'cal' | 'vegan' | 'vegetarian' | 'protein' | 'gluten' | 'dairy';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'cal', label: 'Cal. Friendly' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'protein', label: 'High Protein' },
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'gluten', label: 'Gluten Free' },
  { key: 'dairy', label: 'Dairy Free' },
];
const LABEL_FOR: Partial<Record<FilterKey, string>> = { vegan: 'vegan', vegetarian: 'vegetarian', protein: 'high-protein', gluten: 'gluten-free', dairy: 'dairy-free' };

const MEAL_CHIPS: { key: MealFilter; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'side', label: 'Sides' },
];

const COLLECTIONS: { key: string; title: string; params: RecipeSearch }[] = [
  { key: 'budget', title: 'Under $3 per Serving', params: { maxCost: 3, sort: 'cost' } },
  { key: 'new', title: 'New This Month', params: { sort: 'newest' } },
  { key: 'quick', title: 'Ready in 30 Minutes', params: { maxTime: 30, sort: 'time' } },
  { key: 'prep', title: 'Meal Prep Friendly', params: { sort: 'mealPrep' } },
  { key: 'lean', title: 'Protein Packed', params: { minProtein: 30, sort: 'protein' } },
];

const PAGE = 20;
const SPACER = { id: '__spacer' } as RecipeSummary;

export default function Recipes() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { authedRequest } = useAuth();
  const { prefs, isFavorite } = useAppData();

  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set());
  const [collection, setCollection] = useState<string | null>(null);
  // Starts on the meals you plan (no breakfasts if you don't plan breakfast). Turn them all off to see everything.
  const planned = useMemo<MealFilter[]>(
    () => (['BREAKFAST', 'LUNCH', 'DINNER'] as const).filter((slot) => prefs?.mealSlots[slot]).map((slot) => slot.toLowerCase() as MealFilter),
    [prefs?.mealSlots],
  );
  const [meals, setMeals] = useState<Set<MealFilter> | null>(null);
  const activeMeals = meals ?? new Set(planned);
  const mealsAreDefault = meals === null || (meals.size === planned.length && planned.every((m) => meals.has(m)));
  const mealKey = [...activeMeals].sort().join(',');
  const [items, setItems] = useState<RecipeSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);

  const search = useMemo<RecipeSearch>(() => {
    const labels = [...filters].map((f) => LABEL_FOR[f]).filter((l): l is string => !!l);
    const base = COLLECTIONS.find((c) => c.key === collection)?.params ?? { sort: 'fit' as const };
    return {
      ...base,
      q: q || undefined,
      labels,
      ...(filters.has('cal') && { maxCalories: prefs?.maxCaloriesPerMeal ?? 500 }),
      meals: mealKey ? (mealKey.split(',') as MealFilter[]) : [],
      size: PAGE,
    };
  }, [q, filters, collection, prefs?.maxCaloriesPerMeal, mealKey]);

  const load = useCallback(
    async (page: number) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const res = favoritesOnly ? await recipesApi.favorites(authedRequest, page, PAGE) : await recipesApi.search(authedRequest, { ...search, page });
        if (id !== requestId.current) return;
        const list = favoritesOnly && q ? res.items.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : res.items;
        setItems((prev) => (page === 0 ? list : [...prev, ...list]));
        setTotal(res.total);
      } catch {
        if (id === requestId.current) setError("Couldn't load recipes. Check your connection and try again.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [authedRequest, search, favoritesOnly, q],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  const filtered = favoritesOnly || q || filters.size > 0 || collection || !mealsAreDefault;
  const heading = favoritesOnly ? 'Your Favorites' : filtered ? `${total} Recipe${total === 1 ? '' : 's'}` : 'Filtered For You';
  // Unfavoriting from the favorites view removes it right away.
  const visible = favoritesOnly ? items.filter((r) => isFavorite(r)) : items;
  // Pad odd counts so the last tile keeps its half width.
  const shown = visible.length % 2 ? [...visible, SPACER] : visible;

  const header = (
    <View style={{ paddingTop: insets.top + 36 }}>
      <View style={styles.searchRow}>
        <View style={[styles.search, { borderBottomColor: colors.divider }]}>
          <Icon.search size={20} color={colors.muted} />
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Search recipes or ingredients"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            accessibilityLabel="Search recipes"
            style={[styles.searchInput, { color: colors.text }]}
          />
          {input ? (
            <Pressable onPress={() => setInput('')} hitSlop={10} accessibilityLabel="Clear search">
              <Icon.close size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => {
            tap();
            setFavoritesOnly((f) => !f);
          }}
          hitSlop={10}
          accessibilityRole="switch"
          accessibilityState={{ checked: favoritesOnly }}
          accessibilityLabel="Show favorites only"
          style={styles.heart}
        >
          <Icon.favorited size={28} color={tokens.palette.mauve} fill={favoritesOnly ? tokens.palette.mauve : 'transparent'} strokeWidth={1.75} />
        </Pressable>
      </View>

      {!favoritesOnly && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityLabel="Meals">
            {MEAL_CHIPS.map((m) => (
              <Chip
                key={m.key}
                label={m.label}
                selected={activeMeals.has(m.key)}
                onPress={() =>
                  setMeals(() => {
                    const next = new Set(activeMeals);
                    if (next.has(m.key)) next.delete(m.key);
                    else next.add(m.key);
                    return next;
                  })
                }
              />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filters, { paddingTop: 10 }]}>
            {FILTERS.map((f) => (
              <Chip
                key={f.key}
                label={f.label}
                selected={filters.has(f.key)}
                onPress={() =>
                  setFilters((s) => {
                    const next = new Set(s);
                    if (next.has(f.key)) next.delete(f.key);
                    else next.add(f.key);
                    return next;
                  })
                }
              />
            ))}
          </ScrollView>
          <Collections selected={collection} onSelect={(k) => setCollection((c) => (c === k ? null : k))} />
        </>
      )}

      <Text variant="h3" color="textStrong" accessibilityRole="header" style={styles.heading}>
        {heading}
      </Text>
      {error ? <ErrorNote message={error} onRetry={() => load(0)} /> : null}
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      data={shown}
      keyExtractor={(r) => r.id}
      numColumns={2}
      columnWrapperStyle={{ gap: 16, paddingHorizontal: 20 }}
      contentContainerStyle={{ gap: 16, paddingBottom: 32 }}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      renderItem={({ item }) => (item === SPACER ? <View style={{ flex: 1 }} /> : <RecipeTile recipe={item} favorite={isFavorite(item)} />)}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (!loading && !favoritesOnly && items.length < total) load(Math.floor(items.length / PAGE));
      }}
      ListEmptyComponent={
        loading ? (
          <Loading />
        ) : !error ? (
          <Text variant="bodySmall" color="subtle" style={{ textAlign: 'center', paddingHorizontal: 32, paddingTop: 24 }}>
            {favoritesOnly ? 'No favorites yet. Tap the heart on any recipe to save it here.' : 'No recipes match. Try removing a filter.'}
          </Text>
        ) : undefined
      }
      ListFooterComponent={loading && items.length ? <Loading /> : undefined}
    />
  );
}

/** Horizontally scrolling collection cards with the position line underneath (from the design). */
function Collections({ selected, onSelect }: { selected: string | null; onSelect: (k: string) => void }) {
  const { colors } = useTheme();
  const [progress, setProgress] = useState(0);
  const [ratio, setRatio] = useState(0.4);
  return (
    <View style={{ marginTop: 34 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.collections}
        snapToInterval={CARD_W + 18}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onContentSizeChange={(w) => setRatio((r) => (w ? Math.min(1, 360 / w) : r))}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const max = contentSize.width - layoutMeasurement.width;
          setRatio(Math.min(1, layoutMeasurement.width / contentSize.width));
          setProgress(max > 0 ? contentOffset.x / max : 0);
        }}
      >
        {COLLECTIONS.map((c) => {
          const on = selected === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => onSelect(c.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [styles.collection, { backgroundColor: on ? colors.selected : colors.primary, opacity: pressed ? 0.9 : 1 }]}
            >
              <Text variant="option" style={{ color: on ? colors.onSelected : colors.onAccent, textAlign: 'center' }}>
                {c.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[styles.track, { backgroundColor: colors.primary }]} accessible={false}>
        <View style={[styles.thumb, { backgroundColor: colors.selected, width: `${ratio * 100}%`, left: `${progress * (1 - ratio) * 100}%` }]} />
      </View>
    </View>
  );
}

function RecipeTile({ recipe, favorite }: { recipe: RecipeSummary; favorite: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
      accessibilityRole="button"
      accessibilityLabel={[recipe.name, perServing(recipe), macroLine(recipe), favorite && 'favorite'].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.tile, { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Text style={[styles.tileName, { color: colors.onAccent }]} numberOfLines={2}>
          {recipe.name}
        </Text>
        {favorite ? <Icon.favorited size={14} color={tokens.palette.plum} fill={tokens.palette.plum} /> : null}
      </View>
      <View style={{ gap: 1 }}>
        {perServing(recipe) ? (
          <Text variant="label" style={{ color: '#3E5C42', fontSize: 12, lineHeight: 16 }}>
            {perServing(recipe)}
          </Text>
        ) : null}
        {macroLine(recipe) ? (
          <Text variant="label" style={{ color: '#3E5C42', fontSize: 12, lineHeight: 16 }}>
            {macroLine(recipe)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const CARD_W = 150;

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 40 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, paddingBottom: 8 },
  searchInput: { flex: 1, padding: 0, fontFamily: fontFamily('ui', 400), fontSize: 17 },
  heart: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  filters: { gap: 14, paddingHorizontal: 20, paddingTop: 26, paddingBottom: 4 },
  collections: { gap: 18, paddingHorizontal: 20, paddingVertical: 4 },
  collection: { width: CARD_W, height: 78, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 12, boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)' },
  track: { height: 3, borderRadius: 2, marginHorizontal: 70, marginTop: 20, overflow: 'hidden' },
  thumb: { position: 'absolute', top: 0, bottom: 0, borderRadius: 2 },
  heading: { fontFamily: fontFamily('ui', 500), fontSize: 22, lineHeight: 30, marginTop: 40, marginBottom: 8, paddingHorizontal: 28 },
  tile: { flex: 1, minHeight: 104, borderRadius: 16, padding: 14, justifyContent: 'space-between', gap: 8, boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)' },
  tileName: { flex: 1, fontFamily: fontFamily('ui', 500), fontSize: 15, lineHeight: 20 },
});
