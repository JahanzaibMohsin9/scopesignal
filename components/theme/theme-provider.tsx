"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AppTheme = "dark" | "light";

const THEME_STORAGE_KEY = "scopesignal.theme";

type ThemeContextValue = {
  resolvedTheme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme;
}

function getInitialTheme(): AppTheme {
  if (typeof window === "undefined") {
    return "dark";
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [resolvedTheme, setResolvedTheme] = useState<AppTheme>(getInitialTheme);

  useEffect(() => {
    applyTheme(resolvedTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
  }, [resolvedTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      resolvedTheme,
      setTheme: (theme) => setResolvedTheme(theme),
      toggleTheme: () =>
        setResolvedTheme((theme) => (theme === "dark" ? "light" : "dark")),
    }),
    [resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider.");
  }

  return context;
}
