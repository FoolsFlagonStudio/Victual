// Building blocks for the onboarding steps, measured from the 402x874 frames.
import { forwardRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { Text } from '@/components/Text';
import { Icon } from '@/theme/icons';
import { fontFamily } from '@/theme/fonts';
import { tokens } from '@/theme/tokens';
import { useTheme } from '@/theme/themeContext';

type IconCmp = (typeof Icon)[keyof typeof Icon];

/** Numbered step dots joined by mauve lines. Earlier steps can be tapped to jump back. */
export function ProgressDots({ count, current, onJump }: { count: number; current: number; onJump: (i: number) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.dots} accessibilityRole="progressbar" accessibilityLabel={`Step ${current + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => {
        const active = i === current;
        return (
          <View key={i} style={[styles.dotWrap, i < count - 1 && { flex: 1 }]}>
            <Pressable
              disabled={i >= current}
              onPress={() => onJump(i)}
              hitSlop={6}
              accessibilityLabel={`Go back to step ${i + 1}`}
              style={[styles.dot, { backgroundColor: active ? colors.selected : colors.primary }]}
            >
              <Text
                style={{ fontFamily: fontFamily('ui', 400), fontSize: 11, lineHeight: 14 }}
                color={active ? 'onSelected' : 'onPrimary'}
              >
                {i + 1}
              </Text>
            </Pressable>
            {i < count - 1 && <View style={[styles.line, { backgroundColor: colors.progressLine }]} />}
          </View>
        );
      })}
    </View>
  );
}

/** Big centered title used on every step (Poppins Regular 32, #444). */
export function StepTitle({ children, bold }: { children: ReactNode; bold?: boolean }) {
  return (
    <Text
      variant="title"
      color="heading"
      accessibilityRole="header"
      style={[styles.title, bold && { fontFamily: fontFamily('ui', 600) }]}
    >
      {children}
    </Text>
  );
}

export function Lead({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <Text variant="lead" color="subtle" style={[{ textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

/** Full-width selectable card: sage when off, forest when on. */
export function OptionCard({ label, Icon: Glyph, selected, onPress }: { label: string; Icon: IconCmp; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const fg = selected ? colors.onSelected : colors.onAccent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: selected ? colors.selected : colors.primary, opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <View style={styles.cardIcon}>
        <Glyph size={26} color={fg} strokeWidth={1.75} />
      </View>
      <Text variant="option" style={{ color: fg, flex: 1 }}>
        {label}
      </Text>
      {selected && <Icon.check size={20} color={fg} strokeWidth={1.75} />}
    </Pressable>
  );
}

/** Rounded preset pill (budget amounts, week days). */
export function Chip({ label, selected, onPress, accessibilityLabel }: { label: string; selected: boolean; onPress: () => void; accessibilityLabel?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      aria-checked={selected}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? colors.selected : colors.primary, opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <Text variant="option" style={{ color: selected ? colors.onSelected : colors.onAccent }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Round +/- button for the number steppers. */
export function StepButton({ kind, onPress, disabled, label }: { kind: 'plus' | 'minus'; onPress: () => void; disabled?: boolean; label: string }) {
  const { colors, mode } = useTheme();
  const Glyph = kind === 'plus' ? Icon.increase : Icon.decrease;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.stepButton,
        { borderColor: colors.primary, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 },
      ]}
    >
      <Glyph size={20} color={mode === 'dark' ? colors.primary : colors.onAccent} strokeWidth={2} />
    </Pressable>
  );
}

/**
 * On/off switch. "Selected" is cream in dark mode, which made the on state a white
 * pill with a white thumb, so dark mode uses sage for on instead.
 */
export function Toggle({ value, onValueChange, label }: { value: boolean; onValueChange: (v: boolean) => void; label: string }) {
  const { colors, mode } = useTheme();
  const on = mode === 'dark' ? colors.primary : colors.selected;
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ true: on, false: colors.primaryDisabled }}
      ios_backgroundColor={colors.primaryDisabled}
      thumbColor="#FFFFFF"
      accessibilityLabel={label}
    />
  );
}

/** Underlined row with a large placeholder, optional leading icon and trailing unit/control. */
type FieldRowProps = TextInputProps & { label: string; Icon?: IconCmp; trailing?: ReactNode; error?: string | null };

export const FieldRow = forwardRef<TextInputInstance, FieldRowProps>(function FieldRow(
  { label, Icon: Glyph, trailing, error, ...input },
  ref,
) {
  const { colors } = useTheme();
  const t = tokens.typography.field;
  return (
    <View>
      <View style={styles.fieldRow}>
        {Glyph && (
          <View style={styles.fieldIcon}>
            <Glyph size={26} color={colors.primary} strokeWidth={1.75} />
          </View>
        )}
        <View style={[styles.fieldLine, { borderBottomColor: error ? colors.danger : colors.divider }]}>
          {input.editable === false ? (
            <Text style={[styles.fieldText, { fontFamily: fontFamily(t.font, t.weight), fontSize: t.size, color: colors.heading }]}>
              {label}
            </Text>
          ) : (
            <TextInput
              ref={ref}
              placeholder={label}
              accessibilityLabel={label}
              placeholderTextColor={colors.muted}
              style={[
                styles.fieldText,
                { fontFamily: fontFamily(t.font, t.weight), fontSize: t.size, letterSpacing: t.letterSpacing, color: colors.heading },
              ]}
              {...input}
            />
          )}
          {trailing}
        </View>
      </View>
      {error ? (
        <Text variant="fine" color="danger" style={{ marginTop: 4, marginLeft: Glyph ? 44 : 0 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', alignItems: 'center' },
  dotWrap: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, height: 2, marginHorizontal: 3, borderRadius: 1 },
  title: { textAlign: 'center' },
  card: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    gap: 14,
    borderRadius: 4,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
  },
  cardIcon: { width: 28, alignItems: 'center' },
  chip: {
    minWidth: 68,
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, height: 52 },
  fieldIcon: { width: 30, alignItems: 'center', paddingBottom: 8 },
  fieldLine: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, paddingBottom: 6 },
  fieldText: { flex: 1, minWidth: 0, padding: 0 },
});
