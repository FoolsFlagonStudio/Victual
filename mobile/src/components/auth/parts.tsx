// Small pieces shared by the auth screens.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Link, type Href } from 'expo-router';
import { Text } from '@/components/Text';
import { SocialButton } from '@/components/SocialButton';
import { features } from '@/config/features';
import { useTheme } from '@/theme/themeContext';

export function Divider({ spacing = 24 }: { spacing?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing }} />;
}

/** Fields stacked with no gap, like the designs (each row draws its own underline). */
export function Fields({ children }: { children: ReactNode }) {
  return <View>{children}</View>;
}

/** Server/form-level error shown above the submit button. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Text variant="fine" color="danger" style={styles.formError} accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}

/** "Already a user? Login" style footer line. */
export function FooterLink({ prompt, label, href }: { prompt: string; label: string; href: Href }) {
  return (
    <Text variant="fine" style={styles.footer}>
      {prompt}{' '}
      <Link href={href} replace style={styles.link}>
        {label}
      </Link>
    </Text>
  );
}

export function InlineLink({ label, onPress, href }: { label: string; onPress?: () => void; href?: Href }) {
  if (href) {
    return (
      <Link href={href} style={styles.link}>
        {label}
      </Link>
    );
  }
  return (
    <Text variant="fine" style={styles.link} onPress={onPress} accessibilityRole="link">
      {label}
    </Text>
  );
}

/** Divider + Google/Apple buttons. Renders nothing until features.socialSignIn is on. */
export function SocialSignIn({ mode, onPress }: { mode: 'signIn' | 'signUp'; onPress: (p: 'google' | 'apple') => void }) {
  if (!features.socialSignIn) return null;
  const verb = mode === 'signIn' ? 'Sign in' : 'Sign up';
  return (
    <>
      <Divider spacing={28} />
      <View style={{ alignItems: 'center', gap: 4 }}>
        <SocialButton provider="google" label={`${verb} with Google`} onPress={() => onPress('google')} />
        <Text variant="fine">Or</Text>
        <SocialButton provider="apple" label={`${verb} with Apple`} onPress={() => onPress('apple')} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  formError: { textAlign: 'center', marginBottom: 12 },
  footer: { textAlign: 'center', marginTop: 20 },
  link: { textDecorationLine: 'underline' },
});
