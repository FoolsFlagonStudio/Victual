import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { recipesApi, type IngredientLine, type RecipeDetail } from '@/api/recipes';
import { useAuth } from '@/auth/AuthProvider';
import { AddToPlanSheet } from '@/components/app/AddToPlanSheet';
import { BackHeader, ErrorNote, Loading, Screen, tap } from '@/components/app/ui';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useAppData } from '@/data/AppData';
import { StepButton } from '@/onboarding/components';
import { ingredientText, minutes, money, perServing } from '@/lib/format';
import { Icon } from '@/theme/icons';
import { fontFamily } from '@/theme/fonts';
import { tokens } from '@/theme/tokens';
import { useTheme } from '@/theme/themeContext';

const TABS = ['INGREDIENTS', 'DIRECTIONS', 'NUTRITION'] as const;

export default function RecipeScreen() {
  const { id, servings: servingsParam } = useLocalSearchParams<{ id: string; servings?: string }>();
  const { authedRequest } = useAuth();
  const { prefs, isFavorite, toggleFavorite } = useAppData();
  const { colors } = useTheme();
  const [servings, setServings] = useState<number | null>(servingsParam ? Number(servingsParam) : prefs?.householdServingSize ?? null);
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    recipesApi
      .detail(authedRequest, id, servings ?? undefined)
      .then((r) => {
        if (cancelled) return;
        setRecipe(r);
        setServings((s) => s ?? r.servings);
      })
      .catch(() => !cancelled && setError("Couldn't load this recipe."));
    return () => {
      cancelled = true;
    };
  }, [authedRequest, id, servings, attempt]);

  const fav = recipe ? isFavorite(recipe) : false;
  const heart = recipe ? (
    <Pressable onPress={() => (tap(), toggleFavorite(recipe))} hitSlop={10} accessibilityRole="switch" accessibilityState={{ checked: fav }} accessibilityLabel="Favorite">
      <Icon.favorited size={26} color={tokens.palette.mauve} fill={fav ? tokens.palette.mauve : 'transparent'} strokeWidth={1.75} />
    </Pressable>
  ) : null;

  if (!recipe) {
    return (
      <Screen header={<BackHeader />}>
        {error ? <ErrorNote message={error} onRetry={() => setAttempt((n) => n + 1)} /> : <Loading />}
      </Screen>
    );
  }

  const required = recipe.ingredients.filter((l) => !l.optional);
  const optional = recipe.ingredients.filter((l) => l.optional);
  const meta = [minutes(recipe.totalTimeMinutes), perServing(recipe)].filter(Boolean).join(' · ');

  return (
    <Screen header={<BackHeader right={heart} />} contentStyle={{ paddingHorizontal: 28 }}>
      {recipe.imageUrl ? <Image source={{ uri: recipe.imageUrl }} style={styles.image} accessibilityIgnoresInvertColors /> : null}
      <Text variant="h2" color="selected" accessibilityRole="header" style={{ fontFamily: fontFamily('ui', 600), fontSize: 26, lineHeight: 32, marginTop: 8 }}>
        {recipe.name}
      </Text>
      <Text variant="label" color="subtle" style={{ marginTop: 2 }}>
        {meta}
      </Text>
      {recipe.labels.length ? (
        <View style={styles.labels}>
          {recipe.labels
            .filter((l) => !/-free$/.test(l) || prefs?.dietaryRestrictions.some((r) => r.name === l))
            .map((l) => (
              <View key={l} style={[styles.label, { backgroundColor: colors.border }]}>
                <Text style={{ fontSize: 11, lineHeight: 14, color: colors.subtle }}>{l.replace(/-/g, ' ')}</Text>
              </View>
            ))}
        </View>
      ) : null}
      {recipe.description ? (
        <Text variant="bodySmall" color="subtle" style={{ marginTop: 12 }}>
          {recipe.description}
        </Text>
      ) : null}

      <View style={styles.rings}>
        <Ring value={recipe.caloriesPerServing} unit="" label="Calories" />
        <Ring value={recipe.proteinGPerServing} unit="g" label="Protein" />
        <Ring value={recipe.carbsGPerServing} unit="g" label="Carbs" />
        <Ring value={recipe.fatGPerServing} unit="g" label="Fat" />
      </View>
      <Text variant="fine" color="muted" style={{ textAlign: 'center', marginTop: 6 }}>
        Per serving{recipe.nutritionComplete ? '' : ' (some ingredients missing nutrition data)'}
      </Text>

      <View style={styles.servings}>
        <Text variant="option" color="heading">
          Servings
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <StepButton kind="minus" label="Fewer servings" disabled={(servings ?? 1) <= 1} onPress={() => setServings((s) => Math.max(1, (s ?? 1) - 1))} />
          <Text variant="h3" color="heading" style={{ minWidth: 28, textAlign: 'center' }} accessibilityLiveRegion="polite">
            {servings}
          </Text>
          <StepButton kind="plus" label="More servings" disabled={(servings ?? 1) >= 20} onPress={() => setServings((s) => Math.min(20, (s ?? 1) + 1))} />
        </View>
      </View>
      {recipe.estimatedCost != null ? (
        <Text variant="label" color="subtle" style={{ textAlign: 'right' }}>
          About {money(recipe.estimatedCost)} for {servings} serving{servings === 1 ? '' : 's'}
          {recipe.costComplete ? '' : ' (estimate)'}
        </Text>
      ) : null}

      <View style={styles.tabs} accessibilityRole="tablist">
        <Pressable onPress={() => setTab((t) => (t + 2) % 3)} hitSlop={10} accessibilityLabel="Previous tab">
          <Icon.back size={18} color={colors.subtle} />
        </Pressable>
        {TABS.map((t, i) => (
          <Pressable key={t} onPress={() => setTab(i)} accessibilityRole="tab" accessibilityState={{ selected: tab === i }} style={[styles.tab, tab === i && { borderBottomColor: colors.selected }]}>
            <Text variant="button" style={{ color: tab === i ? colors.selected : colors.subtle, fontFamily: fontFamily('ui', tab === i ? 600 : 500), fontSize: 13 }}>
              {t}
            </Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setTab((t) => (t + 1) % 3)} hitSlop={10} accessibilityLabel="Next tab">
          <Icon.next size={18} color={colors.subtle} />
        </Pressable>
      </View>

      {tab === 0 ? (
        <View>
          {required.map((l, i) => (
            <CheckRow key={i} line={l} checked={checked.has(i)} onToggle={() => setChecked((s) => toggle(s, i))} />
          ))}
          {optional.length ? (
            <>
              <Text variant="label" color="subtle" style={{ marginTop: 16 }}>
                Optional
              </Text>
              {optional.map((l, i) => (
                <CheckRow key={`o${i}`} line={l} checked={checked.has(1000 + i)} onToggle={() => setChecked((s) => toggle(s, 1000 + i))} />
              ))}
            </>
          ) : null}
        </View>
      ) : tab === 1 ? (
        <View style={{ gap: 18 }}>
          {recipe.steps.map((s) => (
            <View key={s.stepNumber} style={{ flexDirection: 'row', gap: 14 }}>
              <View style={[styles.stepNo, { backgroundColor: colors.primary }]}>
                <Text style={{ fontFamily: fontFamily('ui', 600), fontSize: 13, color: colors.onAccent }}>{s.stepNumber}</Text>
              </View>
              <Text variant="body" color="text" style={{ flex: 1 }}>
                {s.text}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View>
          {(
            [
              ['Calories', recipe.caloriesPerServing, ''],
              ['Protein', recipe.proteinGPerServing, 'g'],
              ['Carbohydrates', recipe.carbsGPerServing, 'g'],
              ['Fat', recipe.fatGPerServing, 'g'],
            ] as const
          ).map(([label, v, unit]) => (
            <View key={label} style={[styles.nutRow, { borderBottomColor: colors.border }]}>
              <Text variant="option" color="text">
                {label}
              </Text>
              <Text variant="option" color="heading" style={{ fontFamily: fontFamily('ui', 600) }}>
                {v == null ? '-' : `${Math.round(v)}${unit}`}
              </Text>
            </View>
          ))}
          {recipe.flags.filter((f) => f.code !== 'NUTRITION_INCOMPLETE').map((f) => (
            <View key={f.code} style={styles.flag}>
              <Icon.warning size={16} color={colors.subtle} />
              <Text variant="label" color="subtle" style={{ flex: 1 }}>
                {f.message}
              </Text>
            </View>
          ))}
          <Text variant="fine" color="muted" style={{ marginTop: 14 }}>
            Per serving, calculated from the ingredients. Numbers are estimates.
          </Text>
        </View>
      )}

      <Button label="Add to plan" size="lg" style={{ marginTop: 32 }} onPress={() => (setAdded(null), setAdding(true))} />
      {added ? (
        <Text variant="label" color="subtle" style={{ textAlign: 'center', marginTop: 10 }} accessibilityLiveRegion="polite">
          {added}
        </Text>
      ) : null}
      <AddToPlanSheet visible={adding} onClose={() => setAdding(false)} recipe={recipe} onDone={setAdded} />
      {recipe.steps.length ? (
        <Button
          label="Start cooking"
          size="lg"
          style={{ marginTop: 14 }}
          onPress={() => router.push({ pathname: '/cook/[id]', params: { id: recipe.id, servings: String(servings ?? recipe.servings) } })}
        />
      ) : null}
      {recipe.sourceUrl ? (
        <Text variant="fine" color="subtle" style={{ textAlign: 'center', marginTop: 18 }}>
          Adapted from{' '}
          <Text variant="fine" style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(recipe.sourceUrl!)} accessibilityRole="link">
            {recipe.sourceHost ?? 'the original recipe'}
          </Text>
        </Text>
      ) : null}
    </Screen>
  );
}

const toggle = (s: Set<number>, i: number) => {
  const next = new Set(s);
  if (next.has(i)) next.delete(i);
  else next.add(i);
  return next;
};

function CheckRow({ line, checked, onToggle }: { line: IngredientLine; checked: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const text = `${ingredientText(line)}${line.prepNote ? `, ${line.prepNote}` : ''}`;
  return (
    <Pressable onPress={() => (tap(), onToggle())} accessibilityRole="checkbox" accessibilityState={{ checked }} aria-checked={checked} accessibilityLabel={text} style={styles.checkRow}>
      <View style={[styles.box, checked ? { backgroundColor: colors.selected, borderColor: colors.selected } : { borderColor: colors.muted }]} />
      <Text variant="option" style={[{ flex: 1, color: checked ? colors.muted : colors.text }, checked && { textDecorationLine: 'line-through' }]}>
        {text}
      </Text>
    </Pressable>
  );
}

function Ring({ value, unit, label }: { value: number | null; unit: string; label: string }) {
  const { colors } = useTheme();
  const size = 66;
  return (
    <View style={{ alignItems: 'center', gap: 6 }} accessible accessibilityLabel={`${label}: ${value == null ? 'unknown' : `${Math.round(value)}${unit === 'g' ? ' grams' : ''}`}`}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={size / 2} cy={size / 2} r={size / 2 - 3} stroke={colors.primary} strokeWidth={4} fill="none" />
        </Svg>
        <Text style={{ fontFamily: fontFamily('ui', 500), fontSize: value != null && value >= 1000 ? 14 : 17, color: colors.heading }}>
          {value == null ? '-' : `${Math.round(value)}${unit}`}
        </Text>
      </View>
      <Text variant="label" color="subtle" style={{ fontSize: 13 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', aspectRatio: 16 / 10, borderRadius: 16, marginBottom: 10 },
  labels: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  label: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  rings: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 26 },
  servings: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26 },
  tabs: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 18 },
  tab: { paddingVertical: 10, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingVertical: 12 },
  box: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 3 },
  stepNo: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  nutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
});
