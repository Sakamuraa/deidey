import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "mizu-theme";

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Theme state for the manual toggle.
 *
 * The inline script in index.html already set `data-theme` before first paint.
 * This hook only keeps React in sync and persists the choice. It deliberately
 * does not write to documentElement on mount: that would race the pre-paint
 * script and can flip the theme once on load.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private mode or storage disabled. The toggle still works for this
        // visit; it just will not be remembered.
      }
      return next;
    });
  }, []);

  // Follow the OS only while the visitor has not made an explicit choice.
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia("(prefers-color-scheme: light)");
    } catch {
      return;
    }

    const onChange = (event: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return;
      } catch {
        // Ignore and fall through to following the OS.
      }
      document.documentElement.dataset.theme = event.matches ? "light" : "dark";
    };

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return { theme, toggleTheme };
}