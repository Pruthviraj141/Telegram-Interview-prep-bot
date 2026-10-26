"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Orb, OrbState } from "./Orb";
import { speechSynth, AudioRecorder, NeuralVoice, FALLBACK_NEURAL_VOICES } from "@/lib/speech";
import { api, ApiError, InterviewSession, InterviewTurn, InterviewSource } from "@/lib/api";
import {
  Mic,
  Square,
  Volume2,
  VolumeX,
  Send,
  Code2,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Settings2,
  ArrowLeft,
  CheckCircle2,
  Keyboard,
  X,
  RefreshCw,
  RotateCcw,
  Lightbulb,
  MessageSquareWarning,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { cn, getErrorMessage, topicLabel } from "@/lib/utils";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import { useDraft } from "@/lib/use-draft";

interface InterviewStudioProps {
  initialSession: InterviewSession;
  initialTurn: InterviewTurn;
  /** Let the setup page drop its cached session once the round is over. */
  onRoundClosed?: () => void;
}

interface TurnEvaluationView {
  overall_score?: number | null;
  evidence_quote?: string;
  missing_points?: string[];
  misconceptions?: string[];
  stronger_answer?: string;
  why_its_stronger?: string;
}

const SOURCE_BASIS_LABELS: Record<string, string> = {
  industry_standard: "Industry-standard interview topic",
  public_interview_guidance: "Public interview guidance",
  public_technical_reference: "Public technical reference",
  curated_taxonomy: "Curated practice taxonomy",
  resume_grounded: "Grounded in your confirmed resume",
  generated_practice: "Generated practice",
};

function honestProvenanceNote(turn: InterviewTurn): string {
  const note = turn.provenance?.note;
  if (note) return note;
  switch (turn.provenance?.kind) {
    case "resume_generated":
      return "Generated from your confirmed resume profile. Not a question a company actually asked.";
    case "adaptive_follow_up":
      return "Follow-up generated from your previous answer. Not a question a company actually asked.";
    case "generated_practice":
      return "Practice question generated for this session. Not a question a company actually asked.";
    default:
      return "Practice question. Not a verbatim interview question.";
  }
}

export const InterviewStudio: React.FC<InterviewStudioProps> = ({
  initialSession,
  initialTurn,
  onRoundClosed,
}) => {
  const router = useRouter();
  const [session, setSession] = useState<InterviewSession>(initialSession);
  const [currentTurn, setCurrentTurn] = useState<InterviewTurn>(initialTurn);

  // Studio UI state
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [audioVolume, setAudioVolume] = useState<number>(0);

  // Voice Settings (Neural Voices via Edge TTS)
  const [neuralVoices, setNeuralVoices] = useState<NeuralVoice[]>(FALLBACK_NEURAL_VOICES);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("en-US-EmmaNeural");
  const [voiceSpeed, setVoiceSpeed] = useState<number>(1.0);
  const [showVoiceSettings, setShowVoiceSettings] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  // Tracks whether the browser autoplay policy blocked speech.
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);

  // Recording & Direct Hands-Free Submission
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [liveTranscriptPreview, setLiveTranscriptPreview] = useState<string>("");
  const [scratchpadOpen, setScratchpadOpen] = useState<boolean>(false);
  const [scratchpadText, setScratchpadText] = useState<string>("");
  const [useTypedMode, setUseTypedMode] = useState<boolean>(false);
  const draftKey = `ai_coach_draft_${initialSession.id}_${currentTurn.id}`;
  const {
    value: typedAnswer,
    setValue: setTypedAnswer,
    saved: draftSaved,
    clear: clearDraft,
  } = useDraft(draftKey);
  const [questionExpanded, setQuestionExpanded] = useState<boolean>(true);

  // Practice Mode Options & Instant Feedback
  const [turnEvaluation, setTurnEvaluation] = useState<TurnEvaluationView | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  // The next turn returned by submit. Held in React state until the candidate
  // chooses to advance in practice mode; realistic mode advances immediately.
  const [pendingNextTurn, setPendingNextTurn] = useState<InterviewTurn | null>(null);

  // Practice-only assistance (recorded server-side via assistance_used)
  const [hintRevealed, setHintRevealed] = useState<boolean>(false);
  const [hintUsed, setHintUsed] = useState<boolean>(false);

  // Practice-only retry
  const [showRetryForm, setShowRetryForm] = useState<boolean>(false);
  const [retryAnswerText, setRetryAnswerText] = useState<string>("");
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [lastSubmittedAnswer, setLastSubmittedAnswer] = useState<string>("");

  // Practice-only dispute
  const [showDisputeForm, setShowDisputeForm] = useState<boolean>(false);
  const [disputeText, setDisputeText] = useState<string>("");
  const [isDisputing, setIsDisputing] = useState<boolean>(false);
  const [disputeMessage, setDisputeMessage] = useState<string | null>(null);

  // Modals & Errors
  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Once the round is finished the studio is a dead view: no unload guard and
  // no navigation back into it.
  const [roundClosed, setRoundClosed] = useState<boolean>(false);
  // Whether at least one answer exists. Drives the end-confirm copy, because a
  // zero-answer round ends without a debrief.
  const [answeredSome, setAnsweredSome] = useState<boolean>(
    initialSession.current_turn_index > 0 || initialTurn.evaluation_status === "completed"
  );

  const recorderRef = useRef<AudioRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Single-flight guard: a double click or ⌘↵ must never submit twice.
  const submitLockRef = useRef<boolean>(false);
  // The early-exit confirmation is inline, so bring it into view when opened.
  const endPanelRef = useRef<HTMLDivElement | null>(null);

  const requestEndRound = () => {
    setShowEndModal(true);
    requestAnimationFrame(() => {
      endPanelRef.current?.scrollIntoView({ block: "nearest" });
      endPanelRef.current?.focus();
    });
  };

  useKeyboardInset();

  // Ask the browser to confirm before a reload drops an active round. Once the
  // round is closed this view is dead, so the guard must not fire.
  useEffect(() => {
    if (roundClosed) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [roundClosed]);

  // Leave the studio for good: drop the draft, silence the unload guard, and
  // replace (never push) so Back cannot re-enter a finished round.
  const closeRound = (href: string) => {
    setRoundClosed(true);
    clearDraft();
    // Purge every draft for this session, not just the open question.
    try {
      const prefix = `ai_coach_draft_${session.id}_`;
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) localStorage.removeItem(key);
      }
    } catch {
      // Storage may be unavailable; drafts are optional.
    }
    // The setup page keeps the session in state; without this it would keep
    // rendering the studio after a zero-answer close.
    onRoundClosed?.();
    router.replace(href);
  };

  // Browser Back inside the studio must not silently drop the round. Keep a
  // sentinel history entry and route Back through the same end-round confirm.
  useEffect(() => {
    if (roundClosed) return;
    window.history.pushState({ studioGuard: true }, "");
    const onPopState = () => {
      window.history.pushState({ studioGuard: true }, "");
      setShowEndModal(true);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [roundClosed]);

  const isPractice = session.mode === "practice";
  const typedWordCount = typedAnswer.trim() ? typedAnswer.trim().split(/\s+/).length : 0;

  // Voice settings kept in a ref so speakText stays stable across renders and
  // changing the voice does not re-trigger the current question.
  const voiceSettingsRef = useRef({ neuralVoiceId: selectedVoiceId, speed: voiceSpeed });
  useEffect(() => {
    voiceSettingsRef.current = { neuralVoiceId: selectedVoiceId, speed: voiceSpeed };
  }, [selectedVoiceId, voiceSpeed]);

  // Voice speech synthesis
  const speakText = useCallback(async (text: string) => {
    setOrbState("speaking");
    setAutoplayBlocked(false);
    await speechSynth.speak(
      text,
      voiceSettingsRef.current,
      () => setOrbState("idle"),
      (err: unknown) => {
        setOrbState("idle");
        if (err instanceof Error && err.message === "AUTOPLAY_BLOCKED") {
          setAutoplayBlocked(true);
        }
      }
    );
  }, []);

  // Clear everything that belongs to a single question. Called explicitly when
  // the current turn changes instead of from a reset effect.
  const resetTurnTransientState = () => {
    setTurnEvaluation(null);
    setPendingNextTurn(null);
    setHintRevealed(false);
    setHintUsed(false);
    setShowRetryForm(false);
    setRetryAnswerText("");
    setRetryMessage(null);
    setShowDisputeForm(false);
    setDisputeText("");
    setDisputeMessage(null);
    clearDraft();
    setLiveTranscriptPreview("");
    setUseTypedMode(false);
    setQuestionExpanded(true);
    setErrorMsg(null);
    setScratchpadText("");
    setScratchpadOpen(false);
  };

  const applyNextTurn = (nextTurn: InterviewTurn) => {
    resetTurnTransientState();
    setCurrentTurn(nextTurn);
  };

  /**
   * Recover from a 409 (already submitted) by reloading the real session and
   * selecting the last turn that still has an evaluation pending.
   */
  const recoverFromConflict = async (message: string) => {
    try {
      const data = await api.getInterviewSession(session.id);
      const turns = data.turns || [];
      setSession(data.session);

      const pending = [...turns]
        .reverse()
        .find((t) => t.evaluation_status !== "completed");

      if (pending) {
        applyNextTurn(pending);
        setErrorMsg(`${message} We moved you to your open question.`);
        return;
      }

      if (data.session.status === "completed" || data.session.status === "partial_completed") {
        closeRound(`/interview/${session.id}/debrief`);
        return;
      }

      setErrorMsg(`${message} There is no open question left. You can wrap up this round to see feedback.`);
      setShowEndModal(true);
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, message));
    }
  };

  // Load available neural voices from backend
  useEffect(() => {
    async function loadVoices() {
      try {
        const voices = await api.getTTSVoices();
        if (voices && voices.length > 0) {
          setNeuralVoices(voices);
        }
      } catch {
        const local = speechSynth.getNeuralVoices();
        if (local && local.length > 0) setNeuralVoices(local);
      }
    }
    loadVoices();
  }, []);

  // Speak question automatically when a new turn arrives. The call is deferred a
  // tick so speech state changes land after render rather than inside the effect.
  const questionText = currentTurn?.question_text ?? "";
  useEffect(() => {
    if (!questionText || isMuted) return;
    const speakTimer = setTimeout(() => {
      void speakText(questionText);
    }, 0);
    return () => {
      clearTimeout(speakTimer);
      speechSynth.stop();
      if (recorderRef.current) recorderRef.current.cancel();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [questionText, isMuted, speakText]);

  // Recover from a stale or already-answered initial turn. The server rejects
  // re-submission with 409, so move to the real open question or the debrief.
  useEffect(() => {
    let cancelled = false;
    async function validateInitialTurn() {
      if (initialSession.status === "completed" || initialSession.status === "partial_completed") {
        router.replace(`/interview/${initialSession.id}/debrief`);
        return;
      }
      // Stale or cancelled rounds have no studio: send the user back to setup.
      if (initialSession.status === "abandoned" || initialSession.status === "cancelled") {
        router.replace("/interview");
        return;
      }
      if (initialTurn.evaluation_status !== "completed") return;
      if (cancelled) return;
      await recoverFromConflict("This question was already answered.");
    }
    void validateInitialTurn();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStopSpeaking = () => {
    speechSynth.stop();
    setOrbState("idle");
  };

  const handleSubmissionError = (err: unknown, sourceText: string, fallback: string) => {
    if (err instanceof ApiError && err.status === 409) {
      void recoverFromConflict(err.message || "This answer was already submitted.");
      return;
    }
    if (err instanceof ApiError && err.status === 502) {
      // Evaluation failed before the answer was stored. Keep the answer so the
      // candidate can retry without re-recording.
      if (sourceText.trim()) {
        setUseTypedMode(true);
        setTypedAnswer((prev) => prev || sourceText);
      }
      setErrorMsg("The evaluation model could not respond, so this answer was not scored. Retry below — your answer is preserved.");
      return;
    }
    setErrorMsg(getErrorMessage(err, fallback));
  };

  const buildAssistance = (): Record<string, string | boolean> => {
    const used: Record<string, string | boolean> = {};
    if (scratchpadOpen && scratchpadText.trim()) used.scratchpad_used = true;
    if (hintUsed) {
      used.hint_requested = true;
      used.hint_source = "rubric_guidance";
    }
    return used;
  };

  // 1-Click Start Speaking
  const startRecording = async () => {
    handleStopSpeaking();
    setErrorMsg(null);
    setLiveTranscriptPreview("");
    try {
      recorderRef.current = new AudioRecorder();
      await recorderRef.current.start((vol) => {
        setAudioVolume(vol);
      });
      setIsRecording(true);
      setOrbState("listening");
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, "Could not access microphone. Please check browser permissions."));
      setOrbState("error");
    }
  };

  // Direct Submission on Stop Speaking
  const stopRecordingAndSubmit = async () => {
    if (!recorderRef.current || !isRecording) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setOrbState("transcribing");
    setIsEvaluating(true);

    try {
      const audioBlob = await recorderRef.current.stop();
      setOrbState("transcribing");

      // 1. Transcribe audio securely (Whisper on Groq)
      const transRes = await api.transcribeAudio(audioBlob);
      const text = transRes.transcript || "";
      setLiveTranscriptPreview(text);
      setLastSubmittedAnswer(text);

      setOrbState("thinking");

      // 2. Submit turn answer with transcript for calibrated evaluation
      const res = await api.submitTurnAnswer(currentTurn.id, {
        original_transcript: text,
        corrected_transcript: text,
        is_voice: true,
        scratchpad_text: scratchpadOpen ? scratchpadText : undefined,
        assistance_used: buildAssistance(),
      });

      handleTurnResult(res);
    } catch (err: unknown) {
      setOrbState("idle");
      handleSubmissionError(
        err,
        liveTranscriptPreview,
        "Failed to process turn answer. You can retry speaking or switch to typing."
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  // Submit typed response fallback. Kept separate from the form handler so
  // ⌘/Ctrl+Enter can trigger exactly the same single-flight path.
  const submitTypedAnswer = async () => {
    const answer = typedAnswer.trim();
    if (!answer || submitLockRef.current) return;
    submitLockRef.current = true;
    setErrorMsg(null);
    setOrbState("thinking");
    setIsEvaluating(true);
    setLastSubmittedAnswer(answer);

    try {
      const res = await api.submitTurnAnswer(currentTurn.id, {
        typed_answer: answer,
        is_voice: false,
        scratchpad_text: scratchpadOpen ? scratchpadText : undefined,
        assistance_used: buildAssistance(),
      });
      clearDraft();
      handleTurnResult(res);
    } catch (err: unknown) {
      setOrbState("idle");
      handleSubmissionError(err, answer, "Failed to submit answer. Please retry.");
    } finally {
      submitLockRef.current = false;
      setIsEvaluating(false);
    }
  };

  const handleTypedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitTypedAnswer();
  };

  // Handle Turn Result
  const handleTurnResult = (res: {
    evaluated_turn: InterviewTurn;
    next_turn: InterviewTurn | null;
    is_session_completed: boolean;
  }) => {
    setOrbState("idle");
    setAnsweredSome(true);

    if (res.is_session_completed) {
      closeRound(`/interview/${session.id}/debrief`);
      return;
    }

    if (isPractice) {
      // The server returns the real evaluation in practice mode.
      if (res.evaluated_turn?.evaluation) {
        setTurnEvaluation(res.evaluated_turn.evaluation);
      }
      setPendingNextTurn(res.next_turn || null);
    } else if (res.next_turn) {
      // Realistic simulation advances seamlessly. The evaluation is hidden
      // server-side, so we never depend on it here.
      applyNextTurn(res.next_turn);
    }
  };

  const handleAdvanceToNextTurn = () => {
    if (pendingNextTurn) {
      applyNextTurn(pendingNextTurn);
    } else {
      closeRound(`/interview/${session.id}/debrief`);
    }
  };

  // Practice-only: retry the same question with a corrected answer.
  const handleRetry = async (e: React.FormEvent) => {
    e.preventDefault();
    const answer = retryAnswerText.trim();
    if (!answer) return;
    setIsRetrying(true);
    setRetryMessage(null);
    try {
      const res = await api.retryTurnAnswer(currentTurn.id, {
        typed_answer: answer,
        is_voice: false,
      });
      if (res.retry_evaluation) {
        setTurnEvaluation(res.retry_evaluation);
      }
      setRetryMessage("Re-evaluated your corrected answer. Your original score is still saved in the session.");
      setShowRetryForm(false);
    } catch (err: unknown) {
      setRetryMessage(getErrorMessage(err, "Could not re-evaluate this answer. Please retry."));
    } finally {
      setIsRetrying(false);
    }
  };

  // Practice-only: dispute feedback with a clarification.
  const handleDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    const clarification = disputeText.trim();
    if (!clarification) return;
    setIsDisputing(true);
    setDisputeMessage(null);
    try {
      const res = await api.disputeTurnFeedback(currentTurn.id, { clarification });
      if (res.reassessed_evaluation) {
        setTurnEvaluation(res.reassessed_evaluation);
      }
      setDisputeMessage("Feedback re-assessed. Your original evaluation remains on record.");
      setShowDisputeForm(false);
      setDisputeText("");
    } catch (err: unknown) {
      setDisputeMessage(getErrorMessage(err, "Could not re-assess this feedback. Please retry."));
    } finally {
      setIsDisputing(false);
    }
  };

  const handleEndSessionEarly = async () => {
    try {
      const res = await api.endInterviewSession(session.id);
      // With zero answers there is nothing to debrief: go back to setup.
      closeRound(res.debrief_id ? `/interview/${session.id}/debrief` : "/interview");
    } catch (err: unknown) {
      setShowEndModal(false);
      setErrorMsg(getErrorMessage(err, "Could not wrap up this round. Please retry."));
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const currentVoice = neuralVoices.find((v) => v.id === selectedVoiceId) || neuralVoices[0];
  const targetQuestions = session.blueprint?.target_questions || 5;

  // Practice-only hint is the real rubric's mid-level guidance, clearly labeled.
  const hintText: string | undefined =
    currentTurn.rubric?.rubric_1_to_5?.score_3 || currentTurn.rubric?.score_3;

  const hasSources = (currentTurn.sources?.length || 0) > 0;
  const showProvenance = Boolean(
    currentTurn.provenance?.note ||
      currentTurn.source_basis ||
      currentTurn.coverage_note ||
      hasSources,
  );

  const scoreDisplay =
    typeof turnEvaluation?.overall_score === "number"
      ? `${turnEvaluation.overall_score.toFixed(1)} / 5.0`
      : "Not scored";

  return (
    <div
      className={cn(
        "studio min-h-dvh bg-canvas text-ink flex flex-col justify-between selection:bg-accent-subtle selection:text-ink transition-all relative overflow-hidden font-sans",
        isFullscreen && "fixed inset-0 z-50 overflow-y-auto"
      )}
    >
      {/* Top Studio Control Bar */}
      <header className="relative z-20 border-b border-line bg-canvas/95 backdrop-blur-md px-3 sm:px-8 py-2.5 sm:py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={requestEndRound}
            aria-label="Exit round"
            className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-xl bg-surface hover:bg-surface-raised border border-line text-ink-secondary text-xs font-medium transition cursor-pointer shrink-0 min-h-[44px] sm:min-h-[36px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Exit</span>
          </button>

          <div className="h-4 w-px bg-line shrink-0" />

          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="text-xs font-semibold text-ink tracking-tight truncate max-w-[104px] sm:max-w-none">
              {session.blueprint?.target_role || session.target_role || "Interview"}
            </span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-raised text-ink-secondary border border-line shrink-0">
              Q{currentTurn.turn_index + 1}/{targetQuestions}
            </span>
            <span className="hidden sm:inline text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-raised text-ink-secondary border border-line shrink-0 capitalize">
              {session.mode}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Voice Selector Pill */}
          <div className="relative">
            <button
              onClick={() => setShowVoiceSettings(!showVoiceSettings)}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-3 rounded-xl bg-surface hover:bg-surface-raised border border-line text-xs font-medium text-ink-secondary transition cursor-pointer min-h-[44px] sm:min-h-[36px]"
              title="Change neural voice"
            >
              <Volume2 className="w-3.5 h-3.5 text-ink-secondary" />
              <span className="hidden md:inline">{currentVoice?.name || "Neural Voice"}</span>
              <Settings2 className="w-3 h-3 text-ink-tertiary ml-0.5" />
            </button>

            {showVoiceSettings && (
              <div className="absolute right-0 mt-2 w-72 p-3 bg-surface border border-line rounded-2xl shadow-2xl z-50 space-y-3 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between pb-2 border-b border-line">
                  <span className="text-xs font-semibold text-ink tracking-tight">Neural Recruiter Voice</span>
                  <button onClick={() => setShowVoiceSettings(false)} className="text-ink-tertiary hover:text-ink">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {neuralVoices.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setSelectedVoiceId(v.id);
                        setShowVoiceSettings(false);
                        speechSynth.speak(`Hello, I am ${v.name}. Let's continue your interview.`, { neuralVoiceId: v.id, speed: voiceSpeed });
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-xl text-xs transition flex items-center justify-between cursor-pointer",
                        selectedVoiceId === v.id
                          ? "bg-surface-raised text-ink border border-line-strong font-medium"
                          : "hover:bg-surface-raised text-ink-tertiary hover:text-ink"
                      )}
                    >
                      <div>
                        <div className="font-medium text-ink">{v.name}</div>
                        <div className="text-[10px] text-ink-tertiary">{v.style}</div>
                      </div>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-canvas-subtle text-ink-tertiary">{v.tag}</span>
                    </button>
                  ))}
                </div>

                <div className="pt-2 border-t border-line">
                  <div className="flex justify-between text-[11px] text-ink-tertiary mb-1">
                    <span>Pacing</span>
                    <span>{voiceSpeed}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="1.2"
                    step="0.05"
                    value={voiceSpeed}
                    onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
                    className="w-full accent-[var(--accent)] cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Mute Toggle */}
          <button
            onClick={() => {
              if (!isMuted) handleStopSpeaking();
              setIsMuted(!isMuted);
            }}
            className={cn(
              "w-11 h-11 sm:w-8 sm:h-8 rounded-xl border text-xs flex items-center justify-center transition cursor-pointer",
              isMuted
                ? "bg-danger-subtle border-danger/30 text-danger-ink"
                : "bg-surface border-line text-ink-secondary hover:bg-surface-raised"
            )}
            title={isMuted ? "Unmute AI Voice" : "Mute AI Voice"}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          {/* Technical Scratchpad */}
          <button
            onClick={() => setScratchpadOpen(!scratchpadOpen)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-xl border text-xs font-medium transition cursor-pointer min-h-[44px] sm:min-h-[36px]",
              scratchpadOpen
                ? "bg-accent-strong text-on-accent border-accent-line shadow-xs"
                : "bg-surface border-line text-ink-secondary hover:bg-surface-raised"
            )}
            title="Technical Notes & Architecture Scratchpad"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Scratchpad</span>
          </button>

          {/* Fullscreen Toggle (desktop only) */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="hidden sm:flex w-8 h-8 rounded-xl bg-surface hover:bg-surface-raised border border-line text-ink-secondary items-center justify-center transition cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* Main Studio Body */}
      <main className="relative z-10 flex-1 max-w-3xl w-full mx-auto px-3.5 sm:px-6 py-4 sm:py-8 flex flex-col items-center justify-between gap-4 sm:gap-6 pb-safe">
        {/* Error Alert */}
        {errorMsg && (
          <div
            role="alert"
            className="w-full p-3 sm:p-4 rounded-2xl bg-danger-subtle border border-danger/40 text-danger-ink text-xs flex items-center justify-between gap-3 shadow-sm"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {typedAnswer.trim() && (
                <button
                  type="button"
                  onClick={() => void submitTypedAnswer()}
                  disabled={isEvaluating}
                  className="text-danger-ink hover:text-ink text-xs font-semibold underline disabled:opacity-50 cursor-pointer"
                >
                  Retry
                </button>
              )}
              <button onClick={() => setErrorMsg(null)} className="text-danger-ink hover:text-ink text-xs underline cursor-pointer">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Centerpiece: Calm Apple Intelligence Orb */}
        <div className="py-1 sm:py-2 flex flex-col items-center">
          <Orb state={orbState} size="xl" volume={audioVolume} />
        </div>

        {/* Interviewer Question Module */}
        <div className="w-full bg-surface border border-line rounded-2xl sm:rounded-3xl p-4 sm:p-7 shadow-lg text-left space-y-3 sm:space-y-4">
          <div className="flex items-center gap-2 text-ink-secondary">
            <span className="w-6 h-6 rounded-full bg-surface-raised border border-line flex items-center justify-center shrink-0">
              <Mic className="w-3 h-3 text-ink-tertiary" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider">Interviewer</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full bg-surface-raised border border-line text-ink-secondary text-[10px] font-semibold uppercase tracking-wider">
              {topicLabel(currentTurn.category)}
            </span>
            {Boolean(currentTurn.is_follow_up) && (
              <span className="px-2.5 py-0.5 rounded-full bg-accent-subtle border border-accent-line text-accent-strong text-[10px] font-semibold uppercase tracking-wider">
                Follow-Up Probe
              </span>
            )}
          </div>

          <h2 className={cn("font-question text-ink max-w-2xl", !questionExpanded && "line-clamp-2")}>
            {currentTurn.question_text}
          </h2>
          {!questionExpanded && (
            <button
              type="button"
              onClick={() => setQuestionExpanded(true)}
              className="inline-flex items-center text-[11px] font-medium text-accent-strong hover:text-ink underline underline-offset-2 min-h-[44px] sm:min-h-[36px]"
            >
              Show full question
            </button>
          )}

          {/* Replay / Play Audio Button */}
          <div className="flex flex-col items-start justify-start pt-0.5 gap-2">
            {autoplayBlocked ? (
              <button
                onClick={() => {
                  speechSynth.unlockAudio();
                  speakText(currentTurn.question_text);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-warning-subtle hover:bg-warning-subtle/70 text-warning-ink text-xs font-semibold shadow-md transition cursor-pointer animate-bounce"
              >
                <Volume2 className="w-4 h-4 text-warning-ink" />
                <span>Tap to Hear Question</span>
              </button>
            ) : (
              <button
                onClick={() => speakText(currentTurn.question_text)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-raised hover:bg-line/60 border border-line text-ink-secondary text-xs transition cursor-pointer min-h-[44px] sm:min-h-[36px]"
              >
                <Volume2 className="w-3.5 h-3.5 text-ink-tertiary" />
                <span>Replay Question</span>
              </button>
            )}
          </div>

          {/* Practice-only rubric guidance hint */}
          {isPractice && hintText && !turnEvaluation && (
            <div className="pt-1">
              {!hintRevealed ? (
                <button
                  type="button"
                  onClick={() => {
                    setHintRevealed(true);
                    setHintUsed(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-raised hover:bg-line/60 border border-line text-ink-secondary text-xs transition cursor-pointer min-h-[44px] sm:min-h-[36px]"
                >
                  <Lightbulb className="w-3.5 h-3.5 text-warning-ink" />
                  <span>Show rubric guidance</span>
                </button>
              ) : (
                <div className="text-left p-3 rounded-xl bg-warning-subtle border border-warning/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-warning-ink">
                    <Lightbulb className="w-3 h-3" />
                    <span>Rubric guidance — not a model answer</span>
                  </div>
                  <p className="text-xs text-ink-secondary leading-relaxed">{hintText}</p>
                  <p className="text-[10px] text-ink-tertiary">Using a hint is recorded in your practice assistance log.</p>
                </div>
              )}
            </div>
          )}

          {/* Honest provenance / source panel */}
          {showProvenance && (
            <details className="text-left pt-1 group">
              <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-[11px] text-ink-tertiary hover:text-ink transition">
                <BookOpen className="w-3 h-3" />
                <span>Where this question comes from</span>
              </summary>
              <div className="mt-2 p-3 rounded-xl bg-canvas-subtle border border-line space-y-2">
                <p className="text-[11px] text-ink-secondary leading-relaxed">{honestProvenanceNote(currentTurn)}</p>
                {currentTurn.source_basis && (
                  <p className="text-[10px] text-ink-tertiary">
                    Basis: {SOURCE_BASIS_LABELS[currentTurn.source_basis] || currentTurn.source_basis}
                  </p>
                )}
                {currentTurn.coverage_note && (
                  <p className="text-[10px] text-ink-tertiary">
                    Topic: {currentTurn.coverage_note}
                  </p>
                )}
                {hasSources && (
                  <ul className="space-y-1">
                    {currentTurn.sources!.map((src: InterviewSource) => (
                      <li key={src.id || src.url}>
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-start gap-1.5 text-[11px] text-ink-secondary hover:text-ink underline decoration-line-strong underline-offset-2"
                        >
                          <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>
                            {src.title}
                            {src.publisher ? ` — ${src.publisher}` : ""}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          )}
        </div>

        {/* Practice Mode Coaching Feedback Panel (practice only, real fields) */}
        {isPractice && turnEvaluation && (
          <div className="w-full p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-surface border border-line space-y-4 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="text-xs font-semibold text-ink">Feedback on this answer</span>
              </div>
              <div className="px-2.5 py-0.5 rounded-full bg-surface-raised border border-line text-ink text-xs font-semibold tabular">
                {scoreDisplay}
              </div>
            </div>

            {turnEvaluation.evidence_quote && (
              <div className="text-xs text-ink-secondary space-y-1">
                <span className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider">From your answer</span>
                <blockquote className="border-l-2 border-accent-line pl-3 italic text-ink-secondary">
                  “{turnEvaluation.evidence_quote}”
                </blockquote>
              </div>
            )}

            {turnEvaluation.missing_points && turnEvaluation.missing_points.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-warning-ink tracking-tight">Key points to mention:</span>
                <ul className="text-xs text-ink-secondary list-disc list-inside space-y-1">
                  {turnEvaluation.missing_points.map((pt: string, idx: number) => (
                    <li key={idx}>{pt}</li>
                  ))}
                </ul>
              </div>
            )}

            {turnEvaluation.misconceptions && turnEvaluation.misconceptions.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-warning-ink tracking-tight">What to correct:</span>
                <ul className="text-xs text-ink-secondary list-disc list-inside space-y-1">
                  {turnEvaluation.misconceptions.map((pt: string, idx: number) => (
                    <li key={idx}>{pt}</li>
                  ))}
                </ul>
              </div>
            )}

            {turnEvaluation.stronger_answer && (
              <div className="p-3.5 rounded-2xl bg-canvas-subtle border border-line text-xs text-ink-secondary space-y-1">
                <span className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider">A stronger answer</span>
                <p className="leading-relaxed text-ink">{turnEvaluation.stronger_answer}</p>
                {turnEvaluation.why_its_stronger && (
                  <p className="text-[11px] text-ink-tertiary leading-relaxed">{turnEvaluation.why_its_stronger}</p>
                )}
              </div>
            )}

            {(retryMessage || disputeMessage) && (
              <p className="text-[11px] text-ink-tertiary leading-relaxed">{retryMessage || disputeMessage}</p>
            )}

            {/* Retry / dispute forms (practice only) */}
            {showRetryForm && (
              <form onSubmit={handleRetry} className="space-y-2">
                <label className="text-[11px] font-semibold text-ink-secondary">Your corrected answer</label>
                <textarea
                  rows={3}
                  required
                  value={retryAnswerText}
                  onChange={(e) => setRetryAnswerText(e.target.value)}
                  placeholder="Rewrite your answer using the feedback above..."
                  className="w-full p-3 bg-canvas-subtle border border-line rounded-xl text-base sm:text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent/40 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRetryForm(false)}
                    className="flex-1 py-2 rounded-xl border border-line text-ink-secondary text-xs font-medium hover:bg-surface-raised transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isRetrying || !retryAnswerText.trim()}
                    className="flex-1 py-2 rounded-xl bg-accent-strong text-on-accent hover:bg-accent-strong/90 text-xs font-semibold transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isRetrying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    <span>{isRetrying ? "Re-evaluating..." : "Retry answer"}</span>
                  </button>
                </div>
              </form>
            )}

            {showDisputeForm && (
              <form onSubmit={handleDispute} className="space-y-2">
                <label className="text-[11px] font-semibold text-ink-secondary">
                  What did the feedback miss or misread?
                </label>
                <textarea
                  rows={3}
                  required
                  value={disputeText}
                  onChange={(e) => setDisputeText(e.target.value)}
                  placeholder="Explain the point you actually made, or correct a transcription error..."
                  className="w-full p-3 bg-canvas-subtle border border-line rounded-xl text-base sm:text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent/40 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDisputeForm(false)}
                    className="flex-1 py-2 rounded-xl border border-line text-ink-secondary text-xs font-medium hover:bg-surface-raised transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDisputing || !disputeText.trim()}
                    className="flex-1 py-2 rounded-xl bg-accent-strong text-on-accent hover:bg-accent-strong/90 text-xs font-semibold transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isDisputing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <MessageSquareWarning className="w-3.5 h-3.5" />}
                    <span>{isDisputing ? "Re-assessing..." : "Request re-assessment"}</span>
                  </button>
                </div>
              </form>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleAdvanceToNextTurn}
                className="flex-1 py-3 rounded-2xl bg-accent-strong text-on-accent hover:bg-accent-strong/90 font-semibold text-xs transition shadow-sm flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
              >
                <span>{pendingNextTurn ? "Next Question" : "View Debrief"}</span>
                <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
              </button>
              {!showRetryForm && (
                <button
                  type="button"
                  onClick={() => {
                    setRetryAnswerText(lastSubmittedAnswer);
                    setShowRetryForm(true);
                    setShowDisputeForm(false);
                  }}
                  className="py-3 px-4 rounded-2xl border border-line text-ink-secondary text-xs font-medium hover:bg-surface-raised transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              )}
              {!showDisputeForm && (
                <button
                  type="button"
                  onClick={() => {
                    setShowDisputeForm(true);
                    setShowRetryForm(false);
                  }}
                  className="py-3 px-4 rounded-2xl border border-line text-ink-secondary text-xs font-medium hover:bg-surface-raised transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <MessageSquareWarning className="w-3.5 h-3.5" />
                  <span>Dispute</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Technical Scratchpad (Expandable) */}
        {scratchpadOpen && (
          <div className="w-full p-4 rounded-2xl sm:rounded-3xl bg-surface border border-line space-y-2">
            <div className="flex items-center justify-between text-xs text-ink-tertiary">
              <span className="font-semibold text-ink">Scratchpad</span>
              <button
                onClick={() => setScratchpadOpen(false)}
                aria-label="Close scratchpad"
                className="inline-flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 -mr-2 rounded-lg text-ink-tertiary hover:text-ink hover:bg-surface-raised transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              rows={3}
              value={scratchpadText}
              onChange={(e) => setScratchpadText(e.target.value)}
              placeholder="Notes, code, complexity trade-offs..."
              className="w-full p-3 bg-canvas-subtle border border-line rounded-xl text-base sm:text-xs font-mono text-ink focus:outline-none focus:ring-1 focus:ring-accent/40 resize-none"
            />
            <p className="text-[10px] text-ink-tertiary">Scratchpad use is recorded in your practice assistance log.</p>
          </div>
        )}

        {/* Early exit confirmation, inline so nothing covers the composer */}
        {showEndModal && (
          <div
            ref={endPanelRef}
            tabIndex={-1}
            role="alertdialog"
            aria-labelledby="end-round-title"
            aria-describedby="end-round-desc"
            className="w-full p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-warning-subtle border border-warning/30 space-y-3 focus:outline-none"
          >
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-xl bg-surface border border-warning/30 flex items-center justify-center text-warning-ink shrink-0">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 id="end-round-title" className="text-sm font-semibold text-ink">
                  End this round now?
                </h3>
                <p id="end-round-desc" className="text-xs text-ink-secondary leading-relaxed mt-1">
                  {answeredSome ? (
                    <>
                      Answers you already submitted are saved and scored. This question
                      {typedAnswer.trim() ? " and the text you have typed" : ""} will not be scored.
                      Your debrief covers the answers so far.
                    </>
                  ) : (
                    <>
                      Nothing has been answered yet, so there is no debrief. This round is
                      closed, your draft is discarded, and you return to setup.
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-line bg-surface text-ink-secondary text-xs font-medium hover:bg-surface-raised transition cursor-pointer min-h-[44px] sm:min-h-[40px]"
              >
                Keep answering
              </button>
              <button
                type="button"
                onClick={() => void handleEndSessionEarly()}
                className="flex-1 py-2.5 rounded-xl bg-accent-strong text-on-accent hover:bg-accent-strong/90 text-xs font-semibold transition cursor-pointer min-h-[44px] sm:min-h-[40px]"
              >
                End round &amp; {answeredSome ? "view debrief" : "back to setup"}
              </button>
            </div>
          </div>
        )}

        {/* Primary Interaction Controls */}
        {!(isPractice && turnEvaluation) && (
          <div className="w-full max-w-md mx-auto flex flex-col items-center gap-2.5 pb-[max(env(safe-area-inset-bottom),var(--kb,0px))] sm:pb-0">
            {!useTypedMode ? (
              <div className="w-full flex flex-col items-center gap-2.5">
                <div className="w-full flex justify-center">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      disabled={isEvaluating}
                      className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 rounded-full bg-accent-strong text-on-accent hover:bg-accent-strong/90 font-semibold text-xs sm:text-sm transition shadow-sm flex items-center justify-center gap-2.5 cursor-pointer min-h-[48px] sm:min-h-[52px] disabled:opacity-50"
                    >
                      <Mic className="w-4 h-4 text-on-accent shrink-0" />
                      <span>Answer by Voice</span>
                    </button>
                  ) : (
                    <button
                      onClick={stopRecordingAndSubmit}
                      className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 rounded-full bg-danger text-canvas hover:bg-danger/90 font-semibold text-xs sm:text-sm transition shadow-sm flex items-center justify-center gap-2.5 cursor-pointer min-h-[48px] sm:min-h-[52px]"
                    >
                      <Square className="w-4 h-4 fill-current text-canvas shrink-0" />
                      <span>Submit Answer ({formatSeconds(recordingDuration)})</span>
                    </button>
                  )}
                </div>

                {isEvaluating && (
                  <div className="flex items-center gap-2 text-[11px] sm:text-xs text-ink-tertiary font-medium">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Evaluating answer...</span>
                  </div>
                )}

                {liveTranscriptPreview && (
                  <p className="text-[11px] text-ink-tertiary text-center max-w-md line-clamp-2">
                    Transcript: {liveTranscriptPreview}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setUseTypedMode(true)}
                  className="text-[11px] text-ink-tertiary hover:text-ink-secondary transition flex items-center gap-1.5 cursor-pointer min-h-[44px] sm:min-h-[38px] px-3"
                >
                  <Keyboard className="w-3 h-3" />
                  <span>Type answer instead</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleTypedSubmit} className="w-full space-y-2">
                <div className="rounded-2xl bg-surface border border-line shadow-sm focus-within:ring-1 focus-within:ring-accent/40 transition">
                  <div className="flex items-center justify-between gap-2 px-3.5 sm:px-4 pt-2.5">
                    <label
                      htmlFor="studio-answer"
                      className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary"
                    >
                      Your answer
                    </label>
                    <span className="flex items-center gap-1.5 text-[10px] text-ink-secondary">
                      <span className="tabular">
                        {typedWordCount} {typedWordCount === 1 ? "word" : "words"}
                      </span>
                      {draftSaved && (
                        <span role="status" className="text-ink-secondary">
                          · Draft saved
                        </span>
                      )}
                    </span>
                  </div>
                  <textarea
                    id="studio-answer"
                    rows={3}
                    required
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    onFocus={() => {
                      // On phones the keyboard eats the viewport, so keep the
                      // question to two lines while typing. Reversible.
                      if (window.matchMedia("(max-width: 639px)").matches) {
                        setQuestionExpanded(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        void submitTypedAnswer();
                      }
                    }}
                    placeholder="Type your answer here..."
                    className="w-full px-3.5 sm:px-4 pt-1.5 pb-1 bg-transparent border-0 text-base sm:text-sm text-ink focus:outline-none resize-none"
                  />
                  <div className="flex items-center justify-between gap-2 px-2 sm:px-3 pb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUseTypedMode(false);
                        setQuestionExpanded(true);
                      }}
                      className="text-[11px] text-ink-secondary hover:text-ink px-2 py-1.5 min-h-[44px] sm:min-h-[36px] cursor-pointer"
                    >
                      Use voice
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="hidden sm:inline text-[10px] text-ink-secondary">
                        ⌘↵ to submit
                      </span>
                      <button
                        type="submit"
                        disabled={isEvaluating || !typedAnswer.trim()}
                        className="px-4 py-2 rounded-xl bg-accent-strong text-on-accent hover:bg-accent-strong/90 font-semibold text-xs transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer min-h-[44px] sm:min-h-[40px]"
                      >
                        {isEvaluating ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Evaluating...</span>
                          </>
                        ) : (
                          <>
                            <span>Submit Answer</span>
                            <Send className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
