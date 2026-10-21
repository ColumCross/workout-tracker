import { useSyncExternalStore } from "react";

import type { SystemTheme } from "./useSystemTheme";

const query = "(prefers-color-scheme: light)";

function getBrowserTheme(): SystemTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia(query).matches ? "light" : "dark";
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mediaQuery = window.matchMedia(query);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

export function useSystemTheme(): SystemTheme {
  return useSyncExternalStore(subscribe, getBrowserTheme, () => "dark");
}
