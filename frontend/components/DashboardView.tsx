"use client";

import React from "react";
import Link from "next/link";
import {
  Mic,
  TrendingUp,
  Briefcase,
  Award,
  CheckCircle2,
  Check,
  Building2,
  Clock,
  ArrowRight,
  Calendar,
  Sparkles
} from "lucide-react";
import { CandidateUser } from "@/lib/api";
import { cn } from "@/lib/utils";

interface DashboardViewProps {
  user: CandidateUser;
  dashboardData: any;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ user, dashboardData }) => {
  const readinessObj = dashboardData?.overall_readiness;
  const readinessScore = typeof readinessObj === "object" ? readinessObj?.score : readinessObj;
  const readinessPercent = readinessScore ? Math.round((readinessScore / 5.0) * 100) : 76;
  const readinessLabel = typeof readinessObj === "object" ? readinessObj?.label : null;
  const recentSessions = dashboardData?.recent_sessions || [];
  const targetRole = dashboardData?.target_role || user?.target_role || "Software Engineer";
  const targetCompany = dashboardData?.target_company || user?.target_company || "General Tech";

  return (
    <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 pb-24 md:pb-12 font-sans bg-white text-[#202124]">
      {/* Hero Banner: Graphite & Clean Typography */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-[#1C1D20] border border-[#2C2D32] shadow-xs">
        <div className="relative z-10 p-5 sm:p-8 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6">
          {/* Left Column */}
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.08] border border-white/10 text-[11px] font-medium text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C4744B]" />
              <span>Target Role: {targetRole}</span>
              <span className="text-white/30">•</span>
              <span className="text-slate-300">{targetCompany}</span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white leading-tight">
                Practice speaking your interview answers out loud.
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed max-w-xl">
                Real technical questions, natural follow-ups, and honest feedback on your explanations before placement season starts.
              </p>
            </div>

            {/* Quick-Launch Topic Tracks */}
            <div className="pt-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-[11px] font-medium text-slate-400 mr-1">
                Quick practice:
              </span>
              {[
                { label: "DSA Drill", href: "/interview?drill=dsa" },
                { label: "AI/ML Track", href: "/interview?style=aiml" },
                { label: "Phase 1: Core CS", href: "/interview?phase=phase_1" },
                { label: "Phase 2: Problem Solving", href: "/interview?phase=phase_2" },
                { label: "Phase 3: Project Defence", href: "/interview?phase=phase_3" },
                { label: "Phase 4: Full Mock", href: "/interview?phase=phase_4" },
              ].map((pill) => (
                <Link
                  key={pill.label}
                  href={pill.href}
                  className="px-2.5 sm:px-3 py-1 rounded-xl bg-[#26282D] hover:bg-[#30333A] border border-[#3A3D45] text-slate-200 hover:text-white text-[11px] font-medium transition cursor-pointer"
                >
                  {pill.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Right Column: Obvious Primary Action */}
          <div className="shrink-0 flex flex-col items-stretch lg:items-end justify-center">
            <Link
              href="/interview"
              className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl bg-white hover:bg-slate-100 text-[#202124] font-semibold text-xs sm:text-sm transition shadow-sm flex items-center justify-center gap-2.5 cursor-pointer min-h-[48px]"
            >
              <Mic className="w-4 h-4 text-[#202124] shrink-0" />
              <span>Start Practice Round</span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </Link>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2-Column Main Workspace: Readiness Gauge + Preparation Roadmap            */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        {/* Left Column: Placement Readiness (1 Col) */}
        <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#F2F2F0]">
            <div>
              <h3 className="text-sm font-semibold text-[#202124] tracking-tight">Placement Readiness</h3>
              <p className="text-[11px] text-[#5F6368]">Based on your answers and practice history</p>
            </div>
            <div className="w-8 h-8 rounded-xl bg-[#F7F7F5] border border-[#E6E6E4] flex items-center justify-center text-[#202124]">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-4xl sm:text-5xl font-semibold tracking-tight text-[#202124]">
              {readinessPercent}%
            </span>
            <span className="text-xs font-semibold text-[#B3582A] bg-[#FAF2ED] px-2.5 py-0.5 rounded-full border border-[#EED9CC]">
              {readinessLabel || `Target: ${targetCompany}`}
            </span>
          </div>

          {/* Progress Bar with Warm Clay Highlight */}
          <div className="w-full bg-[#F2F2F0] h-2 rounded-full overflow-hidden">
            <div
              style={{ width: `${Math.min(readinessPercent, 100)}%` }}
              className="bg-[#202124] h-full rounded-full transition-all duration-500"
            />
          </div>

          {/* Category Readiness Breakdown */}
          <div className="space-y-3 pt-1">
            {[
              { name: "Algorithms & Data Structures", score: 82 },
              { name: "System Design & Scaling", score: 75 },
              { name: "Resume & Project Questions", score: 85 },
              { name: "HR & Situational Scenarios", score: 70 },
            ].map((cat) => (
              <div key={cat.name} className="space-y-1">
                <div className="flex justify-between text-[11px] text-[#5F6368]">
                  <span className="font-medium">{cat.name}</span>
                  <span className="font-semibold text-[#202124]">{cat.score}%</span>
                </div>
                <div className="w-full bg-[#F2F2F0] h-1.5 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${cat.score}%` }}
                    className="bg-[#5F6368] h-full rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>

          <Link
            href="/resume"
            className="block w-full py-2.5 rounded-xl bg-[#F7F7F5] hover:bg-[#EFEFEA] border border-[#E6E6E4] text-center text-xs font-semibold text-[#202124] transition min-h-[42px] flex items-center justify-center"
          >
            Review Resume Profile
          </Link>
        </div>

        {/* Right Column: Preparation Roadmap with Visual Hierarchy (2 Cols) */}
        <div className="lg:col-span-2 bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#F2F2F0]">
            <div>
              <h3 className="text-sm font-semibold text-[#202124] tracking-tight">Preparation Roadmap</h3>
              <p className="text-[11px] text-[#5F6368]">Master each round in the order companies test them</p>
            </div>
            <Link
              href="/company-prep"
              className="text-xs font-semibold text-[#202124] hover:text-[#C4744B] transition inline-flex items-center gap-1"
            >
              <span>Company packs</span>
              <ArrowRight className="w-3 h-3 text-[#80868B]" />
            </Link>
          </div>

          {/* Progress Indicator Stepper */}
          <div className="p-3 bg-[#F7F7F5] border border-[#E6E6E4] rounded-2xl">
            <div className="flex items-center justify-between text-[11px] font-medium text-[#5F6368] mb-2 px-1">
              <span className="text-[#202124] font-semibold flex items-center gap-1">
                <Check className="w-3 h-3 text-[#202124]" /> Phase 1: DSA
              </span>
              <span className="text-[#B3582A] font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C4744B]" /> Phase 2: Systems (Current)
              </span>
              <span className="text-[#80868B]">Phase 3: Projects</span>
              <span className="text-[#80868B]">Phase 4: HR</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 h-1.5">
              <div className="bg-[#202124] rounded-full" />
              <div className="bg-[#C4744B] rounded-full" />
              <div className="bg-[#E6E6E4] rounded-full" />
              <div className="bg-[#E6E6E4] rounded-full" />
            </div>
          </div>

          {/* Phase Cards with Distinct States & Obvious Start Drill Primary Action */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Phase 1: Foundations */}
            <div className="p-4 rounded-2xl border border-[#E6E6E4] bg-[#FDFDFD] flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-[#5F6368] bg-[#F2F2F0] px-2 py-0.5 rounded-full border border-[#E6E6E4] flex items-center gap-1">
                    <Check className="w-2.5 h-2.5" /> Core Baseline
                  </span>
                  <span className="text-[10px] font-semibold text-[#80868B] uppercase tracking-wider">
                    Phase 1
                  </span>
                </div>
                <div className="font-semibold text-xs text-[#202124] leading-snug">
                  Core Technical Foundations
                </div>
                <p className="text-[11px] text-[#5F6368] mt-1 leading-relaxed">
                  Assess language internals, memory models, database normalization, and operating system principles.
                </p>
              </div>
              <Link
                href="/interview?phase=phase_1"
                className="self-start px-3 py-1.5 rounded-xl border border-[#E6E6E4] bg-[#F7F7F5] hover:bg-[#EFEFEA] text-[11px] font-semibold text-[#202124] transition inline-flex items-center gap-1"
              >
                <span>Start Phase 1</span>
                <ArrowRight className="w-3 h-3 text-[#80868B]" />
              </Link>
            </div>

            {/* Phase 2: Active / Current Focus (Primary Action) */}
            <div className="p-4 rounded-2xl border border-[#EED9CC] bg-[#FAF8F6]/60 shadow-xs flex flex-col justify-between space-y-3 relative ring-1 ring-[#C4744B]/30">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-[#B3582A] bg-[#FAF2ED] px-2 py-0.5 rounded-full border border-[#EED9CC]">
                    Current Focus
                  </span>
                  <span className="text-[10px] font-semibold text-[#C4744B] uppercase tracking-wider">
                    Phase 2
                  </span>
                </div>
                <div className="font-semibold text-xs text-[#202124] leading-snug">
                  Applied Problem-Solving & Coding
                </div>
                <p className="text-[11px] text-[#5F6368] mt-1 leading-relaxed">
                  Tackle algorithmic patterns, live debugging, practical constraints, and trade-off analysis under pressure.
                </p>
              </div>
              {/* PRIMARY ACTION BUTTON: Unmistakable Solid Graphite */}
              <Link
                href="/interview?phase=phase_2"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#202124] hover:bg-[#111113] text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-[0.99]"
              >
                <span>Start Phase 2 Drill</span>
                <ArrowRight className="w-3.5 h-3.5 text-white/80" />
              </Link>
            </div>

            {/* Phase 3: Project Depth */}
            <div className="p-4 rounded-2xl border border-[#E6E6E4] bg-white flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-medium text-[#80868B] bg-[#F7F7F5] px-2 py-0.5 rounded-full border border-[#E6E6E4]">
                    Step 3
                  </span>
                  <span className="text-[10px] font-semibold text-[#80868B] uppercase tracking-wider">
                    Phase 3
                  </span>
                </div>
                <div className="font-semibold text-xs text-[#202124] leading-snug">
                  Project Defence & Architecture
                </div>
                <p className="text-[11px] text-[#5F6368] mt-1 leading-relaxed">
                  Prepare for interviewers digging deep into your GitHub projects, architecture choices, and bugs you solved.
                </p>
              </div>
              <Link
                href="/interview?phase=phase_3"
                className="self-start px-3 py-1.5 rounded-xl border border-[#E6E6E4] hover:bg-[#F7F7F5] text-[11px] font-semibold text-[#5F6368] hover:text-[#202124] transition inline-flex items-center gap-1"
              >
                <span>Start Project Defence</span>
                <ArrowRight className="w-3 h-3 text-[#80868B]" />
              </Link>
            </div>

            {/* Phase 4: Realistic Mock */}
            <div className="p-4 rounded-2xl border border-[#E6E6E4] bg-white flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-medium text-[#80868B] bg-[#F7F7F5] px-2 py-0.5 rounded-full border border-[#E6E6E4]">
                    Step 4
                  </span>
                  <span className="text-[10px] font-semibold text-[#80868B] uppercase tracking-wider">
                    Phase 4
                  </span>
                </div>
                <div className="font-semibold text-xs text-[#202124] leading-snug">
                  Realistic Full Mock Interview
                </div>
                <p className="text-[11px] text-[#5F6368] mt-1 leading-relaxed">
                  Full coherent timed panel combining coding, system concepts, and behavioral questions with realistic scoring.
                </p>
              </div>
              <Link
                href="/interview?phase=phase_4"
                className="self-start px-3 py-1.5 rounded-xl border border-[#E6E6E4] hover:bg-[#F7F7F5] text-[11px] font-semibold text-[#5F6368] hover:text-[#202124] transition inline-flex items-center gap-1"
              >
                <span>Launch Full Panel</span>
                <ArrowRight className="w-3 h-3 text-[#80868B]" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Recent Practice Rounds: Distinct, Easy-to-Scan Log                        */}
      {/* ========================================================================= */}
      <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#F2F2F0]">
          <div>
            <h3 className="text-sm font-semibold text-[#202124] tracking-tight">Recent Practice Rounds</h3>
            <p className="text-[11px] text-[#5F6368]">Review your past answers, question scores, and feedback debriefs</p>
          </div>
          <Link
            href="/interview"
            className="text-xs font-semibold text-[#202124] hover:text-[#C4744B] transition inline-flex items-center gap-1"
          >
            <span>Start a round</span>
            <ArrowRight className="w-3 h-3 text-[#80868B]" />
          </Link>
        </div>

        {recentSessions.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-[#F7F7F5] text-[#5F6368] mx-auto flex items-center justify-center">
              <Mic className="w-5 h-5" />
            </div>
            <div className="text-xs font-semibold text-[#202124]">No practice rounds yet</div>
            <p className="text-[11px] text-[#5F6368] max-w-md mx-auto leading-relaxed">
              Take 5 minutes to run through a quick DSA or system design drill. Speaking your answers out loud is the fastest way to feel confident on interview day.
            </p>
            <Link
              href="/interview"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#202124] text-white text-xs font-semibold rounded-xl hover:bg-black transition min-h-[42px]"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Start your first round</span>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[#F2F2F0]">
            {recentSessions.map((s: any) => {
              const isInProgress = s.status === "in_progress";
              return (
                <div
                  key={s.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-[#FAF9F8] px-2 rounded-xl transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#F7F7F5] border border-[#E6E6E4] flex items-center justify-center font-bold text-[#202124] text-xs">
                      Q{s.current_turn_index || 0}
                    </div>
                    <div>
                      <div className="font-semibold text-[#202124] flex items-center gap-2">
                        <span>{s.target_role}</span>
                        <span className="text-slate-400">•</span>
                        <span className="capitalize">{s.interviewer_style?.replace("_", " ") || "General"}</span>
                        {isInProgress && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold">
                            In Progress
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#5F6368]">
                        <span className="capitalize">{s.mode}</span> mode • {new Date(s.created_at || Date.now()).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    {s.overall_score && (
                      <div className="px-2.5 py-1 rounded-xl bg-[#FAF2ED] border border-[#EED9CC] text-[#B3582A] font-bold text-xs flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 text-[#C4744B]" />
                        <span>{s.overall_score} / 5.0</span>
                      </div>
                    )}

                    {isInProgress ? (
                      <Link
                        href={`/interview?resume=${s.id}`}
                        className="px-3.5 py-1.5 rounded-xl bg-[#202124] hover:bg-black text-white font-semibold text-[11px] transition inline-flex items-center gap-1 shadow-xs"
                      >
                        <span>Resume round</span>
                        <ArrowRight className="w-3 h-3 text-white/80" />
                      </Link>
                    ) : (
                      <Link
                        href={`/interview/${s.id}/debrief`}
                        className="px-3 py-1.5 rounded-xl border border-[#E6E6E4] bg-[#F7F7F5] hover:bg-[#EFEFEA] text-[#202124] font-semibold text-[11px] transition inline-flex items-center gap-1 shadow-2xs"
                      >
                        <span>Review feedback</span>
                        <ArrowRight className="w-3 h-3 text-[#80868B]" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
