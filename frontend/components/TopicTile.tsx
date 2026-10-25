import Link from "next/link";
import { Check, Circle, Minus, TrendingDown } from "lucide-react";
import type { Route } from "next";
import { cn } from "@/lib/utils";
import type { TopicStat } from "@/lib/next-up";
import { topicLevel } from "@/lib/next-up";

export const LEVELS = {
  untested: {
    cls: "bg-surface-sunken text-ink-tertiary",
    Icon: Circle,
    label: "Not started",
  },
  unscored: {
    cls: "bg-surface-sunken text-ink-secondary",
    Icon: Circle,
    label: "No score yet",
  },
  weak: {
    cls: "bg-danger-subtle text-danger-ink",
    Icon: TrendingDown,
    label: "Needs work",
  },
  mid: {
    cls: "bg-warning-subtle text-warning-ink",
    Icon: Minus,
    label: "Developing",
  },
  strong: {
    cls: "bg-success-subtle text-success-ink",
    Icon: Check,
    label: "Strong",
  },
} as const;

export type TopicLevel = keyof typeof LEVELS;

export function TopicTile({
  stat,
  href,
}: {
  stat: TopicStat;
  href: Route;
}) {
  const level = topicLevel(stat);
  const { cls, Icon, label } = LEVELS[level];
  const rounds = `${stat.attempts} ${stat.attempts === 1 ? "round" : "rounds"}`;

  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-14 flex-col justify-center gap-0.5 rounded-card px-3 py-2",
        "transition-colors duration-150 hover:brightness-95",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        cls,
      )}
    >
      <span className="flex items-center gap-1.5">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium sm:text-sm">
          {stat.topic}
        </span>
      </span>
      <span className="text-[11px] leading-4 text-ink-secondary">
        {label} · {rounds}
      </span>
    </Link>
  );
}
