import type { InterviewSession } from "@/lib/api";

export type TopicStyle = InterviewSession["interviewer_style"];

/** Real `interviewer_style` values, in the order the setup screen lists them. */
export const TOPIC_ORDER: TopicStyle[] = [
  "technical",
  "dsa",
  "system_design",
  "project_defence",
  "aiml",
  "hr",
  "mixed",
  "resume",
];

export const TOPIC_LABELS: Record<TopicStyle, string> = {
  technical: "Core technical",
  dsa: "Data structures",
  system_design: "System design",
  project_defence: "Project defence",
  aiml: "AI / ML",
  hr: "Behavioural",
  mixed: "Mixed panel",
  resume: "Resume walkthrough",
};

export interface TopicStat {
  topic: string;
  style: TopicStyle;
  /** Rounds logged for this topic (in-progress counts; cancelled does not). */
  attempts: number;
  /** Rounds that actually carry an `overall_score`. */
  scored: number;
  /** Mean score normalised to 0..1 (the API scores rounds out of 5). */
  avg: number;
}

export type NextUp =
  | { kind: "resume"; id: string; reason: string }
  | { kind: "drill"; topic: string; style: TopicStyle; reason: string }
  | { kind: "explore"; topic: string; style: TopicStyle; reason: string }
  | { kind: "warmup"; reason: string };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function hasScore(session: InterviewSession): session is InterviewSession & {
  overall_score: number;
} {
  return (
    typeof session.overall_score === "number" &&
    Number.isFinite(session.overall_score)
  );
}

export function buildTopicStats(sessions: InterviewSession[]): TopicStat[] {
  const buckets = new Map<
    TopicStyle,
    { attempts: number; scored: number; total: number }
  >();

  for (const style of TOPIC_ORDER) {
    buckets.set(style, { attempts: 0, scored: 0, total: 0 });
  }

  for (const session of sessions) {
    if (session.status === "cancelled") continue;
    const bucket = buckets.get(session.interviewer_style);
    if (!bucket) continue;
    bucket.attempts += 1;
    if (hasScore(session)) {
      bucket.scored += 1;
      bucket.total += session.overall_score;
    }
  }

  return TOPIC_ORDER.map((style) => {
    const bucket = buckets.get(style)!;
    return {
      topic: TOPIC_LABELS[style],
      style,
      attempts: bucket.attempts,
      scored: bucket.scored,
      avg: bucket.scored > 0 ? clamp01(bucket.total / bucket.scored / 5) : 0,
    };
  });
}

/**
 * Level is derived from real scored rounds only.
 * weak < 50%, mid < 75%, strong otherwise; unscored means "no evidence yet".
 */
export function topicLevel(
  stat: TopicStat,
): "untested" | "unscored" | "weak" | "mid" | "strong" {
  if (stat.attempts === 0) return "untested";
  if (stat.scored === 0) return "unscored";
  if (stat.avg < 0.5) return "weak";
  if (stat.avg < 0.75) return "mid";
  return "strong";
}

export function pickNextUp(a: {
  activeSessionId?: string | null;
  stats: TopicStat[];
  roleTopics: TopicStyle[];
}): NextUp {
  if (a.activeSessionId) {
    return {
      kind: "resume",
      id: a.activeSessionId,
      reason: "You left a round unfinished.",
    };
  }

  const weak = a.stats
    .filter((s) => s.scored >= 2)
    .sort((x, y) => x.avg - y.avg)[0];
  if (weak && weak.avg < 0.6) {
    return {
      kind: "drill",
      topic: weak.topic,
      style: weak.style,
      reason: `${weak.scored} scored rounds, average ${Math.round(weak.avg * 100)}%`,
    };
  }

  const byStyle = new Map(a.stats.map((s) => [s.style, s]));
  const fresh = a.roleTopics.find((style) => {
    const stat = byStyle.get(style);
    return !stat || stat.attempts === 0;
  });
  if (fresh) {
    return {
      kind: "explore",
      topic: TOPIC_LABELS[fresh],
      style: fresh,
      reason: "You haven't practiced this yet.",
    };
  }

  return {
    kind: "warmup",
    reason: "Every topic has a round on record. Keep it sharp with a short one.",
  };
}

export interface ActivityDay {
  /** Local calendar day, `YYYY-MM-DD`, stable as a React key. */
  key: string;
  /** Short human label for the tooltip. */
  label: string;
  count: number;
}

/** Sessions per local calendar day for the last `days` days, oldest first. */
export function buildActivity(
  sessions: InterviewSession[],
  days = 14,
): ActivityDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result: ActivityDay[] = [];
  const index = new Map<string, number>();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    index.set(key, result.length);
    result.push({
      key,
      label: date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      count: 0,
    });
  }

  for (const session of sessions) {
    const date = new Date(session.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const at = index.get(key);
    if (at === undefined) continue;
    result[at].count += 1;
  }

  return result;
}

/** Real scores out of 5, oldest first, capped so the sparkline stays legible. */
export function scoreSeries(
  sessions: InterviewSession[],
  limit = 12,
): number[] {
  return sessions
    .filter(hasScore)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    .map((s) => s.overall_score)
    .slice(-limit);
}

export function completedRounds(sessions: InterviewSession[]): number {
  return sessions.filter(
    (s) => s.status === "completed" || s.status === "partial_completed",
  ).length;
}
