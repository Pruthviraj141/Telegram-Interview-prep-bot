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
import { api, CandidateUser, InterviewSession, InterviewTurn } from "@/lib/api";
import { speechSynth } from "@/lib/speech";
import { getErrorMessage } from "@/lib/utils";
import {
  Mic,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Suspense } from "react";

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
        }
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Failed to load user session."));
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [searchParams, router]);

  const handleStartSession = async () => {
    // Prime browser audio context right upon click gesture
    speechSynth.unlockAudio();

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
      });
      setActiveSession(res.session);
      setCurrentTurn(res.current_turn);
    } catch (err: unknown) {
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

        <Card className="space-y-7 p-5 sm:p-8">
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
              {[
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
              ].map((style) => {
                const isSelected = interviewerStyle === style.id;
                const isLocked = style.requiresProfile && !hasConfirmedProfile;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => {
                      if (isLocked) return;
                      setInterviewerStyle(style.id);
                    }}
                    disabled={isLocked}
                    aria-disabled={isLocked}
                    title={
                      isLocked
                        ? "Confirm your resume profile with at least one project first."
                        : undefined
                    }
                    className={`group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-colors duration-[var(--dur-fast)] ${
                      isLocked
                        ? "cursor-not-allowed border-line bg-surface-sunken opacity-60"
                        : "cursor-pointer"
                    } ${
                      isSelected && !isLocked
                        ? "border-accent-line bg-accent-subtle shadow-xs ring-1 ring-accent/30"
                        : !isLocked
                        ? "border-line bg-surface-sunken hover:border-line-strong"
                        : ""
                    }`}
                  >
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                          {style.badge}
                        </span>
                        {isLocked ? (
                          <span className="text-[10px] font-semibold text-ink-tertiary">
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

          {/* Section 3: Duration / Question Count */}
          <fieldset className="space-y-3">
            <legend className="block text-xs font-semibold text-ink">
              Round length
            </legend>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
              {[
                { id: "quick", label: "Quick Drill", count: "3 Questions", time: "~8 min" },
                { id: "standard", label: "Standard Round", count: "5 Questions", time: "~18 min" },
                { id: "full", label: "Deep-Dive Panel", count: "8 Questions", time: "~35 min" },
              ].map((d) => {
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
                        : "border-line bg-surface-sunken hover:border-line-strong"
                    }`}
                  >
                    <div className="text-xs font-semibold text-ink">{d.label}</div>
                    <div className="mt-0.5 text-[11px] text-ink-secondary">
                      {d.count} • {d.time}
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Button
            size="lg"
            onClick={handleStartSession}
            loading={starting}
            className="w-full gap-2.5"
          >
            {starting ? (
              <span>Preparing interview…</span>
            ) : (
              <>
                <Mic aria-hidden="true" className="h-4 w-4" />
                <span>Start interview</span>
                <ArrowRight aria-hidden="true" className="h-4 w-4 opacity-70" />
              </>
            )}
          </Button>
        </Card>

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

