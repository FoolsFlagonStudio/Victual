import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from '@/brand/Logo';
import { Text } from '@/components/Text';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/themeContext';

// Layout shared by the auth screens, measured from the 402x874 Figma frames:
// - content column 277pt wide, centered
// - mark top sits 118pt below the top of the frame (status bar included)
// - mark 80x79, then the title 47pt below, then the form 44pt below that
// - titles are 28pt like H2 but set in Poppins Bold (the H2 style is SemiBold)
const DESIGN_TOP = 118;
export const AUTH_COLUMN = 277;

type AuthScreenProps = {
  /** H2 title under the mark. */
  title?: string;
  /** Replaces the bowl mark (e.g. the envelope on Verify Email). */
  hero?: ReactNode;
  /** Fine print under the title. */
  subtitle?: ReactNode;
  /** Distance from the top of the screen to the hero, in Figma points. */
  top?: number;
  children: ReactNode;
};

export function AuthScreen({ title, hero, subtitle, top = DESIGN_TOP, children }: AuthScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(top, insets.top + 24), paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.column}>
          <View style={styles.hero}>{hero ?? <Logo variant="mark" tone="accent" height={79} />}</View>
          {title ? (
            <Text variant="h2" style={[styles.title, { fontFamily: fontFamily('ui', 700) }]}>
              {title}
            </Text>
          ) : null}
          {subtitle ? <View style={styles.subtitle}>{subtitle}</View> : null}
          <View style={{ marginTop: title ? 30 : 0 }}>{children}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 24 },
  column: { width: '100%', maxWidth: AUTH_COLUMN },
  hero: { alignItems: 'center' },
  title: { textAlign: 'center', marginTop: 48 },
  subtitle: { marginTop: 8, alignItems: 'center' },
});
