"use client";

import React from "react";
import Link from "next/link";
import {
  Mic,
  Play,
  Sparkles,
  TrendingUp,
  Briefcase,
  Award,
  ArrowUpRight,
  CheckCircle2,
  Building2,
  ChevronRight,
  Radio,
  Clock,
  ArrowRight,
  Calendar,
  Volume2
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
  const roadmap = dashboardData?.roadmap;
  const tracks = roadmap?.recommended_tracks || [];
  const targetRole = dashboardData?.target_role || user?.target_role || "Software Engineer";
  const targetCompany = dashboardData?.target_company || user?.target_company || "General Tech";

  return (
    <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-6 sm:py-12 space-y-6 sm:space-y-10 pb-24 md:pb-12 font-sans">
      {/* Hero Studio Banner */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-[#18181B] border border-[#2E2E35] shadow-xs">
        <div className="relative z-10 p-5 sm:p-9 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6 sm:gap-8">
          {/* Left Column */}
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-medium text-slate-300">
              <Briefcase className="w-3 h-3 text-slate-400" />
              <span>{targetRole}</span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white leading-tight">
                AI Voice Interview Practice
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                Simulate technical and behavioral hiring rounds with live audio feedback.
              </p>
            </div>

            {/* Quick-Launch Topic Tracks */}
            <div className="pt-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-[11px] font-medium text-slate-500 mr-1">
                Quick start:
              </span>
              {[
                { label: "DSA & Coding", style: "dsa" },
                { label: "System Design", style: "system_design" },
                { label: "Core CS", style: "technical" },
                { label: "Project Defence", style: "project_defence" },
                { label: "Behavioral", style: "hr" },
              ].map((pill) => (
                <Link
                  key={pill.style}
                  href={`/interview?style=${pill.style}`}
                  className="px-2.5 sm:px-3 py-1 rounded-xl bg-[#242429] hover:bg-[#2C2C33] border border-[#33333C] text-slate-300 hover:text-white text-[11px] font-medium transition cursor-pointer"
                >
                  {pill.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Right Column: Launch Action */}
          <div className="shrink-0 flex flex-col items-stretch lg:items-end justify-center">
            <Link
              href="/interview"
              className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl bg-white hover:bg-slate-100 text-black font-semibold text-xs sm:text-sm transition shadow-sm flex items-center justify-center gap-2.5 cursor-pointer min-h-[48px]"
            >
              <Mic className="w-4 h-4 text-black shrink-0" />
              <span>Start Interview</span>
              <ArrowRight className="w-4 h-4 text-slate-500" />
            </Link>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2-Column Main Workspace: Readiness & Roadmap Grid                         */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Placement Readiness Gauge & Domains (1 Col) */}
        <div className="bg-white border border-[#E8E5DD] rounded-3xl p-6 sm:p-7 shadow-xs space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-[#F4F1EA]">
            <div>
              <h3 className="text-sm font-semibold text-[#20232C] tracking-tight">Interview Readiness</h3>
              <p className="text-[11px] text-slate-500">Calibrated from recent turns</p>
            </div>
            <div className="w-8 h-8 rounded-xl bg-[#F4F1EA] border border-[#E8E5DD] flex items-center justify-center text-[#20232C]">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-4xl sm:text-5xl font-semibold tracking-tight text-[#20232C]">
              {readinessPercent}%
            </span>
            <span className="text-xs font-medium text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/60">
              {readinessLabel || `Target: ${targetCompany}`}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-[#F4F1EA] h-2 rounded-full overflow-hidden">
            <div
              style={{ width: `${Math.min(readinessPercent, 100)}%` }}
              className="bg-[#20232C] h-full rounded-full transition-all duration-500"
            />
          </div>

          {/* Category Readiness Breakdown */}
          <div className="space-y-3 pt-2">
            {[
              { name: "Algorithms & DSA", score: 82 },
              { name: "System Architecture", score: 75 },
              { name: "Project Defence", score: 85 },
              { name: "Behavioral Communication", score: 70 },
            ].map((cat) => (
              <div key={cat.name} className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>{cat.name}</span>
                  <span className="font-semibold text-[#20232C]">{cat.score}%</span>
                </div>
                <div className="w-full bg-[#F4F1EA] h-1.5 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${cat.score}%` }}
                    className="bg-slate-400 h-full rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>

          <Link
            href="/resume"
            className="block w-full py-2.5 rounded-xl border border-[#E8E5DD] hover:bg-[#F4F1EA] text-center text-xs font-semibold text-[#20232C] transition"
          >
            Review Resume Profile
          </Link>
        </div>

        {/* Right: Curated Learning Roadmap & Milestones (2 Cols) */}
        <div className="lg:col-span-2 bg-white border border-[#E8E5DD] rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-xs space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-[#F4F1EA]">
            <div>
              <h3 className="text-sm font-semibold text-[#20232C] tracking-tight">Practice Roadmap</h3>
              <p className="text-[11px] text-slate-500">Curated tracks for {targetRole}</p>
            </div>
            <Link
              href="/company-prep"
              className="text-xs font-medium text-[#4F46E5] hover:text-[#4338CA] transition inline-flex items-center gap-1"
            >
              <span>Company Packs</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {[
              {
                title: "DSA & Algorithmic Patterns",
                desc: "Two pointers, cycle detection, trees, graphs, and DP memoization.",
                badge: "Phase 1",
                style: "dsa",
              },
              {
                title: "System Architecture",
                desc: "Distributed caching, database indexing, and latency trade-offs.",
                badge: "Phase 2",
                style: "system_design",
              },
              {
                title: "Project Defence",
                desc: "Architectural decisions, failure modes, and technical claims.",
                badge: "Phase 3",
                style: "project_defence",
              },
              {
                title: "Behavioral & Leadership",
                desc: "STAR framework, conflict resolution, and situational judgment.",
                badge: "Phase 4",
                style: "hr",
              },
            ].map((track) => (
              <div
                key={track.title}
                className="p-4 rounded-2xl border border-[#E8E5DD] bg-[#FAFAF8] flex flex-col justify-between space-y-3 hover:border-slate-300 transition"
              >
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    {track.badge}
                  </span>
                  <div className="font-semibold text-xs text-[#20232C] leading-snug">
                    {track.title}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    {track.desc}
                  </p>
                </div>
                <Link
                  href={`/interview?style=${track.style}`}
                  className="self-start text-[11px] font-semibold text-[#4F46E5] hover:text-[#4338CA] transition inline-flex items-center gap-1"
                >
                  <span>Start Drill</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Recent Interview History Table / Feed                                     */}
      {/* ========================================================================= */}
      <div className="bg-white border border-[#E8E5DD] rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#F4F1EA]">
          <div>
            <h3 className="text-sm font-semibold text-[#20232C] tracking-tight">Recent Rounds</h3>
            <p className="text-[11px] text-slate-500">Transcripts, scores, and coaching feedback</p>
          </div>
          <Link
            href="/interview"
            className="text-xs font-medium text-[#4F46E5] hover:text-[#4338CA] transition inline-flex items-center gap-1"
          >
            <span>Launch New Round</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {recentSessions.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-[#F4F1EA] text-slate-500 mx-auto flex items-center justify-center">
              <Mic className="w-5 h-5" />
            </div>
            <div className="text-xs font-semibold text-[#20232C]">No interview rounds recorded yet</div>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              Start your first voice drill to generate turn-by-turn calibrated rubrics and debrief reports.
            </p>
            <Link
              href="/interview"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#20232C] text-white text-xs font-semibold rounded-xl hover:bg-black transition"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Begin First Session</span>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[#F4F1EA]">
            {recentSessions.map((s: any) => (
              <div
                key={s.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#F4F1EA] border border-[#E8E5DD] flex items-center justify-center font-bold text-[#20232C]">
                    Q{s.current_turn_index || 0}
                  </div>
                  <div>
                    <div className="font-semibold text-[#20232C]">
                      {s.target_role} ({s.interviewer_style?.toUpperCase() || "MIXED"})
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Mode: <span className="capitalize">{s.mode}</span> • Status: <span className="capitalize">{s.status}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {s.overall_score && (
                    <div className="text-right">
                      <div className="font-semibold text-[#20232C]">{s.overall_score} / 5.0</div>
                      <div className="text-[10px] text-slate-400">Calibrated Score</div>
                    </div>
                  )}

                  <Link
                    href={`/interview/${s.id}/debrief`}
                    className="px-3 py-1.5 rounded-xl border border-[#E8E5DD] hover:bg-[#F4F1EA] text-[#20232C] font-semibold text-[11px] transition inline-flex items-center gap-1"
                  >
                    <span>View Debrief</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
