import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { MealSlot } from '@/api/preferences';
import type { RecipeSummary } from '@/api/recipes';
import { Text } from '@/components/Text';
import { minutes, perServing } from '@/lib/format';
import { Icon } from '@/theme/icons';
import { fontFamily } from '@/theme/fonts';
import { tokens } from '@/theme/tokens';
import { useTheme } from '@/theme/themeContext';
import { tap } from './ui';

const SLOT_LABEL: Record<MealSlot, string> = { BREAKFAST: 'BREAKFAST', LUNCH: 'LUNCH', DINNER: 'DINNER' };
// Placeholder tiles from the designs: mauve tint for breakfast/dinner, sage tint for lunch.
const TINT: Record<MealSlot, [light: string, dark: string]> = {
  BREAKFAST: ['#E9DCE3', '#5A4651'],
  LUNCH: ['#D4E4D2', '#46574A'],
  DINNER: ['#E9DCE3', '#5A4651'],
};

type MealCardProps = {
  recipe: RecipeSummary;
  slot?: MealSlot;
  leftover?: boolean;
  locked?: boolean;
  favorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  /** Omit to hide the lock (history, favorites). */
  onToggleLock?: () => void;
  /** A side cooked with this main; tapping it opens the side's recipe. */
  side?: RecipeSummary | null;
  onPressSide?: () => void;
};

/** White recipe card with slot label, title, meta, lock and favorite from the Home / Plan designs. */
export function MealCard({ recipe, slot, leftover, locked, favorite, onPress, onToggleFavorite, onToggleLock, side, onPressSide }: MealCardProps) {
  const { colors, mode } = useTheme();
  const meta = [leftover ? 'Leftovers' : minutes(recipe.totalTimeMinutes), perServing(recipe)].filter(Boolean).join(' · ');
  const tint = TINT[slot ?? 'LUNCH'][mode === 'dark' ? 1 : 0];
  const accent = tokens.palette.mauve;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${slot ? `${SLOT_LABEL[slot].toLowerCase()}, ` : ''}${recipe.name}${side ? ` with ${side.name}` : ''}${leftover ? ', leftovers' : ''}. ${meta}`}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, opacity: pressed ? 0.92 : 1 }]}
    >
      {recipe.imageUrl ? (
        <Image source={{ uri: recipe.imageUrl }} style={[styles.thumb, { backgroundColor: tint }]} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.thumb, { backgroundColor: tint }]} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        {slot ? (
          <Text style={[styles.slot, { color: mode === 'dark' ? colors.secondary : tokens.palette.plum }]}>{SLOT_LABEL[slot]}</Text>
        ) : null}
        <Text style={[styles.name, { color: colors.selected }]} numberOfLines={2}>
          {recipe.name}
        </Text>
        {side ? (
          <Text
            variant="label"
            numberOfLines={1}
            onPress={onPressSide}
            accessibilityRole={onPressSide ? 'link' : undefined}
            accessibilityLabel={`Side: ${side.name}${onPressSide ? '. Open recipe' : ''}`}
            style={{ color: mode === 'dark' ? colors.secondary : tokens.palette.plum }}
          >
            + {side.name}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="label" color="subtle" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {onToggleLock ? (
        <Pressable
          onPress={() => {
            tap();
            onToggleLock();
          }}
          hitSlop={8}
          accessibilityRole="switch"
          accessibilityState={{ checked: !!locked }}
          accessibilityLabel={locked ? `Unlock ${recipe.name}` : `Lock ${recipe.name} so regenerate keeps it`}
          style={styles.iconButton}
        >
          {locked ? <Icon.locked size={26} color={accent} strokeWidth={1.75} /> : <Icon.unlocked size={26} color={accent} strokeWidth={1.75} />}
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => {
          tap();
          onToggleFavorite();
        }}
        hitSlop={8}
        accessibilityRole="switch"
        accessibilityState={{ checked: favorite }}
        accessibilityLabel={favorite ? `Remove ${recipe.name} from favorites` : `Add ${recipe.name} to favorites`}
        style={styles.iconButton}
      >
        {favorite ? (
          <Icon.favorited size={26} color={accent} fill={accent} strokeWidth={1.75} />
        ) : (
          <Icon.favorite size={26} color={accent} strokeWidth={1.75} />
        )}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    paddingRight: 8,
    borderRadius: 14,
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.18)',
  },
  thumb: { width: 62, height: 62, borderRadius: 10 },
  slot: { fontFamily: fontFamily('ui', 600), fontSize: 11, lineHeight: 14, letterSpacing: 0.4 },
  name: { fontFamily: fontFamily('ui', 600), fontSize: 16, lineHeight: 21 },
  iconButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
});
