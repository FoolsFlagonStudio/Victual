import { theme as antdTheme, type ThemeConfig } from 'antd';
import { tokens, type ColorMode } from './tokens';

const { typography: type, spacing, radius } = tokens;
const fontUi = `'${tokens.fonts.ui}', system-ui, -apple-system, 'Segoe UI', sans-serif`;

/** Maps Victual tokens onto Ant Design's theme so AntD components match the Figma. */
export function getAntdTheme(mode: ColorMode): ThemeConfig {
  const c = tokens.colors[mode];
  return {
    algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: c.primary,
      colorInfo: c.primary,
      colorLink: c.primary,
      colorTextLightSolid: c.onPrimary,
      colorBgBase: c.background,
      colorBgLayout: c.background,
      colorBgContainer: c.surface,
      colorBgElevated: c.surface,
      colorTextBase: c.text,
      colorBorder: c.border,
      colorBorderSecondary: c.border,
      fontFamily: fontUi,
      fontSize: type.body.size,
      fontSizeSM: type.small.size,
      fontSizeHeading1: type.h1.size,
      fontSizeHeading2: type.h2.size,
      fontSizeHeading3: type.h3.size,
      lineHeight: type.body.lineHeight / type.body.size,
      borderRadius: radius.md,
      borderRadiusSM: radius.sm,
      borderRadiusLG: radius.lg,
      padding: spacing.lg,
      paddingSM: spacing.md,
      paddingXS: spacing.sm,
      margin: spacing.lg,
    },
    components: {
      Typography: {
        titleMarginBottom: 0,
        titleMarginTop: 0,
      },
      Button: {
        fontWeight: 600,
        primaryShadow: 'none',
      },
    },
  };
}
