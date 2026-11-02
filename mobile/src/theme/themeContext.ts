import { createContext, useContext } from 'react';
import { tokens, type ColorMode } from './tokens';

export type ThemePreference = ColorMode | 'system';

export type Theme = {
  mode: ColorMode;
  colors: (typeof tokens.colors)[ColorMode];
  palette: typeof tokens.palette;
  spacing: typeof tokens.spacing;
  radius: typeof tokens.radius;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
};

export const ThemeContext = createContext<Theme | null>(null);

/** Current theme: colors for the active mode plus spacing/radius tokens. */
export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
