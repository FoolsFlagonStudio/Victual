import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo } from '@/brand/Logo';
import { Text } from '@/components/Text';
import { icons } from '@/theme/icons';
import { tokens, type TypeVariant } from '@/theme/tokens';
import { useTheme, type ThemePreference } from '@/theme/themeContext';

// Temporary style guide so fonts, colors, logo and icons can be checked on a
// real device. This screen gets replaced by the splash/auth flow next.

const label = (name: string) => name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

// Dev reference at /style-guide (linked from the placeholder home).
export default function StyleGuide() {
  const { colors, spacing, radius, preference, setPreference } = useTheme();
  const modes: { value: ThemePreference; Icon: (typeof icons.settings)[keyof typeof icons.settings] }[] = [
    { value: 'light', Icon: icons.settings.lightMode },
    { value: 'dark', Icon: icons.settings.darkMode },
    { value: 'system', Icon: icons.settings.systemMode },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.xxl }}>
        <View style={styles.row}>
          <Logo height={36} />
          <View style={[styles.row, { gap: spacing.xs }]}>
            {modes.map(({ value, Icon }) => {
              const active = preference === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setPreference(value)}
                  accessibilityLabel={`${label(value)} theme`}
                  style={{
                    padding: spacing.sm,
                    borderRadius: radius.md,
                    backgroundColor: active ? colors.primary : 'transparent',
                  }}
                >
                  <Icon size={20} color={active ? colors.onPrimary : colors.text} />
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: spacing.md }}>
          <Text variant="h2">Palette</Text>
          <View style={styles.wrap}>
            {Object.entries(tokens.palette).map(([name, hex]) => (
              <View key={name} style={{ width: 96, gap: spacing.xxs }}>
                <View style={[styles.chip, { backgroundColor: hex, borderColor: colors.border, borderRadius: radius.md }]} />
                <Text variant="small">{label(name)}</Text>
                <Text variant="caption">{hex}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: spacing.md }}>
          <Text variant="h2">Type</Text>
          {(Object.keys(tokens.typography) as TypeVariant[]).map((v) => (
            <View key={v} style={{ gap: spacing.xxs }}>
              <Text variant="small" color="muted">{label(v)}</Text>
              <Text variant={v}>Meals planned to your budget</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: spacing.md }}>
          <Text variant="h2">Logo</Text>
          {(['light', 'dark'] as const).map((surface) => (
            <View
              key={surface}
              style={{
                gap: spacing.lg,
                padding: spacing.xl,
                borderRadius: radius.lg,
                backgroundColor: surface === 'light' ? tokens.palette.backgroundLight : tokens.palette.black,
              }}
            >
              <Logo surface={surface} height={32} />
              <Logo surface={surface} tone="mono" height={32} />
              <View style={[styles.row, { justifyContent: 'flex-start', gap: spacing.lg }]}>
                <Logo surface={surface} variant="mark" height={32} />
                <Logo surface={surface} variant="wordmark" height={24} />
              </View>
            </View>
          ))}
        </View>

        <View style={{ gap: spacing.md }}>
          <Text variant="h2">Icons</Text>
          {Object.entries(icons).map(([group, set]) => (
            <View key={group} style={{ gap: spacing.sm }}>
              <Text variant="h3">{label(group)}</Text>
              <View style={styles.wrap}>
                {Object.entries(set).map(([name, IconCmp]) => (
                  <View key={name} style={{ width: 72, alignItems: 'center', gap: spacing.xs }}>
                    <IconCmp size={24} color={colors.textStrong} strokeWidth={1.75} />
                    <Text variant="small" style={{ textAlign: 'center' }}>{label(name)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chip: { height: 56, borderWidth: StyleSheet.hairlineWidth },
});
