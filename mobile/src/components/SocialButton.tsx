import { Image, Pressable, StyleSheet, type ImageSourcePropType } from 'react-native';
import { Text } from './Text';
import { tokens } from '@/theme/tokens';

// Brand logos for the social buttons. Google and Apple require their official
// marks, so export them from the Figma file (or each company's brand page) into
// mobile/assets/images/social/ and swap these in:
//   google: require('@/assets/images/social/google.png'),
//   apple: require('@/assets/images/social/apple.png'),
const logos: Record<'google' | 'apple', ImageSourcePropType | null> = {
  google: null,
  apple: null,
};

type SocialButtonProps = {
  provider: 'google' | 'apple';
  label: string;
  onPress: () => void;
};

/** White "Sign in with ..." button from the auth designs. Hidden until features.socialSignIn is on. */
export function SocialButton({ provider, label, onPress }: SocialButtonProps) {
  const logo = logos[provider];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.85 : 1 }]}
    >
      {logo && <Image source={logo} style={styles.logo} />}
      {/* Always dark text: the button stays white in dark mode too, per Google/Apple guidelines. */}
      <Text variant="social" style={{ color: tokens.palette.black }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: tokens.palette.white,
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.2)',
  },
  logo: { width: 16, height: 16 },
});
