import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-6 w-6",
} as const;

export interface SpinnerProps {
  size?: keyof typeof SIZES;
  /** Visible-to-screen-readers status text; omit for purely decorative use. */
  label?: string;
  className?: string;
}

export function Spinner({ size = "md", label, className }: SpinnerProps) {
  if (!label) {
    return (
      <Loader2
        aria-hidden="true"
        className={cn("animate-spin text-ink-tertiary", SIZES[size], className)}
      />
    );
  }

  return (
    <span role="status" className={cn("inline-flex items-center gap-2", className)}>
      <Loader2
        aria-hidden="true"
        className={cn("animate-spin text-ink-tertiary", SIZES[size])}
      />
      <span className="text-sm text-ink-secondary">{label}</span>
    </span>
  );
}
