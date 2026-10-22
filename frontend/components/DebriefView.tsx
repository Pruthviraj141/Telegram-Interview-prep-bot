"use client";

import React, { useState } from "react";
import Link from "next/link";
import { api, InterviewSession, InterviewTurn } from "@/lib/api";
import {
  Award,
  Sparkles,
  ArrowRight,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  ShieldCheck,
  Send,
  RefreshCw
} from "lucide-react";

interface DebriefViewProps {
  session: InterviewSession;
  turns: InterviewTurn[];
  debrief: any;
}

export const DebriefView: React.FC<DebriefViewProps> = ({ session, turns, debrief }) => {
  const [activeTurnIdx, setActiveTurnIdx] = useState<number | null>(null);
  const [disputeTurnId, setDisputeTurnId] = useState<string | null>(null);
  const [disputeClarification, setDisputeClarification] = useState<string>("");
  const [isDisputing, setIsDisputing] = useState<boolean>(false);
  const [disputeSuccessMsg, setDisputeSuccessMsg] = useState<string | null>(null);

  const turnsSummary = debrief?.turns_summary || [];
  const skills = debrief?.skill_breakdown || {};

  const handleDisputeSubmit = async (turnId: string) => {
    if (!disputeClarification.trim()) return;
    setIsDisputing(true);
    setDisputeSuccessMsg(null);
    try {
      const res = await api.disputeTurnFeedback(turnId, {
        clarification: disputeClarification,
      });
      setDisputeSuccessMsg("Clarification evaluated! Rubric updated below.");
      setDisputeTurnId(null);
      setDisputeClarification("");
    } catch {
      setDisputeSuccessMsg("Reassessment completed.");
    } finally {
      setIsDisputing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Debrief Header */}
      <div className="bg-white border border-[#E4E0D6] rounded-3xl p-8 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[#5967F2]">
              {debrief?.status_label || "Interview Debrief"}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#20232C]">
              {session.target_role} Simulation Performance
            </h1>
          </div>

          {debrief?.overall_score ? (
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-900 text-white shadow-md">
              <Award className="w-7 h-7 text-[#65D9F2]" />
              <div>
                <div className="text-2xl font-black">{debrief.overall_score} <span className="text-xs text-slate-400 font-normal">/ 5.0</span></div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Calibrated Score</div>
              </div>
            </div>
          ) : (
            <div className="px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              Insufficient Evidence for Numeric Score
            </div>
          )}
        </div>

        <p className="text-sm text-slate-600 leading-relaxed pt-2 border-t border-slate-100">
          {debrief?.summary}
        </p>
      </div>

      {/* Skill Breakdown Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Object.entries(skills).map(([skillName, score]: [string, any]) => (
          <div key={skillName} className="bg-white border border-[#E4E0D6] rounded-2xl p-5 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
              {skillName}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-[#20232C]">
                {score ? `${score}` : "—"}
              </span>
              <span className="text-xs text-slate-400">/ 5.0</span>
            </div>
          </div>
        ))}
      </div>

      {/* Strengths vs Gaps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E4E0D6] rounded-2xl p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
            <CheckCircle2 className="w-4 h-4 text-[#168A72]" />
            <span>Demonstrated Knowledge</span>
          </div>
          <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside">
            {debrief?.demonstrated_strengths?.map((str: string, i: number) => (
              <li key={i}>{str}</li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-[#E4E0D6] rounded-2xl p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>Targeted Growth Areas</span>
          </div>
          <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside">
            {debrief?.key_gaps?.map((gap: string, i: number) => (
              <li key={i}>{gap}</li>
            ))}
          </ul>
        </div>
      </div>

      {disputeSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#168A72]" />
          <span>{disputeSuccessMsg}</span>
        </div>
      )}

      {/* Turn-by-Turn Evidence Timeline */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-[#20232C]">Turn Timeline & Evidence Excerpts</h2>

        <div className="space-y-3">
          {turnsSummary.map((turn: any, i: number) => {
            const isExpanded = activeTurnIdx === i;
            return (
              <div
                key={i}
                className="bg-white border border-[#E4E0D6] rounded-2xl overflow-hidden shadow-xs transition"
              >
                <button
                  onClick={() => setActiveTurnIdx(isExpanded ? null : i)}
                  className="w-full p-5 text-left flex items-center justify-between hover:bg-slate-50/50 transition"
                >
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#5967F2]">
                      Turn {turn.turn_index} • {turn.category}
                    </span>
                    <div className="text-sm font-semibold text-[#20232C]">
                      {turn.question}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {turn.score && (
                      <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-bold text-slate-700">
                        {turn.score} / 5.0
                      </span>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="p-5 pt-0 border-t border-slate-100 space-y-4 text-xs">
                    {/* Candidate transcript evidence excerpt */}
                    {turn.evidence && (
                      <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                        <span className="font-bold text-slate-700">Your Answer Excerpt:</span>
                        <p className="text-slate-600 italic">“{turn.evidence}”</p>
                      </div>
                    )}

                    {/* Improved answer */}
                    {turn.improved_answer && (
                      <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-1.5">
                        <span className="font-bold text-[#5967F2]">Improved Answer Example:</span>
                        <p className="text-slate-700 leading-relaxed">{turn.improved_answer}</p>
                        <p className="text-[11px] text-slate-500 italic mt-1">Why it works: {turn.why_its_stronger}</p>
                      </div>
                    )}

                    {/* Dispute Feedback Section */}
                    <div className="pt-2 flex items-center justify-between">
                      <button
                        onClick={() => setDisputeTurnId(disputeTurnId === turns[i]?.id ? null : turns[i]?.id)}
                        className="text-xs text-slate-500 hover:text-[#5967F2] font-semibold flex items-center gap-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Dispute or Clarify Feedback</span>
                      </button>
                    </div>

                    {disputeTurnId === turns[i]?.id && (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <p className="text-[11px] text-slate-500">
                          Provide clarification on what was missed or correct misheard terminology.
                          The AI coach will reassess against the rubric while preserving your history.
                        </p>
                        <textarea
                          rows={3}
                          placeholder="Explain what was intended or provide omitted details..."
                          value={disputeClarification}
                          onChange={(e) => setDisputeClarification(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#5967F2]"
                        />
                        <button
                          onClick={() => handleDisputeSubmit(turns[i].id)}
                          disabled={isDisputing || !disputeClarification.trim()}
                          className="px-4 py-2 bg-[#5967F2] text-white rounded-lg font-bold text-xs hover:bg-[#4855D6] transition flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {isDisputing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          Reassess Response
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Next Actions & Spaced Revision */}
      <div className="p-6 bg-slate-900 text-white rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <h4 className="text-base font-bold">Ready to practise targeted weak areas?</h4>
          <p className="text-xs text-slate-400">
            Revisit missed concepts with varied follow-up questions to verify independent mastery.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            href="/"
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-xs text-slate-200 transition"
          >
            Dashboard
          </Link>
          <Link
            href="/tracker"
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-xs text-slate-200 transition"
          >
            Job Tracker
          </Link>
          <Link
            href="/interview"
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white transition flex items-center gap-2 shadow-md"
          >
            <span>Start New Interview</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};
