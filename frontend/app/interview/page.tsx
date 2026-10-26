"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { InterviewStudio } from "@/components/InterviewStudio";
import {
  api,
  ApiError,
  CandidateUser,
  InterviewSession,
  InterviewTurn,
  QuestionTopic,
} from "@/lib/api";
import { speechSynth } from "@/lib/speech";
import { cn, getErrorMessage } from "@/lib/utils";
import {
  Mic,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  History,
  Lock,
} from "lucide-react";
import { Suspense } from "react";

const LENGTHS = [
  {
    id: "quick",
    label: "Warm-up",
    questions: "3 questions",
    meta: "3 Q · ~8 min",
  },
  {
    id: "standard",
    label: "Standard",
    questions: "5 questions",
    meta: "5 Q · ~18 min",
  },
  {
    id: "full",
    label: "Deep dive",
    questions: "8 questions",
    meta: "8 Q · ~35 min",
  },
];

// Focused drills run their own fixed two-question round, so the length control
// has nothing to set. This keeps the summary honest instead of inventing a
// preset the backend will ignore.
const DRILL_LENGTH = {
  id: "drill",
  label: "Focused drill",
  questions: "2 questions",
  meta: "2 Q · ~6 min",
};

const FEEDBACK = [
  {
    id: "practice",
    label: "Coach me",
    detail: "Feedback after every answer",
  },
  {
    id: "realistic",
    label: "Simulate real",
    detail: "Full debrief at the end",
  },
] as const;

const STYLES = [
  {
    id: "aiml",
    short: "AI/ML",
    title: "AI/ML & Agentic Systems",
    desc: "RAG pipelines, LangGraph, agent planning, PyTorch, and LLM evals.",
    requiresProfile: false,
  },
  {
    id: "dsa",
    short: "DSA",
    title: "DSA & Coding Drill",
    desc: "Arrays, trees, graphs, DP, and algorithmic complexity.",
    requiresProfile: false,
  },
  {
    id: "system_design",
    short: "System design",
    title: "System Architecture",
    desc: "Distributed caching, databases, and scalability trade-offs.",
    requiresProfile: false,
  },
  {
    id: "technical",
    short: "CS core",
    title: "Core CS Fundamentals",
    desc: "Operating systems, DBMS, SQL, OOP, and networks.",
    requiresProfile: false,
  },
  {
    id: "project_defence",
    short: "Projects",
    title: "Project Defence",
    desc: "Architectural choices, failure handling, and trade-offs.",
    requiresProfile: false,
  },
  {
    id: "hr",
    short: "Behavioral",
    title: "Behavioral & Leadership",
    desc: "STAR stories, teamwork, conflicts, and ownership.",
    requiresProfile: false,
  },
  {
    id: "resume",
    short: "Resume",
    title: "Resume Deep-Dive",
    desc: "Questions built only from your confirmed resume projects and decisions.",
    requiresProfile: true,
  },
  {
    id: "mixed",
    short: "Full mock",
    title: "Full Mock Panel",
    desc: "Comprehensive mix across coding, architecture, and behavioral.",
    requiresProfile: false,
  },
];

function StepHeading({
  step,
  title,
  hint,
  id,
}: {
  step: number;
  title: string;
  hint: string;
  id: string;
}) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span
        aria-hidden="true"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-surface-sunken text-[10px] font-bold text-ink-secondary"
      >
        {step}
      </span>
      <div className="min-w-0">
        <h2 id={id} className="text-sm font-semibold tracking-tight text-ink">
          {title}
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">
          {hint}
        </p>
      </div>
    </div>
  );
}

function InterviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultStyle = searchParams.get("style") || "mixed";
  const phaseParam = searchParams.get("phase") || "";
  const drillParam = searchParams.get("drill") || "";

  const [user, setUser] = useState<CandidateUser | null>(null);
  const [activeSession, setActiveSession] = useState<InterviewSession | null>(null);
  const [currentTurn, setCurrentTurn] = useState<InterviewTurn | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [starting, setStarting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Setup form with phase / drill awareness
  const initialMode = phaseParam === "phase_4" ? "realistic" : "practice";
  const initialDuration = drillParam
    ? "drill"
    : phaseParam === "phase_1"
    ? "quick"
    : "standard";

  let initialStyle = defaultStyle;
  if (drillParam === "aiml" || defaultStyle === "aiml") initialStyle = "aiml";
  else if (drillParam === "dsa") initialStyle = "dsa";
  else if (drillParam === "system_design") initialStyle = "system_design";
  else if (drillParam === "project_defence") initialStyle = "project_defence";
  else if (drillParam === "hr") initialStyle = "hr";
  else if (phaseParam === "phase_1") initialStyle = "technical";
  else if (phaseParam === "phase_2") initialStyle = "dsa";
  else if (phaseParam === "phase_3") initialStyle = "project_defence";
  else if (phaseParam === "phase_4") initialStyle = "mixed";

  const [mode, setMode] = useState<"practice" | "realistic">(initialMode);
  const [interviewerStyle, setInterviewerStyle] = useState<string>(initialStyle);
  const [durationMode, setDurationMode] = useState<string>(initialDuration);
  const [hasConsented, setHasConsented] = useState<boolean>(false);
  const [consentModalOpen, setConsentModalOpen] = useState<boolean>(false);
  // Resume Deep-Dive is only usable when a confirmed profile with at least one
  // project exists; the backend rejects the style otherwise instead of
  // inventing projects.
  const [hasConfirmedProfile, setHasConfirmedProfile] = useState<boolean>(false);
  // A round left open on the server. Surfaced so the user resumes instead of
  // silently forking a second session. Only the id is required to resume, so
  // the 409 path can recover without a second round-trip.
  const [resumable, setResumable] = useState<{ id: string; label: string | null } | null>(null);
  // Bank size is a real count from the loaded question bank. If the lookup
  // fails, the line simply disappears rather than showing a guess.
  const [topics, setTopics] = useState<QuestionTopic[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadTopics() {
      try {
        const res = await api.getQuestionTopics();
        if (cancelled) return;
        setTopics(res.topics || []);
      } catch {
        if (cancelled) return;
        setTopics([]);
      }
    }
    loadTopics();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const u = await api.getMe();
        setUser(u);
        const consentRes = await api.checkConsent();
        setHasConsented(consentRes.has_consented);

        let profileConfirmed = false;
        try {
          const resumeRes = await api.getResume();
          const confirmed = resumeRes?.confirmed_profile;
          profileConfirmed = Boolean(
            confirmed &&
              Array.isArray(confirmed.notable_projects) &&
              confirmed.notable_projects.length > 0
          );
        } catch {
          // No resume on file is a normal state, not an error worth blocking on.
          profileConfirmed = false;
        }
        setHasConfirmedProfile(profileConfirmed);
        if (!profileConfirmed) {
          // Never leave the form on a style that would be rejected by the API.
          setInterviewerStyle((prev) => (prev === "resume" ? "mixed" : prev));
        }

        const resumeId = searchParams.get("resume");
        if (resumeId) {
          try {
            const sessRes = await api.getInterviewSession(resumeId);
            const sess = sessRes?.session;
            if (sess) {
              // Finished rounds belong in the debrief, not the studio.
              if (sess.status === "completed" || sess.status === "partial_completed") {
                router.replace(`/interview/${resumeId}/debrief`);
                return;
              }
              if (sess.status === "abandoned" || sess.status === "cancelled") {
                // Closed rounds have no debrief to open, so point at a new one.
                setResumable(null);
                setError(
                  "That round was closed before it produced a debrief. Start a new round when you are ready."
                );
                return;
              }
              const turns = sessRes.turns || [];
              const pendingTurn = [...turns]
                .reverse()
                .find((t) => t.evaluation_status !== "completed");
              if (pendingTurn) {
                setActiveSession(sess);
                setCurrentTurn(pendingTurn);
              } else {
                // Every turn is scored but the round was never closed.
                setError(
                  "This round has no open question left. Open the debrief to review it, or start a new round."
                );
              }
            }
          } catch (e: unknown) {
            setError(getErrorMessage(e, "Could not resume that interview session."));
          }
        } else {
          // No explicit resume link: ask the server whether a round is open.
          try {
            const activeRes = await api.getActiveInterviewSession();
            if (activeRes?.session) {
              const active = activeRes.session;
              setResumable({
                id: active.id,
                label: active.target_role || null,
              });
            }
          } catch {
            // Failing this lookup must not block starting a fresh round; the
            // create call still returns 409 with the active id if needed.
          }
        }
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Failed to load user session."));
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [searchParams, router]);

  const selectedStyle =
    STYLES.find((s) => s.id === interviewerStyle) ?? STYLES[STYLES.length - 1];
  const selectedLength =
    LENGTHS.find((d) => d.id === durationMode) ??
    (durationMode === "drill" ? DRILL_LENGTH : LENGTHS[1]);
  const modeLabel =
    mode === "practice" ? "Coach me" : "Simulate real";
  const resumeBlocked = interviewerStyle === "resume" && !hasConfirmedProfile;
  const fixedLength = Boolean(phaseParam || drillParam);

  const totalQuestions = topics.reduce((sum, t) => sum + t.total, 0);

  const handleStartSession = async (replace = false) => {
    // Prime browser audio context right upon click gesture
    speechSynth.unlockAudio();

    if (resumeBlocked) {
      setError(
        "Resume Deep-Dive needs a confirmed profile with at least one project. Confirm it on the Resume page, or pick another focus track."
      );
      return;
    }

    if (!hasConsented) {
      setConsentModalOpen(true);
      return;
    }

    setStarting(true);
    setError(null);
    try {
      const res = await api.startInterviewSession({
        mode,
        interviewer_style: interviewerStyle,
        duration_mode: durationMode,
        phase: phaseParam || undefined,
        drill_skill: drillParam || undefined,
        replace,
      });
      setResumable(null);
      setActiveSession(res.session);
      setCurrentTurn(res.current_turn);
    } catch (err: unknown) {
      // The server refuses a second active round. Turn that into a resume
      // affordance rather than a dead-end error.
      const detail = err instanceof ApiError ? err.detail : null;
      const activeId =
        detail && typeof detail === "object" && typeof detail.active_id === "string"
          ? detail.active_id
          : null;
      if (err instanceof ApiError && err.status === 409 && activeId) {
        setResumable({ id: activeId, label: null });
        setError(null);
        return;
      }
      setError(getErrorMessage(err, "Failed to initialize interview studio session."));
    } finally {
      setStarting(false);
    }
  };

  const handleGrantConsent = async () => {
    try {
      await api.recordConsent();
      setHasConsented(true);
      setConsentModalOpen(false);
      await handleStartSession();
    } catch {
      setError("Failed to record consent.");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Spinner size="md" />
        <span className="text-xs font-semibold tracking-tight text-ink-secondary">
          Loading Interview Studio…
        </span>
      </div>
    );
  }

  // Active studio turn
  if (activeSession && currentTurn) {
    return (
      <InterviewStudio
        initialSession={activeSession}
        initialTurn={currentTurn}
        onRoundClosed={() => {
          setActiveSession(null);
          setCurrentTurn(null);
          setResumable(null);
        }}
      />
    );
  }

  return (
    <AppShell user={user} width="default">
      <div className="space-y-5">
        <PageHeader
          eyebrow={
            drillParam
              ? "Focused skill drill"
              : phaseParam
              ? phaseParam.replace("_", " ")
              : "Practice round"
          }
          title={
            drillParam
              ? `Focused Drill: ${drillParam.replace("_", " ").toUpperCase()}`
              : phaseParam === "phase_1"
              ? "Phase 1: Core Technical Foundations"
              : phaseParam === "phase_2"
              ? "Phase 2: Applied Problem-Solving & Coding"
              : phaseParam === "phase_3"
              ? "Phase 3: Project Architecture & Defence"
              : phaseParam === "phase_4"
              ? "Phase 4: Realistic Full Mock Panel"
              : "Start a Practice Round"
          }
          description={
            drillParam
              ? "A short, focused 2-question session targeting this specific skill area with instant calibrated feedback."
              : phaseParam === "phase_1"
              ? "Assess essential programming knowledge, language internals, and baseline role-specific concepts."
              : phaseParam === "phase_2"
              ? "Test coding, algorithms, practical debugging, and reasoning under real constraints."
              : phaseParam === "phase_3"
              ? "Deep dive into your resume projects, design decisions, failure handling, and trade-offs."
              : phaseParam === "phase_4"
              ? "Full timed simulation combining technical, architectural, and behavioral questions with a comprehensive debrief."
              : "Pick a focus, a length, and how you want feedback. Then speak your answers out loud."
          }
          actions={
            drillParam ? (
              <Badge variant="warning">Focused drill</Badge>
            ) : phaseParam ? (
              <Badge variant="outline">
                {phaseParam.replace("_", " ").toUpperCase()}
              </Badge>
            ) : undefined
          }
        />

        {resumable && (
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <History
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-ink-secondary"
              />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-ink">Round in progress</p>
                <p className="text-xs text-ink-secondary">
                  {resumable.label
                    ? `You left a round unfinished for ${resumable.label}.`
                    : "You left a round unfinished."}{" "}
                  Pick it up, or close it and start fresh.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                onClick={() => router.replace(`/interview?resume=${resumable.id}`)}
              >
                Resume
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleStartSession(true)}
                loading={starting}
              >
                Start fresh
              </Button>
            </div>
          </Card>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-card border border-danger/30 bg-danger-subtle p-4 text-sm text-danger-ink"
          >
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span className="font-medium">{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 pb-24 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-6 lg:pb-0">
          <Card className="min-w-0 divide-y divide-line">
            {/* Step 1 — focus */}
            <section
              aria-labelledby="focus-heading"
              className="space-y-3.5 p-5 sm:p-6"
            >
              <StepHeading
                step={1}
                id="focus-heading"
                title="What should we drill?"
                hint="Pick one focus for this round."
              />

              <div
                role="group"
                aria-labelledby="focus-heading"
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {STYLES.map((style) => {
                  const isSelected = interviewerStyle === style.id;
                  const isLocked = style.requiresProfile && !hasConfirmedProfile;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => {
                        if (!isLocked) setInterviewerStyle(style.id);
                      }}
                      aria-pressed={isSelected}
                      aria-disabled={isLocked}
                      title={
                        isLocked
                          ? "Confirm your resume profile with at least one project first."
                          : style.desc
                      }
                      className={cn(
                        "flex min-h-[44px] cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors duration-[var(--dur-fast)]",
                        isLocked &&
                          "cursor-not-allowed border-dashed border-line bg-surface-sunken text-ink-tertiary",
                        !isLocked &&
                          isSelected &&
                          "border-accent-line bg-accent-subtle text-ink shadow-xs ring-1 ring-accent/30",
                        !isLocked &&
                          !isSelected &&
                          "border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink"
                      )}
                    >
                      <span className="truncate">{style.short}</span>
                      {isLocked ? (
                        <Lock
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0 text-ink-tertiary"
                        />
                      ) : isSelected ? (
                        <CheckCircle2
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-accent-strong"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-lg border border-line bg-surface-sunken px-3.5 py-3">
                <p className="text-xs leading-relaxed text-ink-secondary">
                  <span className="font-semibold text-ink">
                    {selectedStyle.title}.
                  </span>{" "}
                  {selectedStyle.desc}
                </p>
                {resumeBlocked && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-warning-ink">
                    This track needs a confirmed profile with at least one
                    project.{" "}
                    <Link
                      href="/resume"
                      className="font-semibold underline underline-offset-2"
                    >
                      Confirm your resume
                    </Link>{" "}
                    to unlock it.
                  </p>
                )}
              </div>
            </section>

            {/* Step 2 — length */}
            <section
              aria-labelledby="length-heading"
              className="space-y-3.5 p-5 sm:p-6"
            >
              <StepHeading
                step={2}
                id="length-heading"
                title="How long should it run?"
                hint="Sets the question count and target time."
              />

              {fixedLength ? (
                <p className="rounded-lg border border-line bg-surface-sunken px-3.5 py-3 text-xs leading-relaxed text-ink-secondary">
                  This {drillParam ? "focused drill" : "phase"} runs{" "}
                  <span className="font-semibold text-ink">
                    {selectedLength.questions}
                  </span>{" "}
                  in about {selectedLength.meta.split("~")[1]}. Length is fixed
                  here.
                </p>
              ) : (
                <div
                  role="group"
                  aria-labelledby="length-heading"
                  className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-sunken p-1"
                >
                  {LENGTHS.map((length) => {
                    const isSelected = durationMode === length.id;
                    return (
                      <button
                        key={length.id}
                        type="button"
                        onClick={() => setDurationMode(length.id)}
                        aria-pressed={isSelected}
                        className={cn(
                          "cursor-pointer rounded-lg px-2 py-2.5 text-center transition-colors duration-[var(--dur-fast)]",
                          isSelected
                            ? "bg-surface text-ink shadow-xs ring-1 ring-accent/30"
                            : "text-ink-secondary hover:text-ink"
                        )}
                      >
                        <span className="block text-xs font-semibold">
                          {length.label}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-ink-secondary">
                          {length.meta}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Step 3 — feedback */}
            <section
              aria-labelledby="feedback-heading"
              className="space-y-3.5 p-5 sm:p-6"
            >
              <StepHeading
                step={3}
                id="feedback-heading"
                title="How should feedback work?"
                hint="Coach after each answer, or save it for the debrief."
              />

              <div
                role="group"
                aria-labelledby="feedback-heading"
                className="grid grid-cols-1 gap-1 rounded-xl border border-line bg-surface-sunken p-1 sm:grid-cols-2"
              >
                {FEEDBACK.map((option) => {
                  const isSelected = mode === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setMode(option.id)}
                      aria-pressed={isSelected}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-[var(--dur-fast)]",
                        isSelected
                          ? "bg-surface text-ink shadow-xs ring-1 ring-accent/30"
                          : "text-ink-secondary hover:text-ink"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-ink-secondary">
                          {option.detail}
                        </span>
                      </span>
                      {isSelected ? (
                        <CheckCircle2
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-accent-strong"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          </Card>

          <aside className="hidden lg:sticky lg:top-20 lg:block">
            <Card className="space-y-4 p-5">
              <div className="space-y-1">
                <h2 className="text-xs font-semibold text-ink">Your round</h2>
                <p className="text-[11px] leading-relaxed text-ink-secondary">
                  Nothing starts until you press the button.
                </p>
              </div>

              <dl className="space-y-2.5 border-t border-line pt-3 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-ink-secondary">Focus</dt>
                  <dd className="text-right font-medium text-ink">
                    {selectedStyle.title}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-ink-secondary">Length</dt>
                  <dd className="text-right font-medium text-ink">
                    {selectedLength.meta}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-ink-secondary">Feedback</dt>
                  <dd className="text-right font-medium text-ink">
                    {modeLabel}
                  </dd>
                </div>
              </dl>

              {resumeBlocked && (
                <p
                  role="status"
                  className="rounded-lg border border-warning/30 bg-warning-subtle p-2.5 text-[11px] leading-relaxed text-warning-ink"
                >
                  Resume Deep-Dive needs a confirmed profile.{" "}
                  <Link
                    href="/resume"
                    className="font-semibold underline underline-offset-2"
                  >
                    Confirm your resume
                  </Link>
                  , or pick another focus track.
                </p>
              )}

              <Button
                size="lg"
                onClick={() => handleStartSession()}
                loading={starting}
                className="w-full gap-2.5"
              >
                {starting ? (
                  <span>Preparing interview…</span>
                ) : (
                  <>
                    <Mic aria-hidden="true" className="h-4 w-4" />
                    <span>Start interview</span>
                  </>
                )}
              </Button>

              <p className="text-[11px] leading-relaxed text-ink-secondary">
                {hasConsented
                  ? "Microphone consent already recorded."
                  : "You confirm microphone use once, on your first round."}
              </p>

              {totalQuestions > 0 && (
                <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-ink-tertiary">
                  {totalQuestions} questions in the bank · no repeats within a
                  round
                </p>
              )}
            </Card>
          </aside>
        </div>

        {/* Mobile start bar, kept above the fixed bottom nav */}
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface p-3 lg:hidden">
          <div className="mx-auto max-w-4xl space-y-2">
            {resumeBlocked && (
              <p
                role="status"
                className="text-[11px] leading-relaxed text-warning-ink"
              >
                Resume Deep-Dive needs a confirmed profile.{" "}
                <Link
                  href="/resume"
                  className="font-semibold underline underline-offset-2"
                >
                  Confirm your resume
                </Link>
                .
              </p>
            )}
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-ink">
                  {selectedStyle.title}
                </div>
                <div className="truncate text-[11px] text-ink-secondary">
                  {selectedLength.meta} · {modeLabel}
                </div>
              </div>
              <Button
                size="lg"
                onClick={() => handleStartSession()}
                loading={starting}
                className="shrink-0 gap-2"
              >
                {starting ? (
                  <span>Starting…</span>
                ) : (
                  <>
                    <Mic aria-hidden="true" className="h-4 w-4" />
                    <span>Start</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Audio Privacy & Consent Modal */}
        {consentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="consent-title"
              className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-overlay sm:p-8"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent-line bg-accent-subtle text-accent-strong">
                <ShieldCheck aria-hidden="true" className="h-5 w-5" />
              </div>
              <div>
                <h3
                  id="consent-title"
                  className="font-serif text-lg font-medium text-ink"
                >
                  A quick note on your microphone
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
                  We only listen while you speak to turn your voice into text for
                  answer evaluation. We never save your raw audio files or share
                  them with anyone.
                </p>
              </div>

              <div className="space-y-1.5 rounded-xl border border-line bg-surface-sunken p-3 text-[11px] text-ink-secondary">
                <div className="flex items-center gap-2">
                  <CheckCircle2
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-accent-strong"
                  />
                  <span>Audio is converted to text and immediately discarded</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-accent-strong"
                  />
                  <span>Microphone turns off the second you stop speaking</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-accent-strong"
                  />
                  <span>You can delete your transcripts anytime in Settings</span>
                </div>
              </div>

              <div className="flex gap-2.5 pt-1">
                <Button
                  variant="secondary"
                  onClick={() => setConsentModalOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button onClick={handleGrantConsent} className="flex-1">
                  Got it, start practice
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function InterviewLauncherPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center gap-3">
          <Spinner size="md" />
          <span className="text-xs font-semibold tracking-tight text-ink-secondary">
            Loading Studio Launcher…
          </span>
        </div>
      }
    >
      <InterviewContent />
    </Suspense>
  );
}
