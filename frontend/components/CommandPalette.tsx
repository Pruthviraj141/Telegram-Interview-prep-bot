"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { setThemePreference, useThemePreference } from "@/lib/theme";

export interface CommandItem {
  label: string;
  /** Short trailing hint, e.g. the current value of a toggle. */
  hint?: string;
  href?: Route;
  run?: () => void;
}

interface CommandPaletteProps {
  items: CommandItem[];
  onClose: () => void;
}

const THEME_ORDER = ["system", "light", "dark"] as const;
const THEME_LABELS = { system: "System", light: "Light", dark: "Dark" } as const;

/**
 * Native `<dialog>` command palette. Mounted only after the first ⌘K, so its
 * code and markup never enter the initial page payload.
 */
export function CommandPalette({ items, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const theme = useThemePreference();

  const nextTheme =
    THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];

  const all: CommandItem[] = [
    ...items,
    {
      label: `Theme: switch to ${THEME_LABELS[nextTheme]}`,
      hint: `Now ${THEME_LABELS[theme]}`,
      run: () => setThemePreference(nextTheme),
    },
  ];

  const shown = all.filter((x) =>
    x.label.toLowerCase().includes(q.trim().toLowerCase()),
  );

  useEffect(() => {
    dialogRef.current?.showModal();
    inputRef.current?.focus();
  }, []);

  const go = (item: CommandItem | undefined) => {
    if (!item) return;
    dialogRef.current?.close();
    if (item.href) router.push(item.href);
    else item.run?.();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label="Command palette"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
      className="m-auto w-[min(32rem,92vw)] rounded-card border border-line bg-surface p-0 text-ink shadow-overlay backdrop:bg-black/40"
    >
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-secondary" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setI((n) => Math.min(n + 1, shown.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setI((n) => Math.max(n - 1, 0));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              go(shown[i]);
            }
          }}
          aria-label="Search commands"
          aria-controls="command-list"
          aria-activedescendant={shown[i] ? `command-${i}` : undefined}
          placeholder="Jump to a page or action…"
          className="w-full bg-transparent py-3 text-base text-ink outline-none placeholder:text-ink-secondary"
        />
        <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary sm:block">
          Esc
        </kbd>
      </div>

      <ul id="command-list" role="listbox" className="max-h-72 overflow-auto p-1">
        {shown.map((item, n) => (
          <li
            key={item.label}
            id={`command-${n}`}
            role="option"
            aria-selected={n === i}
          >
            <button
              type="button"
              onClick={() => go(item)}
              onMouseMove={() => setI(n)}
              className={cn(
                "flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                n === i
                  ? "bg-accent-subtle text-ink"
                  : "text-ink-secondary hover:bg-surface-sunken hover:text-ink",
              )}
            >
              <span className="truncate">{item.label}</span>
              {item.hint ? (
                <span className="shrink-0 text-[11px] text-ink-secondary">
                  {item.hint}
                </span>
              ) : null}
            </button>
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-ink-secondary">
            No matches
          </li>
        ) : null}
      </ul>
    </dialog>
  );
}
