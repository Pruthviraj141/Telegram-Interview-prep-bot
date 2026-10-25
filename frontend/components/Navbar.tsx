"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CandidateUser } from "@/lib/api";
import { ChevronRight, KeyRound, Menu, Mic, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  PRIMARY_NAV,
  SECONDARY_NAV,
  isActivePath,
  type NavItem,
} from "@/components/shell/nav-items";

interface NavbarProps {
  user?: CandidateUser | null;
}

const ALL_NAV: NavItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV];

export const Navbar: React.FC<NavbarProps> = ({ user }) => {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = (user?.display_name || user?.email || "C")[0].toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex min-w-0 shrink-0 items-center gap-2.5"
            aria-label="AI Interview Coach — dashboard"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink text-canvas">
              <Mic aria-hidden="true" className="h-4 w-4" />
            </span>
            <span className="hidden text-sm font-semibold tracking-tight text-ink sm:inline">
              AI Interview Coach
            </span>
          </Link>

          {/* Desktop / laptop navigation — tablets use the bottom bar. */}
          <nav
            aria-label="Main"
            className="hidden flex-1 items-center gap-0.5 lg:flex"
          >
            {PRIMARY_NAV.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-surface-sunken text-ink"
                      : item.emphasis
                        ? "text-accent-strong hover:bg-surface-sunken"
                        : "text-ink-secondary hover:bg-surface-sunken hover:text-ink",
                  )}
                >
                  <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />

            {SECONDARY_NAV.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  title={item.label}
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                    active
                      ? "bg-surface-sunken text-ink"
                      : "text-ink-secondary hover:bg-surface-sunken hover:text-ink",
                  )}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-1.5 lg:ml-0">
            {user?.groq_key_configured ? (
              <span className="hidden max-w-[9rem] items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-secondary sm:inline-flex">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                />
                <span className="truncate">
                  {user.groq_key_masked || "Groq active"}
                </span>
              </span>
            ) : (
              <Link
                href="/settings"
                className="hidden items-center gap-1.5 rounded-full border border-warning/40 bg-warning-subtle px-2.5 py-1 text-[11px] font-medium text-warning-ink sm:inline-flex"
              >
                <KeyRound aria-hidden="true" className="h-3 w-3" />
                <span className="truncate">Add API key</span>
              </Link>
            )}

            <ThemeToggle />

            <Link
              href="/settings"
              aria-label="Profile and settings"
              title="Profile and settings"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-xs font-semibold text-ink transition-colors hover:border-line-strong"
            >
              {initials}
            </Link>

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="nav-sheet"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink lg:hidden"
            >
              {menuOpen ? (
                <X aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Menu aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div
            id="nav-sheet"
            className="animate-slide-down border-t border-line bg-surface px-3 pb-3 pt-2 lg:hidden"
          >
            <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-tertiary">
              All sections
            </p>
            <ul>
              {ALL_NAV.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center justify-between rounded-lg px-3 text-sm font-medium transition-colors",
                        active
                          ? "bg-surface-sunken text-ink"
                          : "text-ink-secondary hover:bg-surface-sunken hover:text-ink",
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon aria-hidden="true" className="h-4 w-4" />
                        {item.label}
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="h-3.5 w-3.5 text-ink-tertiary"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </header>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 pb-safe backdrop-blur-lg lg:hidden"
      >
        <ul className="mx-auto flex h-14 max-w-lg items-stretch">
          {PRIMARY_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);
            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-full min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 transition-colors",
                    active
                      ? "text-ink"
                      : item.emphasis
                        ? "text-accent-strong"
                        : "text-ink-secondary hover:text-ink",
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0 mx-auto h-0.5 w-8 rounded-full bg-accent-strong"
                    />
                  ) : null}
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span
                    className={cn(
                      "w-full truncate text-center text-[10px] leading-none",
                      active ? "font-semibold" : "font-medium",
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
};
