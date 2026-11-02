import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConfigProvider, App as AntdApp } from 'antd';
import { getAntdTheme } from './antdTheme';
import type { ColorMode } from './tokens';
import { ThemeContext, type ThemeContextValue, type ThemePreference } from './themeContext';
const STORAGE_KEY = 'victual-theme';

function readStoredPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    // The marketing pages are designed light-only (dark colors are still provisional), so default to light.
    return v === 'dark' || v === 'system' ? v : 'light';
  } catch {
    return 'light';
  }
}

function useSystemMode(): ColorMode {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return dark ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const systemMode = useSystemMode();
  const mode = preference === 'system' ? systemMode : preference;

  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', preference);
  }, [preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      preference,
      setPreference: (p) => {
        setPreferenceState(p);
        try {
          localStorage.setItem(STORAGE_KEY, p);
        } catch {
          /* storage unavailable - preference just won't persist */
        }
      },
    }),
    [mode, preference],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={getAntdTheme(mode)}>
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
