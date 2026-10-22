"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { InterviewStudio } from "@/components/InterviewStudio";
import { api, CandidateUser, InterviewSession, InterviewTurn } from "@/lib/api";
import {
  Mic,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Play,
  RotateCcw,
  CheckCircle2,
  RefreshCw,
  AlertCircle
} from "lucide-react";
import { Suspense } from "react";

function InterviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultStyle = searchParams.get("style") || "mixed";


  const [user, setUser] = useState<CandidateUser | null>(null);
  const [activeSession, setActiveSession] = useState<InterviewSession | null>(null);
  const [currentTurn, setCurrentTurn] = useState<InterviewTurn | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [starting, setStarting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Setup form
  const [mode, setMode] = useState<"practice" | "realistic">("practice");
  const [interviewerStyle, setInterviewerStyle] = useState<string>(defaultStyle);
  const [durationMode, setDurationMode] = useState<string>("standard");
  const [hasConsented, setHasConsented] = useState<boolean>(false);
  const [consentModalOpen, setConsentModalOpen] = useState<boolean>(false);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const u = await api.getMe();
        setUser(u);
        const consentRes = await api.checkConsent();
        setHasConsented(consentRes.has_consented);
      } catch (err: any) {
        setError(err.message || "Failed to load user session.");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleStartSession = async () => {
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
      });
      setActiveSession(res.session);
      setCurrentTurn(res.current_turn);
    } catch (err: any) {
      setError(err.message || "Failed to initialize interview studio session.");
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
    } catch (err: any) {
      setError("Failed to record consent.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F1EA] text-[#20232C] flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-5 h-5 text-[#20232C] animate-spin" />
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
    <div className="min-h-screen bg-[#F4F1EA] text-[#20232C] flex flex-col font-sans selection:bg-[#4F46E5]/10 selection:text-[#4F46E5]">
      <Navbar user={user} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-3.5 sm:px-6 py-6 sm:py-12 pb-24 md:pb-12">
        {/* Header Breadcrumb & Title */}
        <div className="mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#E8E5DD] text-[#20232C] text-xs font-semibold tracking-tight mb-2.5 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-[#4F46E5]" />
            <span>Voice Interview Studio</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-[#20232C]">
            Configure Your Interview Round
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
            Select your target focus area, simulation depth, and interview mode. Every session randomly samples distinct problems and remembers your past questions to never repeat.
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 sm:p-4 bg-rose-50 border border-rose-200/80 rounded-2xl flex items-center gap-3 text-rose-800 text-xs shadow-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Configuration Card */}
        <div className="bg-white border border-[#E8E5DD] rounded-2xl sm:rounded-3xl p-4 sm:p-9 shadow-xs space-y-7 sm:space-y-9">
          {/* Candidate Profile Context Banner */}
          {user && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#FAFAF8] border border-[#E8E5DD] text-xs">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white border border-[#E8E5DD] flex items-center justify-center font-bold text-[#20232C] shadow-xs">
                  {(user.display_name || user.email || "C")[0].toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-[#20232C]">
                    Candidate Profile: {user.target_role || "Software Engineer"}
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    Target: <span className="font-medium text-slate-700">{user.target_company || "General Tech"}</span> • Onboarding: <span className="font-medium text-slate-700">{user.onboarding_state}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push("/profile")}
                className="text-[11px] font-semibold text-[#5967F2] hover:text-[#4351DB] transition underline underline-offset-2 self-start sm:self-auto"
              >
                Change Role in Profile
              </button>
            </div>
          )}

          {/* Section 1: Focus Track (Interviewer Style) */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                1. Select Interview Focus Track
              </label>
              <span className="text-[11px] text-slate-400">
                Randomized non-repeating questions
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {[
                {
                  id: "dsa",
                  title: "DSA & Coding Drill",
                  desc: "Algorithms, arrays, linked lists, trees, graphs, DP & complexity trade-offs.",
                  badge: "LeetCode Style",
                  badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
                },
                {
                  id: "system_design",
                  title: "System Architecture",
                  desc: "High-level design, database caching, horizontal scaling & microservices.",
                  badge: "Architecture",
                  badgeColor: "bg-blue-50 text-blue-700 border-blue-200/60",
                },
                {
                  id: "technical",
                  title: "Core CS Fundamentals",
                  desc: "Balanced CS drill: DBMS/SQL, Operating Systems, OOP concepts & networking.",
                  badge: "Technical",
                  badgeColor: "bg-purple-50 text-purple-700 border-purple-200/60",
                },
                {
                  id: "project_defence",
                  title: "Project Defence",
                  desc: "Deep-dive inquiry into your projects, technical decisions & failure handling.",
                  badge: "Resume Based",
                  badgeColor: "bg-amber-50 text-amber-700 border-amber-200/60",
                },
                {
                  id: "hr",
                  title: "Behavioral & STAR",
                  desc: "Conflict resolution, leadership, team collaboration & culture alignment.",
                  badge: "HR Round",
                  badgeColor: "bg-teal-50 text-teal-700 border-teal-200/60",
                },
                {
                  id: "mixed",
                  title: "Full Mock Panel",
                  desc: "Realistic multi-category round spanning DSA, system design & behavioral.",
                  badge: "Comprehensive",
                  badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200/60",
                },
              ].map((style) => {
                const isSelected = interviewerStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setInterviewerStyle(style.id)}
                    className={`relative p-4 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between group ${
                      isSelected
                        ? "border-[#5967F2] bg-indigo-50/40 shadow-sm ring-1 ring-[#5967F2]"
                        : "border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${style.badgeColor}`}>
                          {style.badge}
                        </span>
                        {isSelected && (
                          <div className="w-4 h-4 rounded-full bg-[#5967F2] text-white flex items-center justify-center">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                      <div className="font-semibold text-sm text-[#1D1D1F] tracking-tight group-hover:text-black">
                        {style.title}
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        {style.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Mode Selection */}
          <div className="space-y-3.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              2. Simulation Style & Coaching Feedback
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setMode("practice")}
                className={`p-5 rounded-2xl border text-left transition-all duration-150 relative ${
                  mode === "practice"
                    ? "border-[#5967F2] bg-indigo-50/40 shadow-sm ring-1 ring-[#5967F2]"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="font-semibold text-sm text-[#1D1D1F]">
                    Interactive Coaching Mode
                  </div>
                  {mode === "practice" && (
                    <CheckCircle2 className="w-4 h-4 text-[#5967F2]" />
                  )}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Instant rubric scores after each question, missing key concepts highlight, and helpful coaching suggestions before the next turn.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode("realistic")}
                className={`p-5 rounded-2xl border text-left transition-all duration-150 relative ${
                  mode === "realistic"
                    ? "border-[#5967F2] bg-indigo-50/40 shadow-sm ring-1 ring-[#5967F2]"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="font-semibold text-sm text-[#1D1D1F]">
                    Realistic Simulation Round
                  </div>
                  {mode === "realistic" && (
                    <CheckCircle2 className="w-4 h-4 text-[#5967F2]" />
                  )}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  True interview panel conditions. Uninterrupted voice-to-voice flow with natural neural interviewer audio and comprehensive debrief at the end.
                </p>
              </button>
            </div>
          </div>

          {/* Section 3: Duration / Question Count */}
          <div className="space-y-3.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              3. Round Length & Questions
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
                    className={`p-3 sm:p-3.5 rounded-2xl border text-center transition-all duration-150 min-h-[48px] ${
                      isSelected
                        ? "border-[#168A72] bg-teal-50/60 text-[#168A72] shadow-xs ring-1 ring-[#168A72]"
                        : "border-slate-200 hover:border-slate-300 text-slate-700 bg-white"
                    }`}
                  >
                    <div className="text-xs font-semibold">{d.label}</div>
                    <div className="text-[11px] font-bold mt-0.5 text-slate-800">{d.count}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{d.time}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Neural Voice & Privacy Guarantee Sub-strip */}
          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-slate-500 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Ultra-realistic neural recruiter voice (Edge TTS engine active)</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
              <span>Zero-disk audio retention guarantee</span>
            </div>
          </div>

          {/* Launch Action */}
          <button
            onClick={handleStartSession}
            disabled={starting}
            className="w-full py-4 rounded-2xl bg-[#20232C] hover:bg-black text-[#F4F1EA] font-semibold text-sm transition-all duration-150 shadow-md hover:shadow-lg flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer min-h-[52px]"
          >
            {starting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Preparing Interview Blueprint & Orb...</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 text-white" />
                <span>Start Interview Round</span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </>
            )}
          </button>
        </div>
      </main>

      {/* Audio Privacy & Consent Modal */}
      {consentModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8E5DD] rounded-2xl sm:rounded-3xl p-5 sm:p-8 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="w-10 h-10 bg-teal-50 rounded-2xl flex items-center justify-center text-[#168A72]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-[#20232C]">
                Audio Privacy Disclosure & Consent
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed mt-1.5">
                Antigravity Interview Coach adheres to strict privacy-by-design standards:
                your audio is streamed in-memory solely for transcription and immediately purged.
                No raw voice recordings are stored on disk or shared.
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-[11px] text-slate-600 space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Zero raw audio persistence to disk or storage</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Microphone released automatically when recording stops</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Interview history can be deleted anytime in Settings</span>
              </div>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => setConsentModalOpen(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleGrantConsent}
                className="flex-1 py-3 rounded-xl bg-[#20232C] hover:bg-black text-[#F4F1EA] text-xs font-semibold transition shadow-sm min-h-[44px]"
              >
                I Consent & Begin
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
        <div className="min-h-screen bg-[#F4F1EA] text-[#20232C] flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-5 h-5 text-[#20232C] animate-spin" />
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

