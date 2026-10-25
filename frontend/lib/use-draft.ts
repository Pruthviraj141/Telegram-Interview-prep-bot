"use client";

import { useEffect, useState } from "react";

/**
 * Keeps an answer draft in localStorage, debounced so typing stays cheap.
 *
 * The initial value is read lazily (never from an effect) and the draft is
 * removed as soon as the answer is submitted, so a reload never restores an
 * answer that was already scored.
 */
export function useDraft(key: string) {
  const [value, setValue] = useState<string>(() => {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (value) {
          localStorage.setItem(key, value);
          setSaved(true);
        } else {
          localStorage.removeItem(key);
          setSaved(false);
        }
      } catch {
        // Storage can be unavailable (private mode); drafts are optional.
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [key, value]);

  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage failures — clearing state is still useful.
    }
    setValue("");
    setSaved(false);
  };

  return { value, setValue, saved, clear };
}
