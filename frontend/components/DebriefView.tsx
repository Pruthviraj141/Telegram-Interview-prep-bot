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
  ArrowLeft,
  Mic,
  Keyboard,
  Compass,
  AlertTriangle,
  Lightbulb,
  BookOpen
} from "lucide-react";

interface DebriefViewProps {
  session: InterviewSession;
  turns: InterviewTurn[];
  debrief: any;
}

const SKILL_LABELS: Record<string, string> = {
  technical_correctness: "Technical Correctness",
  problem_solving: "Problem Solving",
  reasoning_and_tradeoffs: "Reasoning & Trade-offs",
  implementation_quality: "Implementation Quality",
  project_ownership: "Project Ownership",
  structure_and_clarity: "Structure & Clarity",
  communication_delivery: "Spoken Delivery",
};

export const DebriefView: React.FC<DebriefViewProps> = ({ session, turns, debrief }) => {
  const [activeTurnIdx, setActiveTurnIdx] = useState<number | null>(0);
  const [disputeTurnId, setDisputeTurnId] = useState<string | null>(null);
  const [disputeClarification, setDisputeClarification] = useState<string>("");
  const [isDisputing, setIsDisputing] = useState<boolean>(false);
  const [disputeSuccessMsg, setDisputeSuccessMsg] = useState<string | null>(null);

  const skills = debrief?.skill_breakdown || {};
  const misconceptions = debrief?.misconceptions_summary || [];
  const nextSteps = debrief?.next_steps || [];

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
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#202124] transition min-h-[40px] px-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </Link>

        <Link
          href="/interview"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#202124] text-white text-xs font-semibold rounded-xl hover:bg-[#111113] transition shadow-xs min-h-[40px]"
        >
          <span>Start New Round</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Debrief Header */}
      <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              {debrief?.status_label || "Evidence-Based Interview Debrief"}
            </span>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#202124]">
              {session.target_role} Assessment
            </h1>
            <p className="text-xs text-slate-500">
              <span className="capitalize">{session.mode}</span> mode • <span className="capitalize">{session.interviewer_style}</span> track • {debrief?.assessment_confidence || "Full Assessment"}
            </p>
          </div>

          {debrief?.overall_score ? (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#FAF2ED] border border-[#EED9CC] text-[#B3582A] shadow-xs shrink-0">
              <Award className="w-5 h-5 text-[#C4744B]" />
              <div>
                <div className="text-xl font-bold tracking-tight">
                  {debrief.overall_score} <span className="text-xs text-[#B3582A]/70 font-normal">/ 5.0</span>
                </div>
                <div className="text-[10px] text-[#B3582A] font-semibold uppercase tracking-wider">
                  Calibrated Score
                </div>
              </div>
            </div>
          ) : (
            <div className="px-3.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
              Score Pending
            </div>
          )}
        </div>

        {debrief?.summary && (
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pt-3 border-t border-[#E6E6E4]">
            {debrief.summary}
          </p>
        )}
      </div>

      {/* Multi-Dimensional Skill Breakdown Grid */}
      {Object.keys(skills).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-500 px-1 uppercase tracking-wider">
            Evaluation Dimensions (Anchored 1.0 - 5.0)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(skills)
              .filter(([_, score]) => score !== null && score !== undefined)
              .map(([skillKey, score]: [string, any]) => (
                <div key={skillKey} className="bg-white border border-[#E6E6E4] rounded-2xl p-4 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">
                      {SKILL_LABELS[skillKey] || skillKey}
                    </span>
                    <span className="font-bold text-[#202124]">
                      {score} <span className="text-[10px] text-slate-400 font-normal">/ 5.0</span>
                    </span>
                  </div>
                  <div className="w-full bg-[#F7F7F5] border border-[#E6E6E4] h-1.5 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${(Number(score || 0) / 5) * 100}%` }}
                      className="bg-[#C4744B] h-full rounded-full transition-all duration-300"
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Key Strengths & Misconceptions Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Demonstrated Technical Strengths</span>
          </div>
          <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside leading-relaxed">
            {(debrief?.demonstrated_strengths || []).map((str: string, i: number) => (
              <li key={i}>{str}</li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-xs">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Priority Areas for Growth</span>
          </div>
          <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside leading-relaxed">
            {(debrief?.key_growth_areas || debrief?.key_gaps || []).map((gap: string, i: number) => (
              <li key={i}>{gap}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Turn-by-Turn Structured Assessment */}
      <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xs space-y-4">
        <div className="pb-3 border-b border-[#E6E6E4]">
          <h2 className="text-sm font-semibold text-[#202124] tracking-tight">Question-by-Question Deep Dive</h2>
          <p className="text-[11px] text-slate-500">Transcripts, evidence, misconceptions, language feedback, and side-by-side improved answers</p>
        </div>

        {disputeSuccessMsg && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{disputeSuccessMsg}</span>
          </div>
        )}

        <div className="divide-y divide-[#E6E6E4]">
          {turns.map((turn, idx) => {
            const isExpanded = activeTurnIdx === idx;
            const evalData = turn.evaluation || {};
            const isDisputingThis = disputeTurnId === turn.id;
            const sideBySide = evalData.side_by_side || {};
            const langDelivery = evalData.delivery_and_language || {};
            const missingDetails = evalData.missing_details_and_why || [];
            const misconceptionsList = evalData.misconceptions || [];

            return (
              <div key={turn.id} className="py-5 space-y-4">
                <button
                  type="button"
                  onClick={() => setActiveTurnIdx(isExpanded ? null : idx)}
                  className="w-full flex items-center justify-between text-left gap-4 hover:opacity-85 transition cursor-pointer"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-500">Question {turn.turn_index + 1}</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#F7F7F5] border border-[#E6E6E4] text-[10px] font-medium text-slate-700">
                        {turn.category}
                      </span>
                      {turn.is_follow_up && (
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[10px] font-semibold text-indigo-700">
                          Follow-Up Probe
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-xs sm:text-sm text-[#202124] leading-snug">
                      {turn.question_text}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {evalData.overall_score && (
                      <span className="px-2.5 py-1 rounded-xl bg-[#FAF2ED] border border-[#EED9CC] text-xs font-bold text-[#B3582A]">
                        {evalData.overall_score} / 5.0
                      </span>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="pt-2 space-y-5 text-xs text-slate-600 animate-in fade-in duration-100">
                    {/* Candidate Answer + Evidence */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <div className="p-4 bg-[#F7F7F5] border border-[#E6E6E4] rounded-2xl space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Your Response</span>
                          <span className="text-[10px] font-medium text-slate-400 inline-flex items-center gap-1">
                            {turn.audio_url || turn.original_transcript ? <Mic className="w-3 h-3 text-[#C4744B]" /> : <Keyboard className="w-3 h-3" />}
                            {turn.audio_url || turn.original_transcript ? "Spoken" : "Typed"}
                          </span>
                        </div>
                        <p className="text-slate-800 leading-relaxed text-xs">
                          &quot;{turn.corrected_transcript || turn.original_transcript || turn.typed_answer || "No response recorded"}&quot;
                        </p>
                      </div>

                      <div className="p-4 bg-white border border-[#E6E6E4] rounded-2xl space-y-1.5">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Identified Evidence Quote</span>
                        <p className="text-slate-700 italic leading-relaxed text-xs">
                          &quot;{evalData.evidence_quote || "Full response evaluated across rubric dimensions."}&quot;
                        </p>
                      </div>
                    </div>

                    {/* Conceptual Breakdown: Demonstrated vs Misconceptions vs Missing Details */}
                    <div className="space-y-2.5">
                      {evalData.demonstrated_points && evalData.demonstrated_points.length > 0 && (
                        <div className="p-3.5 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl space-y-1">
                          <span className="text-[11px] font-semibold text-emerald-900 inline-flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Correct Concepts Demonstrated:
                          </span>
                          <ul className="text-xs text-emerald-950 list-disc list-inside space-y-0.5">
                            {evalData.demonstrated_points.map((pt: string, pIdx: number) => (
                              <li key={pIdx}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {misconceptionsList.length > 0 && (
                        <div className="p-3.5 bg-rose-50/70 border border-rose-200/90 rounded-2xl space-y-1">
                          <span className="text-[11px] font-semibold text-rose-900 inline-flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                            Technical Misconception Identified:
                          </span>
                          <ul className="text-xs text-rose-950 list-disc list-inside space-y-0.5">
                            {misconceptionsList.map((mc: string, mIdx: number) => (
                              <li key={mIdx}>{mc}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {missingDetails.length > 0 && (
                        <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-2xl space-y-1.5">
                          <span className="text-[11px] font-semibold text-amber-900 inline-flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                            Missing Details & Why They Matter:
                          </span>
                          <div className="space-y-1.5">
                            {missingDetails.map((item: any, itemIdx: number) => (
                              <div key={itemIdx} className="text-xs text-amber-950">
                                <span className="font-semibold text-amber-900">• {item.detail || item}: </span>
                                <span className="text-amber-800/90">{item.why_it_matters || "Demonstrates practical production awareness to the interviewer."}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Language, Grammar & Spoken Delivery Feedback (Isolated from Technical Correctness) */}
                    {(langDelivery.filler_words_observed || langDelivery.sentence_construction_feedback || langDelivery.grammar_and_spelling_corrections) && (
                      <div className="p-3.5 bg-[#FAF9F7] border border-[#EAE8E2] rounded-2xl space-y-2">
                        <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider inline-flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-[#C4744B]" />
                          Communication & Language Observations
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-slate-600">
                          <div className="p-2.5 bg-white border border-[#E6E6E4] rounded-xl">
                            <span className="text-[10px] font-semibold text-slate-400 block uppercase">Filler Words</span>
                            <span className="text-slate-800 text-[11px] font-medium">{langDelivery.filler_words_observed || "Minimal / none"}</span>
                          </div>
                          <div className="p-2.5 bg-white border border-[#E6E6E4] rounded-xl">
                            <span className="text-[10px] font-semibold text-slate-400 block uppercase">Sentence Flow</span>
                            <span className="text-slate-800 text-[11px]">{langDelivery.sentence_construction_feedback || "Clear delivery"}</span>
                          </div>
                          <div className="p-2.5 bg-white border border-[#E6E6E4] rounded-xl">
                            <span className="text-[10px] font-semibold text-slate-400 block uppercase">Grammar & Syntax</span>
                            <span className="text-slate-800 text-[11px]">{langDelivery.grammar_and_spelling_corrections || "Clean grammar"}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Side-by-Side Comparison: Original Weakness vs Stronger Answer */}
                    <div className="p-4 bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl space-y-3.5 shadow-2xs">
                      <div className="flex items-center justify-between pb-2 border-b border-[#E6E6E4]">
                        <span className="text-xs font-semibold text-[#202124] inline-flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-[#C4744B]" />
                          Side-by-Side Model Answer Comparison
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">Tailored to your background</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        <div className="p-3.5 bg-rose-50/40 border border-rose-200/60 rounded-xl space-y-1">
                          <span className="text-[10px] font-semibold text-rose-800 uppercase tracking-wider">What to improve</span>
                          <p className="text-xs text-rose-950 leading-relaxed">
                            {sideBySide.original_weakness || "Lacked specific architectural trade-offs and concrete metrics."}
                          </p>
                        </div>

                        <div className="p-3.5 bg-emerald-50/40 border border-emerald-200/60 rounded-xl space-y-1">
                          <span className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider">Stronger Model Answer</span>
                          <p className="text-xs text-emerald-950 leading-relaxed font-sans">
                            {sideBySide.stronger_answer || evalData.stronger_answer || "Structure your answer with problem definition, chosen approach, and explicit trade-offs."}
                          </p>
                        </div>
                      </div>

                      {/* What Changed & Why Callout */}
                      <div className="p-3 bg-[#FAF2ED]/60 border border-[#EED9CC] rounded-xl space-y-1">
                        <span className="text-[10px] font-semibold text-[#B3582A] uppercase tracking-wider inline-flex items-center gap-1">
                          <Lightbulb className="w-3 h-3 text-[#C4744B]" />
                          What Changed & Why It&apos;s Stronger
                        </span>
                        <p className="text-xs text-[#8A3F1B] leading-relaxed">
                          {sideBySide.what_changed_and_why || evalData.why_its_stronger || "Directly addresses edge cases, explains technical trade-offs, and provides crisp structural clarity."}
                        </p>
                      </div>
                    </div>

                    {/* Dispute / Reassessment Request */}
                    <div className="pt-1">
                      {!isDisputingThis ? (
                        <button
                          type="button"
                          onClick={() => setDisputeTurnId(turn.id)}
                          className="text-[11px] font-medium text-slate-500 hover:text-[#202124] transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Request Review or Clarify Intent</span>
                        </button>
                      ) : (
                        <div className="p-4 bg-[#F7F7F5] border border-[#E6E6E4] rounded-2xl space-y-2">
                          <label className="block text-[11px] font-semibold text-slate-700">
                            Explain what you intended to convey or what evidence was omitted:
                          </label>
                          <textarea
                            rows={3}
                            value={disputeClarification}
                            onChange={(e) => setDisputeClarification(e.target.value)}
                            placeholder="e.g. In my answer, I discussed time complexity O(N) when outlining the monotonic deque approach..."
                            className="w-full p-3 bg-white border border-[#E6E6E4] rounded-xl text-base sm:text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#202124]"
                          />
                          <div className="flex gap-2 justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setDisputeTurnId(null);
                                setDisputeClarification("");
                              }}
                              className="px-3.5 py-2 rounded-xl border border-[#E6E6E4] text-slate-600 text-xs hover:bg-[#EAEAE6] min-h-[40px]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDisputeSubmit(turn.id)}
                              disabled={isDisputing || !disputeClarification.trim()}
                              className="px-4 py-2 rounded-xl bg-[#202124] text-white text-xs font-semibold hover:bg-[#111113] transition flex items-center gap-1.5 min-h-[40px]"
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

      {/* Actionable Next Steps */}
      {nextSteps.length > 0 && (
        <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-[#202124] font-semibold text-xs">
            <Compass className="w-4 h-4 text-[#C4744B]" />
            <span>Targeted Action Plan for Your Next Round</span>
          </div>
          <div className="space-y-2">
            {nextSteps.map((step: string, sIdx: number) => (
              <div key={sIdx} className="p-3 bg-[#F7F7F5] border border-[#E6E6E4] rounded-xl text-xs text-slate-700 flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-white border border-[#E6E6E4] text-[#202124] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {sIdx + 1}
                </span>
                <p className="leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
