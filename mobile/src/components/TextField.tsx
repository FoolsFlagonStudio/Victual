import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { Icon } from '@/theme/icons';
import { tokens } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/themeContext';

type TextFieldProps = Omit<TextInputProps, 'placeholderTextColor' | 'style'> & {
  /** Shown as the placeholder, and as the accessibility label. */
  label: string;
  error?: string | null;
  /** Password field with a show/hide eye. */
  password?: boolean;
};

const t = tokens.typography.input;

/** Underlined input from the auth designs: 41pt tall rows with a hairline underline. */
export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  { label, error, password, ...inputProps },
  ref,
) {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);

  const lineColor = error ? colors.danger : focused ? colors.primary : colors.divider;

  return (
    <View>
      <View style={[styles.row, { borderBottomColor: lineColor }, focused && styles.focused]}>
        <TextInput
          ref={ref}
          placeholder={label}
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          secureTextEntry={password && hidden}
          autoCapitalize={password ? 'none' : inputProps.autoCapitalize}
          autoCorrect={password ? false : inputProps.autoCorrect}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              color: colors.text,
              fontFamily: fontFamily(t.font, t.weight),
              fontSize: t.size,
              letterSpacing: t.letterSpacing,
            },
          ]}
          {...inputProps}
        />
        {password && (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={hidden ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()}`}
          >
            {hidden ? (
              <Icon.showPassword size={20} color={colors.primary} />
            ) : (
              <Icon.hidePassword size={20} color={colors.primary} />
            )}
          </Pressable>
        )}
      </View>
      {error ? (
        <Text variant="fine" color="danger" style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    height: 41,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  focused: {
    borderBottomWidth: 1.5,
  },
  input: {
    flex: 1,
    padding: 0,
    lineHeight: undefined,
  },
  error: {
    marginTop: 4,
  },
});
