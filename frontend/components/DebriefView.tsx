"use client";

import React, { useState } from "react";
import Link from "next/link";
import { api, InterviewSession, InterviewTurn } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import {
  Award,
  Sparkles,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Send,
  ArrowLeft,
  Mic,
  Keyboard,
  Compass,
  AlertTriangle,
  Lightbulb,
  BookOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

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
  const [disputeNotice, setDisputeNotice] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);

  const skills = debrief?.skill_breakdown || {};
  const nextSteps = debrief?.next_steps || [];

  const handleDisputeSubmit = async (turnId: string) => {
    if (!disputeClarification.trim()) return;
    setIsDisputing(true);
    setDisputeNotice(null);
    try {
      await api.disputeTurnFeedback(turnId, {
        clarification: disputeClarification,
      });
      setDisputeNotice({
        tone: "success",
        message:
          "Clarification submitted. Reload the page to see the updated assessment.",
      });
      setDisputeTurnId(null);
      setDisputeClarification("");
    } catch (err: unknown) {
      setDisputeNotice({
        tone: "danger",
        message: getErrorMessage(
          err,
          "Could not reassess that answer. Nothing was changed.",
        ),
      });
    } finally {
      setIsDisputing(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Top navigation */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-ink-secondary transition-colors hover:text-ink"
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          <span>Back to dashboard</span>
        </Link>

        <Link href="/interview" className={buttonClasses({ size: "sm" })}>
          <span>Start new round</span>
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Debrief header */}
      <Card className="space-y-4 p-5 sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
              {debrief?.status_label || "Evidence-based interview debrief"}
            </span>
            <h1 className="font-question text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              {session.target_role} assessment
            </h1>
            <p className="text-xs text-ink-secondary">
              <span className="capitalize">{session.mode}</span> mode
              <span aria-hidden="true"> · </span>
              <span className="capitalize">
                {session.interviewer_style?.replace("_", " ")}
              </span>{" "}
              track
              <span aria-hidden="true"> · </span>
              {debrief?.assessment_confidence || "Full assessment"}
            </p>
          </div>

          {debrief?.overall_score ? (
            <div className="flex shrink-0 items-center gap-3 rounded-xl border border-warning/30 bg-warning-subtle px-4 py-2.5 text-warning-ink">
              <Award aria-hidden="true" className="h-5 w-5" />
              <div>
                <div className="tabular text-xl font-bold tracking-tight">
                  {debrief.overall_score}{" "}
                  <span className="text-xs font-normal opacity-70">/ 5.0</span>
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wider">
                  Calibrated score
                </div>
              </div>
            </div>
          ) : (
            <Badge variant="warning">Score pending</Badge>
          )}
        </div>

        {debrief?.summary && (
          <p className="border-t border-line pt-3 text-xs leading-relaxed text-ink-secondary sm:text-sm">
            {debrief.summary}
          </p>
        )}
      </Card>

      {/* Multi-dimensional skill breakdown */}
      {Object.keys(skills).length > 0 && (
        <section className="space-y-3">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
            Evaluation dimensions (anchored 1.0–5.0)
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {Object.entries(skills)
              .filter(([, score]) => score !== null && score !== undefined)
              .map(([skillKey, score]: [string, any]) => {
                const skillLabel = SKILL_LABELS[skillKey] || skillKey;
                return (
                  <Card key={skillKey} className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-ink-secondary">
                        {skillLabel}
                      </span>
                      <span className="tabular font-bold text-ink">
                        {score}{" "}
                        <span className="text-[10px] font-normal text-ink-tertiary">
                          / 5.0
                        </span>
                      </span>
                    </div>
                    <Progress
                      value={Number(score) || 0}
                      max={5}
                      label={`${skillLabel} score`}
                      hideLabel
                    />
                  </Card>
                );
              })}
          </div>
        </section>
      )}

      {/* Strengths & growth areas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="space-y-3 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-success-ink">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>Demonstrated technical strengths</span>
          </div>
          <ul className="list-inside list-disc space-y-2 text-xs leading-relaxed text-ink-secondary">
            {(debrief?.demonstrated_strengths || []).map((str: string, i: number) => (
              <li key={i}>{str}</li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-3 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-warning-ink">
            <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>Priority areas for growth</span>
          </div>
          <ul className="list-inside list-disc space-y-2 text-xs leading-relaxed text-ink-secondary">
            {(debrief?.key_growth_areas || debrief?.key_gaps || []).map(
              (gap: string, i: number) => (
                <li key={i}>{gap}</li>
              ),
            )}
          </ul>
        </Card>
      </div>

      {/* Turn-by-turn assessment */}
      <Card className="space-y-4 p-5 sm:p-8">
        <div className="border-b border-line pb-3">
          <h2 className="text-sm font-semibold tracking-tight text-ink">
            Question-by-question deep dive
          </h2>
          <p className="text-[11px] text-ink-tertiary">
            Transcripts, evidence, misconceptions, language feedback, and
            side-by-side improved answers
          </p>
        </div>

        {disputeNotice && (
          <div
            role={disputeNotice.tone === "danger" ? "alert" : "status"}
            className={
              disputeNotice.tone === "danger"
                ? "flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-subtle p-3.5 text-xs text-danger-ink"
                : "flex items-center gap-2 rounded-xl border border-success/30 bg-success-subtle p-3.5 text-xs text-success-ink"
            }
          >
            {disputeNotice.tone === "danger" ? (
              <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
            )}
            <span>{disputeNotice.message}</span>
          </div>
        )}

        <div className="divide-y divide-line">
          {turns.map((turn, idx) => {
            const isExpanded = activeTurnIdx === idx;
            const evalData = turn.evaluation || {};
            const isDisputingThis = disputeTurnId === turn.id;
            const sideBySide = evalData.side_by_side || {};
            const langDelivery = evalData.delivery_and_language || {};
            const missingDetails = evalData.missing_details_and_why || [];
            const misconceptionsList = evalData.misconceptions || [];

            return (
              <div key={turn.id} className="space-y-4 py-5">
                <button
                  type="button"
                  onClick={() => setActiveTurnIdx(isExpanded ? null : idx)}
                  aria-expanded={isExpanded}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 text-left transition-opacity hover:opacity-85"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold text-ink-tertiary">
                        Question {turn.turn_index + 1}
                      </span>
                      <Badge variant="outline">{turn.category}</Badge>
                      {turn.is_follow_up && (
                        <Badge variant="accent">Follow-up probe</Badge>
                      )}
                    </div>
                    <div className="text-xs font-semibold leading-snug text-ink sm:text-sm">
                      {turn.question_text}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {evalData.overall_score && (
                      <span className="tabular rounded-lg border border-warning/30 bg-warning-subtle px-2.5 py-1 text-xs font-bold text-warning-ink">
                        {evalData.overall_score} / 5.0
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp
                        aria-hidden="true"
                        className="h-4 w-4 text-ink-tertiary"
                      />
                    ) : (
                      <ChevronDown
                        aria-hidden="true"
                        className="h-4 w-4 text-ink-tertiary"
                      />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="space-y-5 pt-2 text-xs text-ink-secondary">
                    {/* Candidate answer + evidence */}
                    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                      <div className="space-y-1.5 rounded-xl border border-line bg-surface-sunken p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                            Your response
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-tertiary">
                            {turn.audio_url || turn.original_transcript ? (
                              <Mic aria-hidden="true" className="h-3 w-3" />
                            ) : (
                              <Keyboard aria-hidden="true" className="h-3 w-3" />
                            )}
                            {turn.audio_url || turn.original_transcript
                              ? "Spoken"
                              : "Typed"}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-ink">
                          &quot;
                          {turn.corrected_transcript ||
                            turn.original_transcript ||
                            turn.typed_answer ||
                            "No response recorded"}
                          &quot;
                        </p>
                      </div>

                      <div className="space-y-1.5 rounded-xl border border-line border-l-2 border-l-accent-line bg-surface-sunken p-4">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                          Identified evidence quote
                        </span>
                        <p className="text-xs italic leading-relaxed text-ink-secondary">
                          &quot;
                          {evalData.evidence_quote ||
                            "Full response evaluated across rubric dimensions."}
                          &quot;
                        </p>
                      </div>
                    </div>

                    {/* Demonstrated vs misconceptions vs missing */}
                    <div className="space-y-2.5">
                      {evalData.demonstrated_points &&
                        evalData.demonstrated_points.length > 0 && (
                          <div className="space-y-1 rounded-xl border border-success/25 bg-success-subtle p-3.5">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-success-ink">
                              <CheckCircle2
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                              />
                              Correct concepts demonstrated
                            </span>
                            <ul className="list-inside list-disc space-y-0.5 text-xs text-ink">
                              {evalData.demonstrated_points.map(
                                (pt: string, pIdx: number) => (
                                  <li key={pIdx}>{pt}</li>
                                ),
                              )}
                            </ul>
                          </div>
                        )}

                      {misconceptionsList.length > 0 && (
                        <div className="space-y-1 rounded-xl border border-danger/25 bg-danger-subtle p-3.5">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-danger-ink">
                            <AlertTriangle
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                            />
                            Technical misconception identified
                          </span>
                          <ul className="list-inside list-disc space-y-0.5 text-xs text-ink">
                            {misconceptionsList.map(
                              (mc: string, mIdx: number) => (
                                <li key={mIdx}>{mc}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}

                      {missingDetails.length > 0 && (
                        <div className="space-y-1.5 rounded-xl border border-warning/25 bg-warning-subtle p-3.5">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-warning-ink">
                            <AlertCircle
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                            />
                            Missing details &amp; why they matter
                          </span>
                          <div className="space-y-1.5">
                            {missingDetails.map(
                              (item: any, itemIdx: number) => (
                                <div key={itemIdx} className="text-xs text-ink">
                                  <span className="font-semibold">
                                    • {item.detail || item}:{" "}
                                  </span>
                                  <span className="text-ink-secondary">
                                    {item.why_it_matters ||
                                      "Demonstrates practical production awareness to the interviewer."}
                                  </span>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Language & delivery, isolated from technical scoring */}
                    {(langDelivery.filler_words_observed ||
                      langDelivery.sentence_construction_feedback ||
                      langDelivery.grammar_and_spelling_corrections) && (
                      <div className="space-y-2 rounded-xl border border-line bg-surface-sunken p-3.5">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                          Communication &amp; language observations
                        </span>
                        <div className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-3">
                          <div className="rounded-lg border border-line bg-surface p-2.5">
                            <span className="block text-[10px] font-semibold uppercase text-ink-tertiary">
                              Filler words
                            </span>
                            <span className="text-[11px] font-medium text-ink">
                              {langDelivery.filler_words_observed ||
                                "Minimal / none"}
                            </span>
                          </div>
                          <div className="rounded-lg border border-line bg-surface p-2.5">
                            <span className="block text-[10px] font-semibold uppercase text-ink-tertiary">
                              Sentence flow
                            </span>
                            <span className="text-[11px] text-ink">
                              {langDelivery.sentence_construction_feedback ||
                                "Clear delivery"}
                            </span>
                          </div>
                          <div className="rounded-lg border border-line bg-surface p-2.5">
                            <span className="block text-[10px] font-semibold uppercase text-ink-tertiary">
                              Grammar &amp; syntax
                            </span>
                            <span className="text-[11px] text-ink">
                              {langDelivery.grammar_and_spelling_corrections ||
                                "Clean grammar"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Side-by-side comparison */}
                    <div className="space-y-3.5 rounded-xl border border-line bg-surface-sunken p-4">
                      <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
                          <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
                          Side-by-side model answer
                        </span>
                        <span className="text-[10px] font-medium text-ink-tertiary">
                          Tailored to your background
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                        <div className="space-y-1 rounded-lg border border-danger/25 bg-danger-subtle p-3.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-danger-ink">
                            What to improve
                          </span>
                          <p className="text-xs leading-relaxed text-ink">
                            {sideBySide.original_weakness ||
                              "Lacked specific architectural trade-offs and concrete metrics."}
                          </p>
                        </div>

                        <div className="space-y-1 rounded-lg border border-success/25 bg-success-subtle p-3.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-success-ink">
                            Stronger model answer
                          </span>
                          <p className="text-xs leading-relaxed text-ink">
                            {sideBySide.stronger_answer ||
                              evalData.stronger_answer ||
                              "Structure your answer with problem definition, chosen approach, and explicit trade-offs."}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1 rounded-lg border border-warning/25 bg-warning-subtle p-3">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-warning-ink">
                          <Lightbulb aria-hidden="true" className="h-3 w-3" />
                          What changed &amp; why it&apos;s stronger
                        </span>
                        <p className="text-xs leading-relaxed text-ink">
                          {sideBySide.what_changed_and_why ||
                            evalData.why_its_stronger ||
                            "Directly addresses edge cases, explains technical trade-offs, and provides crisp structural clarity."}
                        </p>
                      </div>
                    </div>

                    {/* Dispute / reassessment request */}
                    <div className="pt-1">
                      {!isDisputingThis ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDisputeTurnId(turn.id)}
                        >
                          <MessageSquare aria-hidden="true" className="h-3 w-3" />
                          <span>Request review or clarify intent</span>
                        </Button>
                      ) : (
                        <div className="space-y-2 rounded-xl border border-line bg-surface-sunken p-4">
                          <label
                            htmlFor={`dispute-${turn.id}`}
                            className="block text-[11px] font-semibold text-ink-secondary"
                          >
                            Explain what you intended to convey or what evidence
                            was omitted:
                          </label>
                          <textarea
                            id={`dispute-${turn.id}`}
                            rows={3}
                            value={disputeClarification}
                            onChange={(e) =>
                              setDisputeClarification(e.target.value)
                            }
                            placeholder="e.g. In my answer, I discussed time complexity O(N) when outlining the monotonic deque approach..."
                            className="w-full rounded-lg border border-line bg-surface p-3 text-base text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40 sm:text-xs"
                          />
                          <div className="flex justify-end gap-2 pt-1">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setDisputeTurnId(null);
                                setDisputeClarification("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleDisputeSubmit(turn.id)}
                              disabled={!disputeClarification.trim()}
                              loading={isDisputing}
                            >
                              <span>Submit for reassessment</span>
                              <Send aria-hidden="true" className="h-3.5 w-3.5" />
                            </Button>
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
      </Card>

      {/* Next steps */}
      {nextSteps.length > 0 && (
        <Card className="space-y-3 p-5 sm:p-7">
          <div className="flex items-center gap-2 text-xs font-semibold text-ink">
            <Compass aria-hidden="true" className="h-4 w-4" />
            <span>Targeted action plan for your next round</span>
          </div>
          <div className="space-y-2">
            {nextSteps.map((step: string, sIdx: number) => (
              <div
                key={sIdx}
                className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-sunken p-3 text-xs text-ink-secondary"
              >
                <span className="tabular mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-[10px] font-bold text-ink">
                  {sIdx + 1}
                </span>
                <p className="leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
