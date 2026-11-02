import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { tokens, type ColorRole, type TypeVariant } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/themeContext';

export type TextProps = RNTextProps & {
  /** Type style from the Figma type sheet. Defaults to body. */
  variant?: TypeVariant;
  /** Theme color role. Defaults to textStrong for headings, text otherwise. */
  color?: ColorRole;
};

const headings: TypeVariant[] = ['brand', 'h1', 'h2', 'h3'];

/** Themed text. Use this instead of React Native's Text so fonts and colors stay on-brand. */
export function Text({ variant = 'body', color, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const t = tokens.typography[variant];
  const role = color ?? (headings.includes(variant) ? 'textStrong' : 'text');

  return (
    <RNText
      accessibilityRole={headings.includes(variant) ? 'header' : undefined}
      style={[
        {
          fontFamily: fontFamily(t.font, t.weight),
          fontSize: t.size,
          lineHeight: t.lineHeight,
          letterSpacing: 'letterSpacing' in t ? t.letterSpacing : undefined,
          color: colors[role],
        },
        style,
      ]}
      {...rest}
    />
  );
}
