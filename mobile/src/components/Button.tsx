import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { Text } from './Text';
import { useTheme } from '@/theme/themeContext';

type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  loading?: boolean;
  /** md: auth screens (12pt label, hugs content). lg: onboarding (14pt label, 108pt min width). */
  size?: 'md' | 'lg';
};

/** Primary button: sage fill, caps label. Disabled turns gray-green, per the onboarding designs. */
export function Button({ label, loading, disabled, size = 'md', style, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const large = size === 'lg';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      hitSlop={8}
      style={(state) => [
        styles.button,
        large && styles.large,
        {
          backgroundColor: disabled ? colors.primaryDisabled : colors.primary,
          opacity: state.pressed ? 0.85 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      {/* Keep the label in the layout while loading so the button doesn't change width. */}
      <View style={{ opacity: loading ? 0 : 1 }}>
        <Text variant={large ? 'buttonLarge' : 'button'} color={disabled ? 'onPrimaryDisabled' : 'onPrimary'}>
          {label.toUpperCase()}
        </Text>
      </View>
      {loading && <ActivityIndicator color={colors.onPrimary} size="small" style={StyleSheet.absoluteFill} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'center',
    height: 30,
    paddingHorizontal: 18,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
  },
  large: {
    minWidth: 108,
    paddingHorizontal: 22,
  },
});
