import * as React from "react";
import type { CandidateUser } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { cn } from "@/lib/utils";

export type ShellWidth = "wide" | "default" | "narrow" | "full";

const WIDTHS: Record<ShellWidth, string> = {
  wide: "max-w-7xl",
  default: "max-w-4xl",
  narrow: "max-w-3xl",
  full: "max-w-none",
};

export interface AppShellProps {
  user?: CandidateUser | null;
  children: React.ReactNode;
  /** Content width; matches the width each page already used. */
  width?: ShellWidth;
  className?: string;
  /** Extra classes for the content column (spacing between sections). */
  contentClassName?: string;
}

/**
 * One page frame for every route: skip link, top bar, content column, and the
 * bottom tab bar's reserved space. Widths stay per-page so layouts do not
 * reflow when a page adopts the shell.
 */
export function AppShell({
  user,
  children,
  width = "default",
  className,
  contentClassName,
}: AppShellProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-overlay"
      >
        Skip to content
      </a>

      <Navbar user={user} />

      <main
        id="main"
        className={cn(
          "w-full flex-1 px-4 py-6 pb-nav sm:px-6 sm:py-8 lg:px-8 lg:pb-12",
          width === "full" ? "" : "mx-auto",
          WIDTHS[width],
          className,
        )}
      >
        {contentClassName ? (
          <div className={contentClassName}>{children}</div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
