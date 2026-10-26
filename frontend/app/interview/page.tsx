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
  SlidersHorizontal,
  Library,
} from "lucide-react";
import { Suspense } from "react";

const DURATIONS = [
  { id: "quick", label: "Quick Drill", count: "3 Questions", time: "~8 min" },
  { id: "standard", label: "Standard Round", count: "5 Questions", time: "~18 min" },
  { id: "full", label: "Deep-Dive Panel", count: "8 Questions", time: "~35 min" },
];

const PRESETS = [
  { id: "quick", label: "Warm-up", detail: "3 Q · ~8 min" },
  { id: "standard", label: "Standard", detail: "5 Q · ~18 min" },
  { id: "full", label: "Deep dive", detail: "8 Q · ~35 min" },
];

const STYLES = [
  {
    id: "aiml",
    title: "AI/ML & Agentic Systems",
    desc: "RAG pipelines, LangGraph, agent planning, PyTorch, and LLM evals.",
    badge: "AI/ML",
    requiresProfile: false,
  },
  {
    id: "dsa",
    title: "DSA & Coding Drill",
    desc: "Arrays, trees, graphs, DP, and algorithmic complexity.",
    badge: "Coding",
    requiresProfile: false,
  },
  {
    id: "system_design",
    title: "System Architecture",
    desc: "Distributed caching, databases, and scalability trade-offs.",
    badge: "Design",
    requiresProfile: false,
  },
  {
    id: "technical",
    title: "Core CS Fundamentals",
    desc: "Operating systems, DBMS, SQL, OOP, and networks.",
    badge: "CS Core",
    requiresProfile: false,
  },
  {
    id: "project_defence",
    title: "Project Defence",
    desc: "Architectural choices, failure handling, and trade-offs.",
    badge: "Projects",
    requiresProfile: false,
  },
  {
    id: "hr",
    title: "Behavioral & Leadership",
    desc: "STAR stories, teamwork, conflicts, and ownership.",
    badge: "HR",
    requiresProfile: false,
  },
  {
    id: "resume",
    title: "Resume Deep-Dive",
    desc: "Questions built only from your confirmed resume projects and decisions.",
    badge: "Resume",
    requiresProfile: true,
  },
  {
    id: "mixed",
    title: "Full Mock Panel",
    desc: "Comprehensive mix across coding, architecture, and behavioral.",
    badge: "Mixed",
    requiresProfile: false,
  },
];

// Canonical bank topics each focus track draws from directly. Mirrors the
// backend blueprint mapping so a count is a fact about the bank, not a guess.
// Tracks without an entry blend the whole bank through the role fallback.
const TRACK_TOPIC_KEYS: Record<string, string[]> = {
  aiml: [
    "ml_foundations",
    "ml_metrics",
    "rag",
    "agentic_ai",
    "langgraph",
    "llm_eval_latency",
  ],
  dsa: [
    "dsa_general",
    "dsa_hashing",
    "dsa_two_pointers",
    "dsa_trees_graphs_dp",
    "dsa_complexity",
  ],
  system_design: [
    "system_design_architecture",
    "api_contracts_idempotency",
    "db_indexing_query_plans",
    "distributed_caching",
    "scalability_resiliency",
  ],
  project_defence: [
    "project_architecture",
    "project_bottleneck",
    "project_tradeoffs",
    "project_failure",
  ],
  hr: [
    "behavioral_intro",
    "behavioral_failure",
    "behavioral_collaboration",
    "behavioral_prioritization",
  ],
  resume: [],
};

const LAST_CONFIG_KEY = "ai_coach_last_setup";

interface SetupConfig {
  mode: "practice" | "realistic";
  interviewerStyle: string;
  durationMode: string;
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
  const initialDuration = drillParam ? "drill" : phaseParam === "phase_1" ? "quick" : "standard";

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
  const [lastConfig, setLastConfig] = useState<SetupConfig | null>(null);
  // A round left open on the server. Surfaced so the user resumes instead of
  // silently forking a second session. Only the id is required to resume, so
  // the 409 path can recover without a second round-trip.
  const [resumable, setResumable] = useState<{ id: string; label: string | null } | null>(null);
  // Live bank coverage. A failed lookup only costs the coverage copy; the
  // setup form stays usable, and the UI says so instead of inventing numbers.
  const [topics, setTopics] = useState<QuestionTopic[]>([]);
  const [topicsLoaded, setTopicsLoaded] = useState<boolean>(false);

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
      } finally {
        if (!cancelled) setTopicsLoaded(true);
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
        try {
          const raw = localStorage.getItem(LAST_CONFIG_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as Partial<SetupConfig>;
            if (
              (parsed.mode === "practice" || parsed.mode === "realistic") &&
              typeof parsed.interviewerStyle === "string" &&
              typeof parsed.durationMode === "string"
            ) {
              setLastConfig({
                mode: parsed.mode,
                interviewerStyle: parsed.interviewerStyle,
                durationMode: parsed.durationMode,
              });
            }
          }
        } catch {
          // Unreadable or blocked storage just means there is no chip to show.
        }
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
  const selectedDuration =
    DURATIONS.find((d) => d.id === durationMode) ?? DURATIONS[1];
  const modeLabel =
    mode === "practice" ? "Interactive coaching" : "Realistic simulation";
  const resumeBlocked = interviewerStyle === "resume" && !hasConfirmedProfile;

  const totalQuestions = topics.reduce((sum, t) => sum + t.total, 0);
  const sortedTopics = [...topics].sort(
    (a, b) => b.total - a.total || a.label.localeCompare(b.label)
  );

  // Counts are facts about the loaded bank: only the canonical topics a track
  // draws from directly are summed. Tracks without a mapping blend the whole
  // bank through the backend's role fallback, so they get no invented count.
  const coverageFor = (styleId: string): string => {
    if (!topicsLoaded) return "Checking bank coverage…";
    if (!topics.length) return "Coverage unavailable";
    if (styleId === "resume") return "Built from your resume";
    const keys = TRACK_TOPIC_KEYS[styleId];
    if (!keys) return "Blended across all topics";
    let direct = 0;
    let covered = 0;
    for (const key of keys) {
      const topic = topics.find((t) => t.key === key);
      if (!topic) continue;
      direct += topic.total;
      if (topic.total > 0) covered += 1;
    }
    if (direct === 0) return "Fills from other topics";
    const noun = direct === 1 ? "question" : "questions";
    if (direct < 3) return `${direct} ${noun} · fills from other topics`;
    return `${direct} ${noun} across ${covered} ${
      covered === 1 ? "topic" : "topics"
    }`;
  };

  const applyConfig = (config: SetupConfig) => {
    setMode(config.mode);
    // A remembered Resume Deep-Dive setup is not usable without a confirmed
    // profile, so fall back to the mixed panel instead of a dead end.
    setInterviewerStyle(
      config.interviewerStyle === "resume" && !hasConfirmedProfile
        ? "mixed"
        : config.interviewerStyle
    );
    setDurationMode(config.durationMode);
  };

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
      const config: SetupConfig = { mode, interviewerStyle, durationMode };
      setLastConfig(config);
      try {
        localStorage.setItem(LAST_CONFIG_KEY, JSON.stringify(config));
      } catch {
        // Remembering the setup is a nicety; storage may be unavailable.
      }
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
    return <InterviewStudio initialSession={activeSession} initialTurn={currentTurn} />;
  }

  return (
    <AppShell user={user} width="default">
      <div className="space-y-6">
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
              : "Pick a topic, choose whether you want instant coaching, and practice speaking your answers out loud."
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

        {topicsLoaded && topics.length > 0 && (
          <Card className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <Library
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-ink-secondary"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-semibold text-ink">Question bank</p>
                  <p className="text-xs text-ink-secondary">
                    {totalQuestions} questions · {topics.length} topics
                  </p>
                </div>
                <p className="text-xs leading-relaxed text-ink-secondary">
                  Rounds draw from this bank and do not repeat a question until
                  the pool is exhausted.
                </p>
                <details className="rounded-lg border border-line bg-surface-sunken">
                  <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    See coverage by topic
                  </summary>
                  <ul className="max-h-64 space-y-1 overflow-y-auto border-t border-line px-3 py-2 text-[11px]">
                    {sortedTopics.map((topic) => (
                      <li
                        key={topic.key}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <span className="truncate text-ink-secondary">
                          {topic.label}
                        </span>
                        <span className="shrink-0 font-medium text-ink">
                          {topic.total}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-5 pb-24 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-6 lg:pb-0">
          <Card className="space-y-7 p-5 sm:p-8">
            {/* Presets + last used */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink">
                  Round preset
                </span>
                {lastConfig && (
                  <button
                    type="button"
                    onClick={() => applyConfig(lastConfig)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface-sunken px-2.5 py-1 text-[11px] font-semibold text-ink-secondary transition-colors duration-[var(--dur-fast)] hover:border-line-strong hover:text-ink"
                  >
                    <History aria-hidden="true" className="h-3 w-3" />
                    <span>
                      Last used:{" "}
                      {PRESETS.find((p) => p.id === lastConfig.durationMode)
                        ?.label ?? lastConfig.durationMode}
                    </span>
                  </button>
                )}
              </div>

              {phaseParam || drillParam ? (
                <p className="rounded-xl border border-line bg-surface-sunken px-3.5 py-3 text-[11px] leading-relaxed text-ink-secondary">
                  Round length is set by this{" "}
                  {drillParam ? "focused drill" : "phase"}. Presets apply to
                  regular practice rounds.
                </p>
              ) : (
                <>
                  <div
                    role="group"
                    aria-label="Round preset"
                    className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-sunken p-1"
                  >
                    {PRESETS.map((preset) => {
                      const isSelected = durationMode === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setDurationMode(preset.id)}
                          aria-pressed={isSelected}
                          className={cn(
                            "cursor-pointer rounded-lg px-2 py-2 text-center transition-colors duration-[var(--dur-fast)]",
                            isSelected
                              ? "bg-surface text-ink shadow-xs ring-1 ring-accent/30"
                              : "text-ink-secondary hover:text-ink"
                          )}
                        >
                          <span className="block text-xs font-semibold">
                            {preset.label}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-ink-secondary">
                            {preset.detail}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] leading-relaxed text-ink-secondary">
                    A preset only sets round length: question count and target
                    time. Focus track and feedback style stay as you pick them.
                  </p>
                </>
              )}
            </div>

            {/* Candidate Profile Context Banner */}
          {user && (
            <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface-sunken p-3.5 text-xs sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-accent-line bg-accent-subtle text-xs font-bold text-accent-strong">
                  {(user.display_name || user.email || "C")[0].toUpperCase()}
                </div>
                <div className="text-ink-secondary">
                  <span className="font-semibold text-ink">
                    {user.target_role || "Software Engineer"}
                  </span>
                  <span className="mx-1.5 text-ink-tertiary">•</span>
                  <span>{user.target_company || "General Tech"}</span>
                </div>
              </div>
              <Link
                href="/resume"
                className="self-start text-[11px] font-semibold text-accent-strong transition-colors hover:underline sm:self-auto"
              >
                Edit profile
              </Link>
            </div>
          )}

          {/* Section 1: Focus Track */}
          <fieldset className="space-y-3">
            <legend className="block text-xs font-semibold text-ink">
              Focus track
            </legend>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {STYLES.map((style) => {
                const isSelected = interviewerStyle === style.id;
                const isLocked = style.requiresProfile && !hasConfirmedProfile;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setInterviewerStyle(style.id)}
                    aria-disabled={isLocked}
                    title={
                      isLocked
                        ? "Confirm your resume profile with at least one project first."
                        : undefined
                    }
                    className={`group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-colors duration-[var(--dur-fast)] ${
                      isLocked
                        ? "cursor-pointer border-dashed border-line bg-surface-sunken opacity-60"
                        : "cursor-pointer"
                    } ${
                      isSelected
                        ? "border-accent-line bg-accent-subtle shadow-xs ring-1 ring-accent/30"
                        : !isLocked
                        ? "border-line bg-surface-sunken hover:border-line-strong"
                        : ""
                    }`}
                  >
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">
                          {style.badge}
                        </span>
                        {isLocked ? (
                          <span className="text-[10px] font-semibold text-ink-secondary">
                            Locked
                          </span>
                        ) : (
                          isSelected && (
                            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-strong text-on-accent">
                              <CheckCircle2
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                              />
                            </div>
                          )
                        )}
                      </div>
                      <div className="text-xs font-semibold tracking-tight text-ink">
                        {style.title}
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-ink-secondary">
                        {style.desc}
                      </p>
                      <p className="mt-1.5 text-[10px] font-medium text-ink-tertiary">
                        {coverageFor(style.id)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {!hasConfirmedProfile && (
              <p className="text-[11px] leading-relaxed text-ink-secondary">
                Resume Deep-Dive unlocks once you confirm a profile with at least one project.{" "}
                <Link
                  href="/resume"
                  className="font-semibold text-accent-strong underline underline-offset-2"
                >
                  Confirm your resume profile
                </Link>
                .
              </p>
            )}
          </fieldset>

          {/* Section 2: Feedback Mode */}
          <fieldset className="space-y-3">
            <legend className="block text-xs font-semibold text-ink">
              Feedback style
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("practice")}
                aria-pressed={mode === "practice"}
                className={`relative cursor-pointer rounded-xl border p-4 text-left transition-colors duration-[var(--dur-fast)] ${
                  mode === "practice"
                    ? "border-accent-line bg-accent-subtle shadow-xs ring-1 ring-accent/30"
                    : "border-line bg-surface-sunken hover:border-line-strong"
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-xs font-semibold text-ink">
                    Interactive Coaching
                  </div>
                  {mode === "practice" && (
                    <CheckCircle2
                      aria-hidden="true"
                      className="h-4 w-4 text-accent-strong"
                    />
                  )}
                </div>
                <p className="text-[11px] leading-relaxed text-ink-secondary">
                  Immediate score and missing points feedback after each answer.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode("realistic")}
                aria-pressed={mode === "realistic"}
                className={`relative cursor-pointer rounded-xl border p-4 text-left transition-colors duration-[var(--dur-fast)] ${
                  mode === "realistic"
                    ? "border-accent-line bg-accent-subtle shadow-xs ring-1 ring-accent/30"
                    : "border-line bg-surface-sunken hover:border-line-strong"
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-xs font-semibold text-ink">
                    Realistic Simulation
                  </div>
                  {mode === "realistic" && (
                    <CheckCircle2
                      aria-hidden="true"
                      className="h-4 w-4 text-accent-strong"
                    />
                  )}
                </div>
                <p className="text-[11px] leading-relaxed text-ink-secondary">
                  Continuous interview flow with a comprehensive final debrief.
                </p>
              </button>
            </div>
          </fieldset>

            {/* Advanced: round length */}
            <details className="group rounded-xl border border-line bg-surface-sunken">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs font-semibold text-ink [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <SlidersHorizontal
                    aria-hidden="true"
                    className="h-3.5 w-3.5 text-ink-secondary"
                  />
                  Advanced
                </span>
                <span className="text-[11px] font-medium text-ink-secondary">
                  {selectedDuration.label} · {selectedDuration.count} ·{" "}
                  {selectedDuration.time}
                </span>
              </summary>
              <div className="space-y-3 border-t border-line px-4 py-4">
                <p className="text-[11px] leading-relaxed text-ink-secondary">
                  Round length sets the question count and target time. It is the
                  only setting a preset changes.
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
                  {DURATIONS.map((d) => {
                    const isSelected = durationMode === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDurationMode(d.id)}
                        aria-pressed={isSelected}
                        className={`min-h-[48px] cursor-pointer rounded-xl border p-3 text-center transition-colors duration-[var(--dur-fast)] ${
                          isSelected
                            ? "border-accent-line bg-accent-subtle shadow-xs ring-1 ring-accent/30"
                            : "border-line bg-surface hover:border-line-strong"
                        }`}
                      >
                        <div className="text-xs font-semibold text-ink">
                          {d.label}
                        </div>
                        <div className="mt-0.5 text-[11px] text-ink-secondary">
                          {d.count} · {d.time}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </details>
          </Card>

          <aside className="hidden lg:sticky lg:top-20 lg:block">
            <Card className="space-y-4 p-5">
              <div className="space-y-1">
                <h2 className="text-xs font-semibold text-ink">Your round</h2>
                <p className="text-[11px] leading-relaxed text-ink-secondary">
                  Nothing is sent until you press start.
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
                  <dt className="shrink-0 text-ink-secondary">Feedback</dt>
                  <dd className="text-right font-medium text-ink">
                    {modeLabel}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-ink-secondary">Length</dt>
                  <dd className="text-right font-medium text-ink">
                    {selectedDuration.count} · {selectedDuration.time}
                  </dd>
                </div>
              </dl>

              <div className="space-y-1 border-t border-line pt-3">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-ink-secondary">Bank</span>
                  <span className="font-medium text-ink">
                    {topics.length
                      ? `${totalQuestions} questions`
                      : topicsLoaded
                      ? "Coverage unavailable"
                      : "Checking…"}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-ink-secondary">
                  {coverageFor(interviewerStyle)}
                </p>
              </div>

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
                  {modeLabel} · {selectedDuration.time}
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

