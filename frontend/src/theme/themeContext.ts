import { createContext, useContext } from 'react';
import type { ColorMode } from './tokens';

export type ThemePreference = ColorMode | 'system';

export type ThemeContextValue = {
  mode: ColorMode;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
