"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { InterviewStudio } from "@/components/InterviewStudio";
import { api, CandidateUser, InterviewSession, InterviewTurn } from "@/lib/api";
import { speechSynth } from "@/lib/speech";
import { getErrorMessage } from "@/lib/utils";
import {
  Mic,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
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
      <div className="min-h-screen bg-white text-[#202124] flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-5 h-5 text-[#202124] animate-spin" />
        <span className="text-xs font-semibold text-slate-500 tracking-tight">
          Loading Interview Studio...
        </span>
      </div>
    );
  }

  // Active studio turn
  if (activeSession && currentTurn) {
    return <InterviewStudio initialSession={activeSession} initialTurn={currentTurn} />;
  }

  return (
    <div className="min-h-screen bg-white text-[#202124] flex flex-col font-sans selection:bg-[#FAF2ED] selection:text-[#B3582A]">
      <Navbar user={user} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-3.5 sm:px-6 py-6 sm:py-10 pb-24 md:pb-12">
        {/* Header Title */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-2 mb-2">
            {drillParam && (
              <span className="px-2.5 py-0.5 rounded-full bg-[#FAF2ED] border border-[#EED9CC] text-[#B3582A] text-[11px] font-bold uppercase tracking-wider">
                Focused Skill Drill
              </span>
            )}
            {phaseParam && (
              <span className="px-2.5 py-0.5 rounded-full bg-[#202124] text-white text-[11px] font-bold uppercase tracking-wider">
                {phaseParam.replace("_", " ").toUpperCase()}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#202124]">
            {drillParam
              ? `Focused Drill: ${drillParam.replace("_", " ").toUpperCase()}`
              : phaseParam === "phase_1"
              ? "Phase 1: Core Technical Foundations"
              : phaseParam === "phase_2"
              ? "Phase 2: Applied Problem-Solving & Coding"
              : phaseParam === "phase_3"
              ? "Phase 3: Project Architecture & Defence"
              : phaseParam === "phase_4"
              ? "Phase 4: Realistic Full Mock Panel"
              : "Start a Practice Round"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
            {drillParam
              ? "A short, focused 2-question session targeting this specific skill area with instant calibrated feedback."
              : phaseParam === "phase_1"
              ? "Assess essential programming knowledge, language internals, and baseline role-specific concepts."
              : phaseParam === "phase_2"
              ? "Test coding, algorithms, practical debugging, and reasoning under real constraints."
              : phaseParam === "phase_3"
              ? "Deep dive into your resume projects, design decisions, failure handling, and trade-offs."
              : phaseParam === "phase_4"
              ? "Full timed simulation combining technical, architectural, and behavioral questions with a comprehensive debrief."
              : "Pick a topic, choose whether you want instant coaching, and practice speaking your answers out loud."}
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 sm:p-4 bg-rose-50 border border-rose-200/80 rounded-2xl flex items-center gap-3 text-rose-800 text-xs shadow-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Configuration Card */}
        <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xs space-y-6 sm:space-y-7">
          {/* Candidate Profile Context Banner */}
          {user && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 rounded-2xl bg-[#F7F7F5] border border-[#E6E6E4] text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#FAF2ED] border border-[#EED9CC] flex items-center justify-center font-bold text-[#B3582A] text-xs shadow-xs">
                  {(user.display_name || user.email || "C")[0].toUpperCase()}
                </div>
                <div className="text-slate-600">
                  <span className="font-semibold text-[#202124]">{user.target_role || "Software Engineer"}</span>
                  <span className="text-slate-400 mx-1.5">•</span>
                  <span>{user.target_company || "General Tech"}</span>
                </div>
              </div>
              <Link
                href="/resume"
                className="text-[11px] font-semibold text-[#B3582A] hover:text-[#C4744B] transition self-start sm:self-auto"
              >
                Edit profile
              </Link>
            </div>
          )}

          {/* Section 1: Focus Track */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              Focus Track
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                    className={`relative p-3.5 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between group ${
                      isLocked
                        ? "border-[#E6E6E4] bg-[#F7F7F5] opacity-60 cursor-not-allowed"
                        : "cursor-pointer"
                    } ${
                      isSelected && !isLocked
                        ? "border-[#202124] bg-[#FAF2ED]/60 shadow-xs ring-1 ring-[#C4744B]/30"
                        : !isLocked
                        ? "border-[#E6E6E4] hover:border-slate-300 bg-white"
                        : ""
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                          {style.badge}
                        </span>
                        {isLocked ? (
                          <span className="text-[10px] font-semibold text-slate-400">
                            Locked
                          </span>
                        ) : (
                          isSelected && (
                            <div className="w-4 h-4 rounded-full bg-[#202124] text-white flex items-center justify-center">
                              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            </div>
                          )
                        )}
                      </div>
                      <div className="font-semibold text-xs text-[#202124] tracking-tight">
                        {style.title}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        {style.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {!hasConfirmedProfile && (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Resume Deep-Dive unlocks once you confirm a profile with at least one project.{" "}
                <Link
                  href="/resume"
                  className="font-semibold text-[#B3582A] hover:text-[#C4744B] underline underline-offset-2"
                >
                  Confirm your resume profile
                </Link>
                .
              </p>
            )}
          </div>

          {/* Section 2: Feedback Mode */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              Feedback Style
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode("practice")}
                className={`p-4 rounded-2xl border text-left transition-all duration-150 relative cursor-pointer ${
                  mode === "practice"
                    ? "border-[#202124] bg-[#FAF2ED]/60 shadow-xs ring-1 ring-[#C4744B]/30"
                    : "border-[#E6E6E4] hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="font-semibold text-xs text-[#202124]">
                    Interactive Coaching
                  </div>
                  {mode === "practice" && (
                    <CheckCircle2 className="w-4 h-4 text-[#202124]" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Immediate score and missing points feedback after each answer.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode("realistic")}
                className={`p-4 rounded-2xl border text-left transition-all duration-150 relative cursor-pointer ${
                  mode === "realistic"
                    ? "border-[#202124] bg-[#FAF2ED]/60 shadow-xs ring-1 ring-[#C4744B]/30"
                    : "border-[#E6E6E4] hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="font-semibold text-xs text-[#202124]">
                    Realistic Simulation
                  </div>
                  {mode === "realistic" && (
                    <CheckCircle2 className="w-4 h-4 text-[#202124]" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Continuous interview flow with a comprehensive final debrief.
                </p>
              </button>
            </div>
          </div>

          {/* Section 3: Duration / Question Count */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              Round Length
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
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
                    className={`p-3 rounded-2xl border text-center transition-all duration-150 min-h-[48px] cursor-pointer ${
                      isSelected
                        ? "border-[#202124] bg-[#FAF2ED]/60 shadow-xs ring-1 ring-[#C4744B]/30"
                        : "border-[#E6E6E4] hover:border-slate-300 text-slate-700 bg-white"
                    }`}
                  >
                    <div className="text-xs font-semibold text-[#202124]">{d.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{d.count} • {d.time}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Launch Action - High Priority Confident Graphite */}
          <button
            onClick={handleStartSession}
            disabled={starting}
            className="w-full py-3.5 sm:py-4 rounded-xl bg-[#202124] hover:bg-[#111113] text-white font-semibold text-xs sm:text-sm transition shadow-sm flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer min-h-[48px]"
          >
            {starting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Preparing Interview...</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 text-white" />
                <span>Start Interview</span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </>
            )}
          </button>
        </div>
      </main>

      {/* Audio Privacy & Consent Modal */}
      {consentModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-5 sm:p-8 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="w-10 h-10 bg-[#FAF2ED] border border-[#EED9CC] rounded-2xl flex items-center justify-center text-[#B3582A]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#202124]">
                A quick note on your microphone
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed mt-1">
                We only listen while you speak to turn your voice into text for answer evaluation. We never save your raw audio files or share them with anyone.
              </p>
            </div>

            <div className="p-3 bg-[#F7F7F5] border border-[#E6E6E4] rounded-2xl text-[11px] text-slate-600 space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#B3582A] shrink-0" />
                <span>Audio is converted to text and immediately discarded</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#B3582A] shrink-0" />
                <span>Microphone turns off the second you stop speaking</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#B3582A] shrink-0" />
                <span>You can delete your transcripts anytime in Settings</span>
              </div>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => setConsentModalOpen(false)}
                className="flex-1 py-3 rounded-xl border border-[#E6E6E4] text-[#5F6368] text-xs font-semibold hover:bg-[#F7F7F5] transition min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleGrantConsent}
                className="flex-1 py-3 rounded-xl bg-[#202124] hover:bg-[#111113] text-white text-xs font-semibold transition shadow-sm min-h-[44px]"
              >
                Got it, start practice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InterviewLauncherPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white text-[#202124] flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-5 h-5 text-[#202124] animate-spin" />
          <span className="text-xs font-semibold text-slate-500 tracking-tight">
            Loading Studio Launcher...
          </span>
        </div>
      }
    >
      <InterviewContent />
    </Suspense>
  );
}

