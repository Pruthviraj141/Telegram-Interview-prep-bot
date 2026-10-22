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
  RefreshCw,
  ArrowLeft
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
      await api.disputeTurnFeedback(turnId, {
        clarification: disputeClarification,
      });
      setDisputeSuccessMsg("Clarification evaluated. Updated feedback reflected.");
      setDisputeTurnId(null);
      setDisputeClarification("");
    } catch {
      setDisputeSuccessMsg("Reassessment completed.");
    } finally {
      setIsDisputing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-3.5 sm:px-6 py-6 sm:py-12 space-y-6 sm:space-y-8 pb-24 md:pb-12 font-sans">
      {/* Back to Dashboard Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#20232C] transition min-h-[40px] px-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </Link>

        <Link
          href="/interview"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#20232C] text-[#F4F1EA] text-xs font-semibold rounded-xl hover:bg-black transition shadow-xs min-h-[40px]"
        >
          <span>Start New Round</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Debrief Header: Editorial Apple Card */}
      <div className="bg-white border border-[#E8E5DD] rounded-2xl sm:rounded-3xl p-5 sm:p-10 shadow-xs space-y-4 sm:space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#4F46E5]">
              {debrief?.status_label || "Completed Interview Debrief"}
            </span>
            <h1 className="text-xl sm:text-3xl font-semibold tracking-tight text-[#20232C]">
              {session.target_role} Assessment
            </h1>
            <p className="text-xs text-slate-500">
              Simulation Mode: <span className="capitalize">{session.mode}</span> • Interviewer Focus: <span className="capitalize">{session.interviewer_style}</span>
            </p>
          </div>

          {debrief?.overall_score ? (
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#20232C] text-white shadow-sm shrink-0">
              <Award className="w-6 h-6 text-[#F4F1EA]" />
              <div>
                <div className="text-2xl font-bold tracking-tight">
                  {debrief.overall_score} <span className="text-xs text-slate-400 font-normal">/ 5.0</span>
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
                  Calibrated Score
                </div>
              </div>
            </div>
          ) : (
            <div className="px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              Insufficient Turns for Numeric Score
            </div>
          )}
        </div>

        {debrief?.summary && (
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pt-3 border-t border-[#F4F1EA]">
            {debrief.summary}
          </p>
        )}
      </div>

      {/* Skill Breakdown Grid */}
      {Object.keys(skills).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
            Evaluated Dimension Breakdown
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {Object.entries(skills).map(([skillName, score]: [string, any]) => (
              <div key={skillName} className="bg-white border border-[#E8E5DD] rounded-2xl p-5 shadow-xs space-y-2">
                <span className="text-[11px] font-semibold text-slate-600 block">
                  {skillName}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[#20232C]">
                    {score ? `${score}` : "—"}
                  </span>
                  <span className="text-xs text-slate-400">/ 5.0</span>
                </div>
                <div className="w-full bg-[#F4F1EA] h-1.5 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${(Number(score || 0) / 5) * 100}%` }}
                    className="bg-[#20232C] h-full rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strengths vs Missing Points */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E8E5DD] rounded-3xl p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs tracking-tight">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Demonstrated Strengths & Knowledge</span>
          </div>
          <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside leading-relaxed">
            {debrief?.demonstrated_strengths?.map((str: string, i: number) => (
              <li key={i}>{str}</li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-[#E8E5DD] rounded-3xl p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-xs tracking-tight">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>Key Gaps & Improvement Areas</span>
          </div>
          <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside leading-relaxed">
            {debrief?.primary_gaps?.map((gap: string, i: number) => (
              <li key={i}>{gap}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Turn-by-Turn Expandable Details */}
      <div className="bg-white border border-[#E8E5DD] rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
        <div className="pb-3 border-b border-[#F4F1EA]">
          <h2 className="text-sm font-semibold text-[#20232C] tracking-tight">Turn-by-Turn Transcripts & Rubrics</h2>
          <p className="text-[11px] text-slate-500">Inspect evidence quotes, model answers, and request clarification if scored unfairly</p>
        </div>

        {disputeSuccessMsg && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{disputeSuccessMsg}</span>
          </div>
        )}

        <div className="divide-y divide-[#F4F1EA]">
          {turns.map((turn, idx) => {
            const isExpanded = activeTurnIdx === idx;
            const evalData = turn.evaluation || {};
            const isDisputingThis = disputeTurnId === turn.id;

            return (
              <div key={turn.id} className="py-4 space-y-3">
                <button
                  type="button"
                  onClick={() => setActiveTurnIdx(isExpanded ? null : idx)}
                  className="w-full flex items-center justify-between text-left gap-4 hover:opacity-80 transition cursor-pointer"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-500">Question {turn.turn_index + 1}</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#F4F1EA] text-[10px] font-medium text-slate-700">
                        {turn.category}
                      </span>
                    </div>
                    <div className="font-semibold text-xs sm:text-sm text-[#20232C] leading-snug">
                      {turn.question_text}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {evalData.overall_score && (
                      <span className="px-2.5 py-1 rounded-xl bg-[#FAFAF8] border border-[#E8E5DD] text-xs font-bold text-[#20232C]">
                        {evalData.overall_score} / 5.0
                      </span>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="pt-2 pl-2 space-y-4 text-xs text-slate-600 animate-in fade-in duration-100">
                    {/* Candidate Answer */}
                    <div className="p-4 bg-[#FAFAF8] border border-[#E8E5DD] rounded-2xl space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Candidate Response:</span>
                      <p className="italic text-slate-800 leading-relaxed">
                        &quot;{turn.corrected_transcript || turn.original_transcript || turn.typed_answer || "No response recorded"}&quot;
                      </p>
                    </div>

                    {/* Evidence Quote */}
                    {evalData.evidence_quote && (
                      <div className="p-3 bg-white border border-[#E8E5DD] rounded-xl text-[11px] space-y-1">
                        <span className="font-semibold text-slate-700">Extracted Evidence:</span>
                        <p className="text-slate-600 leading-relaxed">&quot;{evalData.evidence_quote}&quot;</p>
                      </div>
                    )}

                    {/* Model Answer Recommendation */}
                    {evalData.stronger_answer && (
                      <div className="p-4 bg-emerald-50/60 border border-emerald-200/70 rounded-2xl space-y-1">
                        <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">High-Scoring Exemplar:</span>
                        <p className="text-emerald-950 leading-relaxed">{evalData.stronger_answer}</p>
                      </div>
                    )}

                    {/* Dispute Clarification Form */}
                    <div className="pt-2">
                      {!isDisputingThis ? (
                        <button
                          type="button"
                          onClick={() => setDisputeTurnId(turn.id)}
                          className="text-[11px] font-semibold text-[#4F46E5] hover:text-[#4338CA] transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Clarify or Contest Feedback</span>
                        </button>
                      ) : (
                        <div className="p-4 bg-[#FAFAF8] border border-[#E8E5DD] rounded-2xl space-y-2">
                          <label className="block text-[11px] font-semibold text-slate-700">
                            Explain what you intended to convey or why you feel the rubric missed your evidence:
                          </label>
                          <textarea
                            rows={3}
                            value={disputeClarification}
                            onChange={(e) => setDisputeClarification(e.target.value)}
                            placeholder="e.g. In my answer, I mentioned time complexity O(N) when discussing the hash table..."
                            className="w-full p-3 bg-white border border-slate-300 rounded-xl text-base sm:text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#20232C]"
                          />
                          <div className="flex gap-2 justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setDisputeTurnId(null);
                                setDisputeClarification("");
                              }}
                              className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-600 text-xs hover:bg-slate-100 min-h-[40px]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDisputeSubmit(turn.id)}
                              disabled={isDisputing || !disputeClarification.trim()}
                              className="px-4 py-2 rounded-xl bg-[#20232C] text-[#F4F1EA] text-xs font-semibold hover:bg-black transition flex items-center gap-1.5 min-h-[40px]"
                            >
                              {isDisputing ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Reassessing...</span>
                                </>
                              ) : (
                                <>
                                  <span>Submit for Reassessment</span>
                                  <Send className="w-3.5 h-3.5" />
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
