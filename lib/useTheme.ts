"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const THEME_CHANGE_EVENT = "spot-logger-theme-change";

/**
 * The real theme lives on <html data-theme> (set before paint by the
 * blocking script in app/layout.tsx, and by setTheme() below), not in React
 * state - useSyncExternalStore reads it directly so the server snapshot
 * ("light", since there's no document during SSR) and the client's first
 * hydration pass never fight each other, then correctly re-renders once
 * React checks the real DOM value client-side. A plain useState+useEffect
 * pair would only get this right by calling setState from inside the
 * effect, which is exactly the footgun this hook exists to avoid.
 *
 * Shared by ThemeToggle (which flips it) and the maps (which swap to dark
 * tiles), so both always agree on the current theme.
 */
function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function subscribe(callback: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, callback);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setTheme(next: Theme) {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("theme", next);
  } catch {
    // Private browsing or storage disabled - the toggle still works for
    // this page load, it just won't be remembered next visit.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
