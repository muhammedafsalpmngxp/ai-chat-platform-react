export type Theme = "light" | "dark";

export const THEME_KEY = "chat-ai:theme";

const systemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

/** Saved choice, else the OS setting. (index.html applies this before first paint.) */
export function getInitialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage blocked — fall back to the OS setting.
  }
  return systemTheme();
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function saveTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not persisted; the choice still applies for this tab.
  }
}
