"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  Braces,
  Building2,
  CalendarDays,
  Compass,
  Layers,
  ListChecks,
  Mic,
  Presentation,
  TrendingUp,
} from "lucide-react";
import { CandidateUser, InterviewSession } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";

interface DashboardViewProps {
  user: CandidateUser;
  dashboardData: any;
}

const PRACTICE_MODES = [
  {
    icon: Braces,
    label: "Core technical",
    description:
      "Language internals, memory models, databases, and operating system basics.",
    href: "/interview?phase=phase_1",
  },
  {
    icon: Compass,
    label: "Coding & problem solving",
    description:
      "Algorithmic patterns, live debugging, and trade-off analysis under time pressure.",
    href: "/interview?phase=phase_2",
  },
  {
    icon: Layers,
    label: "Project defence",
    description:
      "Architecture choices, bottlenecks, and the bugs you actually fixed in your projects.",
    href: "/interview?phase=phase_3",
  },
  {
    icon: Presentation,
    label: "Full mock panel",
    description:
      "A realistic round combining coding, system concepts, and behavioural questions.",
    href: "/interview?phase=phase_4",
  },
];

const QUICK_DRILLS = [
  { label: "DSA drill", href: "/interview?drill=dsa" },
  { label: "AI/ML track", href: "/interview?style=aiml" },
  { label: "System design", href: "/interview?drill=system_design" },
  { label: "Behavioural", href: "/interview?drill=hr" },
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  dashboardData,
}) => {
  const readiness = dashboardData?.overall_readiness;
  const readinessScore =
    typeof readiness?.score === "number" ? readiness.score : null;
  const readinessLabel: string | null = readiness?.label ?? null;
  const sessionsEvaluated: number = readiness?.sessions_evaluated ?? 0;
  const activeTrackerCount: number = dashboardData?.active_tracker_count ?? 0;
  const recentSessions: InterviewSession[] = dashboardData?.recent_sessions ?? [];

  const targetRole =
    dashboardData?.target_role || user?.target_role || "Software Engineer";
  const targetCompany =
    dashboardData?.target_company || user?.target_company || "Tech placement";

  return (
    <div className="space-y-6 sm:space-y-8">
      <Card>
        <div className="p-5 sm:p-7">
          <PageHeader
            eyebrow={`${targetRole} · ${targetCompany}`}
            title="Practice out loud. Read the evidence."
            description="Answer real technical questions in a turn-by-turn round, then review honest feedback on your explanations before placement season starts."
            actions={
              <Link href="/interview" className={buttonClasses({ size: "lg" })}>
                <Mic aria-hidden="true" className="h-4 w-4" />
                Start practice round
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            }
          />

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <span className="text-xs text-ink-tertiary">Quick drills</span>
            {QUICK_DRILLS.map((drill) => (
              <Link
                key={drill.label}
                href={drill.href}
                className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
              >
                {drill.label}
              </Link>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="flex flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line p-5 sm:p-6">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-ink">
                Placement readiness
              </h2>
              <p className="mt-1 text-sm text-ink-secondary">
                Averaged from your completed, scored rounds.
              </p>
            </div>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-secondary">
              <TrendingUp aria-hidden="true" className="h-4 w-4" />
            </span>
          </div>

          <div className="flex-1 space-y-5 p-5 sm:p-6">
            {readinessScore === null ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-ink">
                  No scored rounds yet
                </p>
                <p className="text-sm leading-relaxed text-ink-secondary">
                  Readiness appears after your first completed round is
                  evaluated. Until then there is nothing to average.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
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
                  <p className="text-sm leading-relaxed text-ink-secondary">
                    {readinessLabel}
                  </p>
                ) : null}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 border-t border-line pt-4">
              <Link
                href="/history"
                className="group rounded-lg border border-line p-3 transition-colors hover:border-line-strong hover:bg-surface-sunken"
              >
                <span className="flex items-center gap-1.5 text-xs text-ink-tertiary">
                  <ListChecks aria-hidden="true" className="h-3.5 w-3.5" />
                  Evaluated
                </span>
                <span className="tabular mt-1 block text-lg font-semibold text-ink">
                  {sessionsEvaluated}
                </span>
              </Link>
              <Link
                href="/tracker"
                className="group rounded-lg border border-line p-3 transition-colors hover:border-line-strong hover:bg-surface-sunken"
              >
                <span className="flex items-center gap-1.5 text-xs text-ink-tertiary">
                  <Building2 aria-hidden="true" className="h-3.5 w-3.5" />
                  Applications
                </span>
                <span className="tabular mt-1 block text-lg font-semibold text-ink">
                  {activeTrackerCount}
                </span>
              </Link>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5 sm:p-6">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-ink">
                Practice modes
              </h2>
              <p className="mt-1 text-sm text-ink-secondary">
                Pick the round you want to rehearse. Each opens the setup screen
                with the matching style preselected.
              </p>
            </div>
            <Link
              href="/company-prep"
              className="inline-flex items-center gap-1 text-sm font-medium text-accent-strong hover:underline"
            >
              Company packs
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 sm:p-6">
            {PRACTICE_MODES.map((mode) => {
              const Icon = mode.icon;
              return (
                <Link
                  key={mode.label}
                  href={mode.href}
                  className="group flex flex-col justify-between gap-4 rounded-lg border border-line bg-canvas p-4 transition-colors hover:border-line-strong hover:bg-surface-sunken"
                >
                  <div className="space-y-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface-sunken text-ink-secondary group-hover:bg-surface">
                      <Icon aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-semibold text-ink">
                      {mode.label}
                    </p>
                    <p className="text-sm leading-relaxed text-ink-secondary">
                      {mode.description}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary group-hover:text-ink">
                    Open setup
                    <ArrowRight aria-hidden="true" className="h-3 w-3" />
                  </span>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      <Card>
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

        {recentSessions.length === 0 ? (
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
            {recentSessions.map((session) => {
              const isInProgress = session.status === "in_progress";
              return (
                <li
                  key={session.id}
                  className="flex flex-col gap-3 border-t border-line px-5 py-4 first:border-t-0 hover:bg-surface-sunken sm:flex-row sm:items-center sm:justify-between sm:px-6"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-sunken text-xs font-semibold text-ink-secondary">
                      Q{session.current_turn_index || 0}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-ink">
                          {session.target_role}
                        </span>
                        <span className="text-xs capitalize text-ink-tertiary">
                          {session.interviewer_style?.replace("_", " ") ||
                            "General"}
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
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-warning-subtle px-2.5 py-1 text-xs font-semibold text-warning-ink">
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
    </div>
  );
};
