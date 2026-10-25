import { cn } from "@/lib/utils";

export interface ProgressProps {
  /** Current value on the same scale as `max`. */
  value: number;
  max?: number;
  label: string;
  /** Hides the visible label; the accessible name stays. */
  hideLabel?: boolean;
  tone?: "accent" | "success" | "warning" | "danger";
  className?: string;
}

const TONES = {
  accent: "bg-accent-strong",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
} as const;

/**
 * Determinate progress. The fill is a transform so it animates on the
 * compositor; the percentage is exposed through ARIA rather than read from
 * the bar's width.
 */
export function Progress({
  value,
  max = 100,
  label,
  hideLabel = false,
  tone = "accent",
  className,
}: ProgressProps) {
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percent = (clamped / safeMax) * 100;

  return (
    <div className={cn("space-y-1.5", className)}>
      {hideLabel ? null : (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-medium text-ink-secondary">{label}</span>
          <span className="tabular text-xs text-ink-tertiary">
            {Math.round(percent)}%
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={Math.round(safeMax)}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className={cn(
            "h-full origin-left rounded-full transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out)]",
            TONES[tone],
          )}
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>
    </div>
  );
}
