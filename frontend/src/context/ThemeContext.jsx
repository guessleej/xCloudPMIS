import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const THEME_STORAGE_KEY = 'xcloud-theme-mode';
const ThemeContext = createContext(null);

function readStoredTheme() {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}

  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(readStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = mode;
    root.style.colorScheme = mode;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {}
  }, [mode]);

  const value = useMemo(() => ({
    mode,
    isDark: mode === 'dark',
    setMode,
    toggleMode: () => setMode((current) => current === 'dark' ? 'light' : 'dark'),
  }), [mode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme 必須在 <ThemeProvider> 內使用');
  }
  return context;
}

