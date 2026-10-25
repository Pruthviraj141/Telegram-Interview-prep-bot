"use client";

import { useEffect } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyTheme,
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const ORDER: ThemePreference[] = ["system", "light", "dark"];

const LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const ICONS = {
  system: Monitor,
  light: Sun,
  dark: Moon,
} as const;

interface ThemeToggleProps {
  variant?: "icon" | "segmented";
  className?: string;
  /**
   * Keeps the legend available to screen readers but hides it visually. Use
   * when the surrounding card already has a visible heading for this control.
   */
  hideLegend?: boolean;
}

/**
 * Theme control. The icon variant cycles System → Light → Dark and states the
 * next action for screen readers; the segmented variant is the labelled
 * control used on Settings.
 */
export function ThemeToggle({
  variant = "icon",
  className,
  hideLegend = false,
}: ThemeToggleProps) {
  const preference = useThemePreference();

  useEffect(() => {
    applyTheme(preference);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(preference);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  if (variant === "segmented") {
    return (
      <fieldset className={cn("min-w-0", className)}>
        <legend
          className={cn(
            "mb-1.5 text-xs font-medium text-ink-secondary",
            hideLegend && "sr-only",
          )}
        >
          Appearance
        </legend>
        <div className="inline-flex rounded-lg border border-line bg-surface-sunken p-0.5">
          {ORDER.map((option) => {
            const Icon = ICONS[option];
            const checked = preference === option;
            return (
              <label
                key={option}
                className={cn(
                  "relative inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                  checked
                    ? "bg-surface text-ink shadow-card"
                    : "text-ink-secondary hover:text-ink",
                )}
              >
                <input
                  type="radio"
                  name="theme"
                  value={option}
                  checked={checked}
                  onChange={() => setThemePreference(option)}
                  className="sr-only"
                />
                <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                <span>{LABELS[option]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  const index = ORDER.indexOf(preference);
  const next = ORDER[(index + 1) % ORDER.length];
  const Icon = ICONS[preference];

  return (
    <button
      type="button"
      onClick={() => setThemePreference(next)}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink",
        className,
      )}
      aria-label={`Theme: ${LABELS[preference]}. Switch to ${LABELS[next].toLowerCase()}.`}
      title={`Theme: ${LABELS[preference]} — switch to ${LABELS[next]}`}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
