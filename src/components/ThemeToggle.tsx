"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

/** Same resolution as the inline script in layout.tsx: saved choice, else the OS setting. */
function resolveTheme(): Theme {
  try {
    const saved = localStorage.getItem("ir-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable */
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// data-theme is owned by the inline script in layout.tsx; React only reads and flips it.
function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const getTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function ThemeToggle() {
  // Dev Strict Mode remounts <html> and drops data-theme; re-apply before paint. No-op in production.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolveTheme();
  }, []);
  const theme = useSyncExternalStore<Theme | null>(subscribe, getTheme, () => null);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="btn btn-ghost h-8 w-8 p-0"
      aria-label={theme ? `Switch to ${next} theme` : "Switch theme"}
      title={theme ? `Switch to ${next} theme` : undefined}
      onClick={() => {
        // Swap palettes in one frame: suspend colour transitions so nothing fades between themes.
        const root = document.documentElement;
        root.classList.add("theme-switching");
        root.dataset.theme = next;
        requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
        try {
          localStorage.setItem("ir-theme", next);
        } catch {
          /* storage unavailable: the choice lasts for this page only */
        }
      }}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </svg>
  );
}
