"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(current);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pb-theme", next);
    } catch {
      /* private mode */
    }
    setTheme(next);
  };

  // Render nothing pre-mount so SSR markup matches the client's first paint.
  if (theme === null) return null;

  const isDark = theme === "dark";
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
