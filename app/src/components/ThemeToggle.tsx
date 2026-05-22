"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

/**
 * Subscribe to `data-theme` changes on <html>. Uses a MutationObserver so any
 * code that flips the attribute (this component, the boot script in layout.tsx,
 * a future per-page override) re-renders consumers without manual setState.
 */
const themeSubscribe = (cb: () => void) => {
  if (typeof window === "undefined") return () => {};
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => obs.disconnect();
};

const getThemeSnapshot = (): Theme =>
  typeof document !== "undefined" &&
  document.documentElement.dataset.theme === "dark"
    ? "dark"
    : "light";

const mountSubscribe = () => () => {};

export const ThemeToggle = () => {
  const mounted = useSyncExternalStore(
    mountSubscribe,
    () => true,
    () => false
  );
  const theme = useSyncExternalStore(
    themeSubscribe,
    getThemeSnapshot,
    () => "light" as Theme
  );

  // Don't render until mounted so SSR markup matches the client's first paint.
  if (!mounted) return null;

  const isDark = theme === "dark";
  const toggle = () => {
    const next: Theme = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pb-theme", next);
    } catch {
      /* private mode */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="pb-theme-toggle"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        {isDark ? (
          <circle cx="12" cy="12" r="5" fill="currentColor" />
        ) : (
          <path
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
            fill="currentColor"
          />
        )}
      </svg>
      <span>{isDark ? "Light" : "Dark"} mode</span>
    </button>
  );
};
