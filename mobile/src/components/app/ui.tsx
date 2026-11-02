// Shared pieces for the main app screens (measured from the 402x874 frames).
import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View, type ScrollViewProps, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { features } from '@/config/features';
import { Icon } from '@/theme/icons';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/themeContext';

export const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};

/** Scrollable screen body with the design's side gutter. */
export function Screen({
  children,
  header,
  scroll = true,
  contentStyle,
  ...scrollProps
}: { children: ReactNode; header?: ReactNode; scroll?: boolean; contentStyle?: ViewStyle } & ScrollViewProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = { paddingHorizontal: 20, paddingBottom: 32 };
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {header}
      {scroll ? (
        <ScrollView contentContainerStyle={[pad, contentStyle]} keyboardShouldPersistTaps="handled" {...scrollProps}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
    </View>
  );
}

/** Back chevron + optional title/right action, for screens pushed over the tabs. */
export function BackHeader({ title, right, onBack }: { title?: string; right?: ReactNode; onBack?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.backHeader}>
      <Pressable
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/home')))}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.backButton}
      >
        <Icon.back size={26} color={colors.textStrong} />
      </Pressable>
      <Text variant="h3" style={{ flex: 1, textAlign: 'center', fontFamily: fontFamily('ui', 600) }} numberOfLines={1}>
        {title ?? ''}
      </Text>
      <View style={styles.backButton}>{right}</View>
    </View>
  );
}

/** "Oct 26 - Nov 1" eyebrow + big heading. */
export function PageTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <View style={styles.pageTitle}>
      <View style={{ flex: 1 }}>
        {eyebrow ? (
          <Text variant="label" color="subtle">
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="h2" color="selected" accessibilityRole="header" style={{ fontFamily: fontFamily('ui', 700) }}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text variant="h3" color="selected" accessibilityRole="header" style={{ fontFamily: fontFamily('ui', 600), flex: 1 }}>
        {children}
      </Text>
      {right}
    </View>
  );
}

/** Light sage note, e.g. "$15.80 under budget this week". */
export function Callout({ children, tone = 'good', center }: { children: ReactNode; tone?: 'good' | 'warn'; center?: boolean }) {
  const { mode } = useTheme();
  const bg = tone === 'good' ? (mode === 'dark' ? '#3E5544' : '#DDE8DA') : mode === 'dark' ? '#5A3A47' : '#F1DCE5';
  const fg = tone === 'good' ? (mode === 'dark' ? '#CFE5CF' : '#2F5A33') : mode === 'dark' ? '#F3D3E0' : '#6E2A4A';
  return (
    <View style={[styles.callout, { backgroundColor: bg }]}>
      <Text variant="label" style={{ color: fg, fontFamily: fontFamily('ui', 600), textAlign: center ? 'center' : 'left' }}>
        {children}
      </Text>
    </View>
  );
}

/** Horizontal bar made of colored segments over a track. */
export function SegmentBar({ segments, track, height = 10 }: { segments: { value: number; color: string }[]; track: string; height?: number }) {
  return (
    <View style={[styles.bar, { height, borderRadius: height / 2, backgroundColor: track }]} accessible={false}>
      {segments
        .filter((s) => s.value > 0)
        .map((s, i) => (
          <View key={i} style={{ width: `${Math.min(100, s.value * 100)}%`, backgroundColor: s.color, height, marginRight: 2 }} />
        ))}
    </View>
  );
}

export function EmptyState({ title, body, action, onAction, busy }: { title: string; body?: string; action?: string; onAction?: () => void; busy?: boolean }) {
  return (
    <View style={styles.empty}>
      <Text variant="h2" color="textStrong" style={{ textAlign: 'center', fontFamily: fontFamily('ui', 700), fontSize: 26, lineHeight: 34 }}>
        {title}
      </Text>
      {body ? (
        <Text variant="body" color="text" style={{ textAlign: 'center', marginTop: 18 }}>
          {body}
        </Text>
      ) : null}
      {action && onAction ? <Button label={action} size="lg" onPress={onAction} loading={busy} style={{ marginTop: 22 }} /> : null}
    </View>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: 60, alignItems: 'center' }}>
      <ActivityIndicator color={colors.selected} />
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
      <Text variant="bodySmall" color="danger" style={{ textAlign: 'center' }}>
        {message}
      </Text>
      {onRetry ? (
        <Text variant="label" style={{ textDecorationLine: 'underline' }} onPress={onRetry} accessibilityRole="button">
          Try again
        </Text>
      ) : null}
    </View>
  );
}

/** Shown while meal plans are simulated on the device. */
export function PreviewBanner() {
  const { colors } = useTheme();
  if (!features.demoMode && !features.mockMealPlans) return null;
  return (
    <View style={[styles.banner, { borderColor: colors.primary }]}>
      <Icon.info size={14} color={colors.subtle} />
      <Text variant="fine" color="subtle" style={{ flex: 1 }}>
        {features.demoMode ? 'Demo mode: sample data, nothing is saved to a server.' : 'Preview: meal plans are simulated on this phone, not built by the server (EXPO_PUBLIC_MOCK_PLANS).'}
      </Text>
    </View>
  );
}

/** Settings-style row: icon, label + value, chevron. */
export function Row({ Glyph, label, value, onPress, danger }: { Glyph?: (typeof Icon)[keyof typeof Icon]; label: string; value?: string; onPress?: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border }, pressed && { opacity: 0.6 }]}
    >
      {Glyph ? <Glyph size={22} color={danger ? colors.danger : colors.primary} strokeWidth={1.75} /> : null}
      <View style={{ flex: 1 }}>
        <Text variant="option" color={danger ? 'danger' : 'heading'}>
          {label}
        </Text>
        {value ? (
          <Text variant="label" color="subtle" numberOfLines={2}>
            {value}
          </Text>
        ) : null}
      </View>
      {onPress && !danger ? <Icon.next size={18} color={colors.muted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 52 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 20, marginBottom: 24 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', marginTop: 28, marginBottom: 14 },
  callout: { borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16 },
  bar: { flexDirection: 'row', overflow: 'hidden', width: '100%' },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 8 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
