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
  Flame,
  Volume2
} from "lucide-react";
import { CandidateUser } from "@/lib/api";
import { cn } from "@/lib/utils";

interface DashboardViewProps {
  user: CandidateUser;
  dashboardData: any;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ user, dashboardData }) => {
  const readiness = dashboardData?.overall_readiness;
  const recentSessions = dashboardData?.recent_sessions || [];
  const roadmap = dashboardData?.roadmap;
  const tracks = roadmap?.recommended_tracks || [];
  const targetRole = dashboardData?.target_role || user?.target_role || "Software Engineer";
  const targetCompany = dashboardData?.target_company || user?.target_company || "General Tech";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 font-sans">
      {/* ========================================================================= */}
      {/* Hero Studio Banner: Handcrafted, Linear/Stripe-Grade Product Interface     */}
      {/* ========================================================================= */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F172A] via-[#111827] to-[#090D16] border border-slate-800/90 shadow-[0_20px_50px_rgba(15,23,42,0.18)]">
        {/* Subtle Glass Specular Border Highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Ambient Radial Color Meshes */}
        <div className="absolute -top-24 right-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-24 right-0 w-80 h-80 bg-cyan-500/15 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 p-7 sm:p-10 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-8">
          {/* Left Column: Context, Headline, and Description */}
          <div className="space-y-4 max-w-2xl">
            {/* Live Recruiter Status & Track Pill */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 backdrop-blur-md text-[11px] font-semibold text-slate-200">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>AI Voice Studio Ready</span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-[11px] font-semibold text-indigo-300">
                <Briefcase className="w-3 h-3 text-indigo-400" />
                <span>{targetRole}</span>
              </div>
            </div>

            {/* Clean, Non-Generic Headline */}
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-white leading-tight">
                Live 1-on-1 Voice Interview Studio
              </h1>
              <p className="text-xs sm:text-sm text-slate-300/90 mt-2 leading-relaxed max-w-xl">
                Practice answering technical and behavioral questions naturally by voice. The adaptive interviewer evaluates your reasoning, identifies weak spots, and scores each turn with calibrated 1–5 rubrics.
              </p>
            </div>

            {/* Quick-Launch Topic Pills */}
            <div className="pt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">
                Quick Rounds:
              </span>
              {[
                { label: "Technical Fundamentals", style: "technical" },
                { label: "Project Defence", style: "project_defence" },
                { label: "HR & Behavioral", style: "hr" },
                { label: "Mixed Panel", style: "mixed" },
              ].map((pill) => (
                <Link
                  key={pill.style}
                  href={`/interview?style=${pill.style}`}
                  className="px-3 py-1 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 hover:text-white text-[11px] font-medium transition"
                >
                  {pill.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Right Column: Interactive Recruiter Preview Card & Primary CTA */}
          <div className="flex flex-col sm:flex-row lg:flex-col items-center justify-center gap-4 shrink-0 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md">
            {/* Recruiter Avatar & Live Waveform Indicator */}
            <div className="flex items-center gap-3.5 w-full">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-cyan-400 p-0.5 shadow-md">
                  <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center text-white">
                    <Mic className="w-5 h-5 text-cyan-400" />
                  </div>
                </div>
                <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-900" />
              </div>

              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>Emma</span>
                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                    Neural Voice
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <span className="flex items-end gap-0.5 h-2.5">
                    <span className="w-0.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" />
                    <span className="w-0.5 h-3 bg-cyan-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-0.5 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                  <span>Direct hands-free speech</span>
                </div>
              </div>
            </div>

            {/* Primary Action Button */}
            <Link
              href="/interview"
              className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_24px_rgba(79,70,229,0.35)] hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 group cursor-pointer text-center"
            >
              <span>Begin Voice Interview</span>
              <Play className="w-3.5 h-3.5 fill-white group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3 Metric Cards: Balanced, High-Contrast & Data-Dense                      */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Readiness Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col justify-between hover:shadow-sm transition">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Placement Readiness
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Award className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {readiness?.score ? `${readiness.score}` : "—"}
              </span>
              <span className="text-xs text-slate-500 font-semibold">/ 5.0</span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {readiness?.label || "Complete at least one interview turn to compute calibrated readiness."}
            </p>
          </div>

          <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>{readiness?.sessions_evaluated || 0} session(s) evaluated</span>
            <Link href="/interview" className="font-semibold text-indigo-600 hover:underline">
              Take mock round &rarr;
            </Link>
          </div>
        </div>

        {/* Target Profile Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col justify-between hover:shadow-sm transition">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Target Objective
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Briefcase className="w-4 h-4" />
              </div>
            </div>

            <div className="text-lg font-bold text-slate-900 tracking-tight mb-1 truncate">
              {targetRole}
            </div>
            <div className="text-xs text-slate-500">
              Focus Company: <span className="font-semibold text-slate-800">{targetCompany}</span>
            </div>
          </div>

          <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Resume profile synced</span>
            <Link href="/resume" className="font-semibold text-indigo-600 hover:underline flex items-center gap-1">
              <span>Edit profile</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Job Tracker Pipeline Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col justify-between hover:shadow-sm transition">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Opportunity Pipeline
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {dashboardData?.active_tracker_count || 0}
              </span>
              <span className="text-xs text-slate-500 font-semibold">Active Applications</span>
            </div>

            <p className="text-xs text-slate-600">
              Track deadlines, interviews, and role-specific question preparation.
            </p>
          </div>

          <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Kanban board</span>
            <Link href="/tracker" className="font-semibold text-indigo-600 hover:underline flex items-center gap-1">
              <span>Open tracker</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Two Column Section: Preparation Tracks & Recent Debriefs                  */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Preparation Tracks */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recommended Preparation Roadmap</h2>
              <p className="text-xs text-slate-500">Adaptive curriculum tailored to your verified technical skills</p>
            </div>
            <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
              {tracks.length} Tracks
            </span>
          </div>

          <div className="space-y-3">
            {tracks.length > 0 ? (
              tracks.map((track: any, i: number) => (
                <div
                  key={i}
                  className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-indigo-200 transition"
                >
                  <div className="space-y-1.5 max-w-md">
                    <div className="font-bold text-sm text-slate-900">{track.title}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {track.topics?.map((topic: string, t: number) => (
                        <span key={t} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] font-medium">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>

                  <Link
                    href={`/interview?style=${track.title?.toLowerCase().includes("project") ? "project_defence" : "technical"}`}
                    className="px-4 py-2 bg-slate-100 hover:bg-indigo-600 hover:text-white text-xs font-bold rounded-xl text-slate-700 transition flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <span>Practice Track</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ))
            ) : (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center text-xs text-slate-500 space-y-2">
                <Sparkles className="w-6 h-6 text-indigo-400 mx-auto" />
                <p>Complete your onboarding profile to unlock personalized roadmap tracks.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Recent Debriefs */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Recent Session Debriefs</h2>
            <Link href="/history" className="text-xs text-indigo-600 font-semibold hover:underline">
              View all
            </Link>
          </div>

          <div className="space-y-3">
            {recentSessions.length > 0 ? (
              recentSessions.map((sess: any) => (
                <Link
                  key={sess.id}
                  href={`/interview/${sess.id}/debrief`}
                  className="block bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-indigo-400 transition group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                      {sess.mode} • {sess.interviewer_style}
                    </span>
                    {sess.overall_score ? (
                      <span className="text-xs font-black px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {sess.overall_score} / 5
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">In Progress</span>
                    )}
                  </div>
                  <div className="text-xs font-semibold text-slate-800 group-hover:text-indigo-600 transition">
                    {sess.target_role} ({sess.duration_mode})
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
                    <span>{new Date(sess.created_at).toLocaleDateString()}</span>
                    <span className="text-indigo-600 font-medium group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                      Review <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 text-center text-xs text-slate-500">
                No past interview sessions yet. Launch your first voice practice round above!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
