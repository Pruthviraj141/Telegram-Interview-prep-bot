import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "outline";

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: "border-transparent bg-surface-sunken text-ink-secondary",
  accent: "border-transparent bg-accent-subtle text-accent-strong",
  success: "border-transparent bg-success-subtle text-success-ink",
  warning: "border-transparent bg-warning-subtle text-warning-ink",
  danger: "border-transparent bg-danger-subtle text-danger-ink",
  outline: "border-line bg-transparent text-ink-secondary",
};

export interface BadgeProps extends React.ComponentProps<"span"> {
  variant?: BadgeVariant;
}

/**
 * Small status label. Colour is never the only signal — callers pair a badge
 * with text or an icon that states the same thing.
 */
export function Badge({
  variant = "neutral",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
