"use client";

import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

const listeners = new Set<() => void>();
let cachedPreference: ThemePreference | null = null;

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

/**
 * Apply a preference to the document. Safe to call before hydration; the
 * inline script in the root layout does the same work pre-paint.
 */
export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  if (typeof document === "undefined") return resolved;

  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  document.cookie = `theme=${resolved};path=/;max-age=31536000;samesite=lax`;
  return resolved;
}

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  if (cachedPreference) return cachedPreference;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    cachedPreference = isThemePreference(stored) ? stored : "system";
  } catch {
    cachedPreference = "system";
  }
  return cachedPreference;
}

export function setThemePreference(preference: ThemePreference): void {
  cachedPreference = preference;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable (private mode, quota); the in-memory value
    // still applies for this session.
  }
  applyTheme(preference);
  emit();
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

let storageBound = false;

/** One shared `storage` listener, bound on first subscriber. */
function bindStorage(): void {
  if (storageBound || typeof window === "undefined") return;
  storageBound = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    cachedPreference = isThemePreference(event.newValue)
      ? event.newValue
      : "system";
    applyTheme(cachedPreference);
    emit();
  });
}

function subscribe(listener: () => void): () => void {
  bindStorage();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    subscribe,
    getStoredTheme,
    () => "system" as ThemePreference,
  );
}
