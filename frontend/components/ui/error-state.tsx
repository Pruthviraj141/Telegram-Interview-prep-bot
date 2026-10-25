"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * Recoverable failure panel. The message is the real error text the caller
 * received; this component never invents a cause.
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-card border border-danger/30 bg-danger-subtle px-4 py-4 sm:px-5",
        className,
      )}
    >
      <div className="flex gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-danger-ink"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-danger-ink">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
            {message}
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-sunken"
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              {retryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
