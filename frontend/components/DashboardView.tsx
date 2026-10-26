"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  Building2,
  CalendarDays,
  Check,
  ClipboardCheck,
  Mic,
  Target,
  TrendingUp,
  UserRound,
} from "lucide-react";
import {
  CandidateUser,
  DashboardData,
  InterviewSession,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Sparkline } from "@/components/Sparkline";
import { TopicTile } from "@/components/TopicTile";
import {
  buildActivity,
  buildTopicStats,
  pickNextUp,
  scoreSeries,
  TOPIC_LABELS,
  TOPIC_ORDER,
  type TopicStyle,
} from "@/lib/next-up";

interface DashboardViewProps {
  user: CandidateUser;
  dashboardData: DashboardData | null;
  sessions: InterviewSession[];
}

const byNewest = (a: InterviewSession, b: InterviewSession) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  dashboardData,
  sessions,
}) => {
  const readiness = dashboardData?.overall_readiness;
  const readinessScore =
    typeof readiness?.score === "number" ? readiness.score : null;
  const readinessLabel: string | null = readiness?.label ?? null;
  const sessionsEvaluated: number = readiness?.sessions_evaluated ?? 0;
  const activeTrackerCount: number = dashboardData?.active_tracker_count ?? 0;

  const targetRole =
    dashboardData?.target_role || user.target_role || "Software Engineer";
  const targetCompany =
    dashboardData?.target_company || user.target_company || "Tech placement";
  const seniority = dashboardData?.seniority || "Fresher";

  const stats = buildTopicStats(sessions);
  const activeSession =
    [...sessions].filter((s) => s.status === "in_progress").sort(byNewest)[0] ??
    null;

  const configuredStyle = dashboardData?.next_recommended_action?.style;
  const roleTopics: TopicStyle[] = TOPIC_ORDER.includes(
    configuredStyle as TopicStyle,
  )
    ? [
        configuredStyle as TopicStyle,
        ...TOPIC_ORDER.filter((style) => style !== configuredStyle),
      ]
    : TOPIC_ORDER;

  const nextUp = pickNextUp({
    activeSessionId: activeSession?.id ?? null,
    stats,
    roleTopics,
  });

  const recent = [...sessions].sort(byNewest).slice(0, 5);
  const activity = buildActivity(sessions);
  const activityTotal = activity.reduce((sum, day) => sum + day.count, 0);
  const scores = scoreSeries(sessions);

  const isNewUser =
    sessions.length === 0 && activeTrackerCount === 0 && readinessScore === null;

  let heroTitle: React.ReactNode;
  let heroCta: string;
  let heroHref: string;

  if (sessions.length === 0) {
    heroTitle = (
      <>
        Start your first <em className="italic text-accent-strong">round</em>.
      </>
    );
    heroCta = "Set up your first round";
    heroHref = "/interview";
  } else {
    switch (nextUp.kind) {
      case "resume":
        heroTitle = (
          <>
            Pick up where you{" "}
            <em className="italic text-accent-strong">left off</em>.
          </>
        );
        heroCta = "Resume round";
        heroHref = `/interview?resume=${nextUp.id}`;
        break;
      case "drill":
        heroTitle = (
          <>
            Next up:{" "}
            <em className="italic text-accent-strong">{nextUp.topic}</em>.
          </>
        );
        heroCta = `Drill ${nextUp.topic}`;
        heroHref = `/interview?style=${nextUp.style}`;
        break;
      case "explore":
        heroTitle = (
          <>
            Next up:{" "}
            <em className="italic text-accent-strong">{nextUp.topic}</em>.
          </>
        );
        heroCta = `Try ${nextUp.topic}`;
        heroHref = `/interview?style=${nextUp.style}`;
        break;
      default:
        heroTitle = (
          <>
            Next up:{" "}
            <em className="italic text-accent-strong">a short warm-up</em>.
          </>
        );
        heroCta = "Start a warm-up";
        heroHref = "/interview";
    }
  }

  const firstName = user.display_name?.trim().split(/\s+/)[0];

  const hero = (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-sunken/60 px-5 py-3 sm:px-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-tertiary">
          {firstName ? `Welcome back, ${firstName}` : "Your next step"}
        </p>
        <p className="text-xs text-ink-tertiary">
          {seniority} · {targetRole} · {targetCompany}
        </p>
      </div>
      <div className="flex flex-col gap-4 p-5 sm:p-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="font-question text-title font-medium text-ink">
            {heroTitle}
          </h1>
          <p className="measure-tight text-sm leading-relaxed text-ink-secondary">
            {nextUp.reason}
          </p>
          {nextUp.kind === "resume" && activeSession ? (
            <p className="text-xs text-ink-tertiary">
              {activeSession.target_role} ·{" "}
              {TOPIC_LABELS[activeSession.interviewer_style] ??
                "General round"}{" "}
              · question {(activeSession.current_turn_index || 0) + 1}
            </p>
          ) : null}
        </div>
        <Link
          href={heroHref}
          className={buttonClasses({
            size: "lg",
            className: "w-full justify-center md:w-auto",
          })}
        >
          <Mic aria-hidden="true" className="h-4 w-4" />
          {heroCta}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );

  const firstSteps = [
    {
      label: "Set up your profile",
      description: "Target role, company and seniority sharpen the questions.",
      href: "/settings",
      Icon: UserRound,
      done: user.onboarding_state === "COMPLETED",
    },
    {
      label: "Run one round",
      description: "Three questions, spoken out loud, about eight minutes.",
      href: "/interview",
      Icon: Mic,
      done: sessions.length > 0,
    },
    {
      label: "Read the debrief",
      description: "Pick one fix and take it into the next round.",
      href: "/history",
      Icon: ClipboardCheck,
      done: sessionsEvaluated > 0,
    },
  ];

  const firstStepsCard = (
    <Card className="min-w-0">
      <div className="border-b border-line p-5 sm:px-6">
        <h2 className="text-base font-semibold tracking-tight text-ink">
          First three steps
        </h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Everything else unlocks once you have a round on record.
        </p>
      </div>
      <ol className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {firstSteps.map((step, index) => {
          const Icon = step.Icon;
          return (
            <li key={step.label}>
              <Link
                href={step.href}
                className="flex h-full items-start gap-3 p-5 transition-colors duration-150 hover:bg-surface-sunken"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    step.done
                      ? "bg-success-subtle text-success-ink"
                      : "bg-surface-sunken text-ink-secondary",
                  )}
                >
                  {step.done ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="tabular">{index + 1}</span>
                  )}
                </span>
                <span className="min-w-0 space-y-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    {step.label}
                    <Icon
                      aria-hidden="true"
                      className="h-3.5 w-3.5 text-ink-tertiary"
                    />
                  </span>
                  <span className="block text-xs leading-relaxed text-ink-secondary">
                    {step.description}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );

  const topicMap = (
    <Card className="min-w-0">
      <div className="border-b border-line p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
          <Target aria-hidden="true" className="h-4 w-4 text-ink-tertiary" />
          Topic map
        </h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Levels come from scored rounds only. Pick any topic to open its setup.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 p-5 sm:grid-cols-3 sm:gap-3 sm:p-6 xl:grid-cols-4">
        {stats.map((stat) => (
          <TopicTile
            key={stat.style}
            stat={stat}
            href={`/interview?style=${stat.style}`}
          />
        ))}
      </div>
    </Card>
  );

  const cellTone = (count: number) =>
    count === 0
      ? "border border-line bg-surface-sunken"
      : count === 1
        ? "bg-accent-subtle"
        : count === 2
          ? "bg-accent/50"
          : "bg-accent-strong";

  const statLink = (href: string) =>
    "rounded-lg border border-line p-3 transition-colors duration-150 hover:border-line-strong hover:bg-surface-sunken";

  const progressCard = (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5 sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
            <TrendingUp aria-hidden="true" className="h-4 w-4 text-ink-tertiary" />
            Progress
          </h2>
          <p className="mt-1 text-sm text-ink-secondary">
            Averaged from your completed, scored rounds.
          </p>
        </div>
        <Link
          href="/history"
          className="inline-flex items-center gap-1 text-sm font-medium text-accent-strong hover:underline"
        >
          All debriefs
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:gap-8">
        <div className="space-y-2 md:border-r md:border-line md:pr-8">
          {readinessScore === null ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-ink">No scored rounds yet</p>
              <p className="text-sm leading-relaxed text-ink-secondary">
                Readiness appears after your first completed round is evaluated.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="tabular text-4xl font-semibold tracking-tight text-ink">
                  {readinessScore.toFixed(1)}
                </span>
                <span className="text-sm text-ink-tertiary">/ 5.0</span>
              </div>
              <Progress
                value={readinessScore}
                max={5}
                label="Average score"
                hideLabel
              />
              {readinessLabel ? (
                <p className="text-xs leading-relaxed text-ink-secondary">
                  {readinessLabel}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Link href="/history" className={statLink("/history")}>
              <span className="flex items-center gap-1.5 text-xs text-ink-tertiary">
                <ClipboardCheck aria-hidden="true" className="h-3.5 w-3.5" />
                Evaluated
              </span>
              <span className="tabular mt-1 block text-lg font-semibold text-ink">
                {sessionsEvaluated}
              </span>
            </Link>
            <Link href="/history" className={statLink("/history")}>
              <span className="flex items-center gap-1.5 text-xs text-ink-tertiary">
                <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
                Rounds
              </span>
              <span className="tabular mt-1 block text-lg font-semibold text-ink">
                {sessions.length}
              </span>
            </Link>
            <Link href="/tracker" className={statLink("/tracker")}>
              <span className="flex items-center gap-1.5 text-xs text-ink-tertiary">
                <Building2 aria-hidden="true" className="h-3.5 w-3.5" />
                Applied
              </span>
              <span className="tabular mt-1 block text-lg font-semibold text-ink">
                {activeTrackerCount}
              </span>
            </Link>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-ink-secondary">
                Sessions, last 14 days
              </p>
              <span className="tabular text-xs text-ink-tertiary">
                {activityTotal}
              </span>
            </div>
            <ol
              className="mt-2 flex items-end gap-1"
              aria-label={`Sessions per day, last 14 days. ${activityTotal} total.`}
            >
              {activity.map((day) => (
                <li key={day.key} className="min-w-0 flex-1">
                  <span
                    aria-hidden="true"
                    className={cn("block h-7 rounded-[3px]", cellTone(day.count))}
                  />
                  <span className="sr-only">
                    {`${day.label}: ${day.count} ${day.count === 1 ? "session" : "sessions"}`}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {scores.length >= 3 ? (
            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <div>
                <p className="text-xs font-medium text-ink-secondary">
                  Score trend
                </p>
                <p className="text-[11px] text-ink-tertiary">
                  {scores.length} scored rounds
                </p>
              </div>
              <Sparkline values={scores} />
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );

  const recentCard = (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5 sm:p-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink">
            Recent rounds
          </h2>
          <p className="mt-1 text-sm text-ink-secondary">
            Saved sessions from your practice history.
          </p>
        </div>
        <Link
          href="/history"
          className="inline-flex items-center gap-1 text-sm font-medium text-accent-strong hover:underline"
        >
          View all
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="p-5 sm:p-6">
          <EmptyState
            icon={Mic}
            title="No practice rounds yet"
            description="Run a five-minute drill and speak your answers out loud. Your scores and debriefs will appear here."
            action={
              <Link
                href="/interview"
                className={buttonClasses({ variant: "secondary" })}
              >
                <Mic aria-hidden="true" className="h-4 w-4" />
                Start your first round
              </Link>
            }
          />
        </div>
      ) : (
        <ul>
          {recent.map((session) => {
            const isInProgress = session.status === "in_progress";
            return (
              <li
                key={session.id}
                className="flex flex-col gap-3 border-t border-line px-5 py-4 first:border-t-0 hover:bg-surface-sunken sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold",
                      isInProgress
                        ? "tabular border-line bg-surface-sunken text-ink-secondary"
                        : "border-line bg-surface-sunken text-ink-tertiary",
                    )}
                  >
                    {isInProgress ? (
                      `Q${(session.current_turn_index || 0) + 1}`
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-ink">
                        {session.target_role}
                      </span>
                      <span className="text-xs text-ink-tertiary">
                        {TOPIC_LABELS[session.interviewer_style] ?? "General"}
                      </span>
                      {isInProgress ? (
                        <Badge variant="warning">In progress</Badge>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-tertiary">
                      <CalendarDays
                        aria-hidden="true"
                        className="h-3.5 w-3.5"
                      />
                      <span className="capitalize">{session.mode}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {new Date(session.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {session.overall_score != null ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-ink-secondary">
                      <Award aria-hidden="true" className="h-3.5 w-3.5" />
                      <span className="tabular">
                        {Number(session.overall_score).toFixed(1)} / 5.0
                      </span>
                    </span>
                  ) : null}

                  {isInProgress ? (
                    <Link
                      href={`/interview?resume=${session.id}`}
                      className={buttonClasses({ size: "sm" })}
                    >
                      Resume round
                      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <Link
                      href={`/interview/${session.id}/debrief`}
                      className={buttonClasses({
                        variant: "secondary",
                        size: "sm",
                      })}
                    >
                      Review feedback
                      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );

  if (isNewUser) {
    return (
      <div className="space-y-5">
        {hero}
        {firstStepsCard}
        {topicMap}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {hero}
      {progressCard}
      {topicMap}
      {recentCard}
    </div>
  );
};
