import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.ComponentProps<"div"> {
  /** Tailwind sizing utilities, e.g. `h-4 w-32`. */
  className?: string;
}

/**
 * Loading placeholder. It is hidden from assistive tech; pair a block of
 * skeletons with a single live status message where the result will land.
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-surface-sunken",
        className,
      )}
      {...props}
    />
  );
}
