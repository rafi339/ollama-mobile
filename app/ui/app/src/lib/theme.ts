import { Preferences } from "@capacitor/preferences";
import { isNativeMobile } from "@/utils/mobile";

const THEME_KEY = "ollama_theme";

export type Theme = "dark" | "light" | "system";

export async function getStoredTheme(): Promise<Theme> {
  try {
    if (isNativeMobile()) {
      const { value } = await Preferences.get({ key: THEME_KEY });
      if (value === "dark" || value === "light" || value === "system") {
        return value;
      }
    }
  } catch {
    // Fallback to localStorage
  }
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light" || stored === "system") {
    return stored;
  }
  return "system";
}

export async function setStoredTheme(theme: Theme): Promise<void> {
  try {
    if (isNativeMobile()) {
      await Preferences.set({ key: THEME_KEY, value: theme });
    }
  } catch {
    // Fallback to localStorage only
  }
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme: Theme): void {
  const html = document.documentElement;
  if (theme === "dark") {
    html.classList.add("dark");
  } else if (theme === "light") {
    html.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  }
}

export function initTheme(): void {
  getStoredTheme().then((theme) => {
    applyTheme(theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", () => {
      getStoredTheme().then((current) => {
        if (current === "system") {
          applyTheme("system");
        }
      });
    });
  });
}
