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
import { cn, getErrorMessage } from "@/lib/utils";

interface InterviewStudioProps {
  initialSession: InterviewSession;
  initialTurn: InterviewTurn;
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

export const InterviewStudio: React.FC<InterviewStudioProps> = ({ initialSession, initialTurn }) => {
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
  const [typedAnswer, setTypedAnswer] = useState<string>("");

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

  const recorderRef = useRef<AudioRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isPractice = session.mode === "practice";

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
    setTypedAnswer("");
    setLiveTranscriptPreview("");
    setUseTypedMode(false);
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
        router.push(`/interview/${session.id}/debrief`);
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

  // Submit typed response fallback
  const handleTypedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const answer = typedAnswer.trim();
    if (!answer) return;
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
      setTypedAnswer("");
      handleTurnResult(res);
    } catch (err: unknown) {
      setOrbState("idle");
      handleSubmissionError(err, answer, "Failed to submit answer. Please retry.");
    } finally {
      setIsEvaluating(false);
    }
  };

  // Handle Turn Result
  const handleTurnResult = (res: {
    evaluated_turn: InterviewTurn;
    next_turn: InterviewTurn | null;
    is_session_completed: boolean;
  }) => {
    setOrbState("idle");

    if (res.is_session_completed) {
      router.push(`/interview/${session.id}/debrief`);
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
      router.push(`/interview/${session.id}/debrief`);
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
      await api.endInterviewSession(session.id);
      router.push(`/interview/${session.id}/debrief`);
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
  const showProvenance = Boolean(currentTurn.provenance?.note || currentTurn.source_basis || hasSources);

  const scoreDisplay =
    typeof turnEvaluation?.overall_score === "number"
      ? `${turnEvaluation.overall_score.toFixed(1)} / 5.0`
      : "Not scored";

  return (
    <div
      className={cn(
        "min-h-screen bg-[#141416] text-[#F3F3F5] flex flex-col justify-between selection:bg-[#C4744B] selection:text-white transition-all relative overflow-hidden font-sans",
        isFullscreen && "fixed inset-0 z-50 overflow-y-auto"
      )}
    >
      {/* Top Studio Control Bar */}
      <header className="relative z-20 border-b border-[#2A2A30] bg-[#141416]/95 backdrop-blur-md px-3 sm:px-8 py-2.5 sm:py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => setShowEndModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-xl bg-[#1E1E22] hover:bg-[#26262B] border border-[#2E2E35] text-slate-300 text-xs font-medium transition cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exit</span>
          </button>

          <div className="h-4 w-px bg-[#2E2E35] shrink-0" />

          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="text-xs font-semibold text-white tracking-tight truncate max-w-[120px] xs:max-w-[160px] sm:max-w-none">
              {session.blueprint?.target_role || session.target_role || "Interview"}
            </span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-300 border border-white/10 shrink-0">
              Q{currentTurn.turn_index + 1}/{targetQuestions}
            </span>
            <span className="hidden sm:inline text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-300 border border-white/10 shrink-0 capitalize">
              {session.mode}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Voice Selector Pill */}
          <div className="relative">
            <button
              onClick={() => setShowVoiceSettings(!showVoiceSettings)}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-3 rounded-xl bg-[#1E1E22] hover:bg-[#26262B] border border-[#2E2E35] text-xs font-medium text-slate-300 transition cursor-pointer"
              title="Change neural voice"
            >
              <Volume2 className="w-3.5 h-3.5 text-slate-300" />
              <span className="hidden md:inline">{currentVoice?.name || "Neural Voice"}</span>
              <Settings2 className="w-3 h-3 text-slate-500 ml-0.5" />
            </button>

            {showVoiceSettings && (
              <div className="absolute right-0 mt-2 w-72 p-3 bg-[#1E1E22] border border-[#2E2E35] rounded-2xl shadow-2xl z-50 space-y-3 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between pb-2 border-b border-[#2E2E35]">
                  <span className="text-xs font-semibold text-white tracking-tight">Neural Recruiter Voice</span>
                  <button onClick={() => setShowVoiceSettings(false)} className="text-slate-400 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1 max-h-56 overflow-y-auto studio-scroll">
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
                          ? "bg-white/[0.08] text-white border border-white/20 font-medium"
                          : "hover:bg-white/[0.04] text-slate-400 hover:text-slate-200"
                      )}
                    >
                      <div>
                        <div className="font-medium text-white">{v.name}</div>
                        <div className="text-[10px] text-slate-400">{v.style}</div>
                      </div>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-black/40 text-slate-400">{v.tag}</span>
                    </button>
                  ))}
                </div>

                <div className="pt-2 border-t border-[#2E2E35]">
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
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
                    className="w-full accent-white cursor-pointer"
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
              "w-8 h-8 rounded-xl border text-xs flex items-center justify-center transition cursor-pointer",
              isMuted
                ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                : "bg-[#1E1E22] border-[#2E2E35] text-slate-300 hover:bg-[#26262B]"
            )}
            title={isMuted ? "Unmute AI Voice" : "Mute AI Voice"}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          {/* Technical Scratchpad */}
          <button
            onClick={() => setScratchpadOpen(!scratchpadOpen)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-xl border text-xs font-medium transition cursor-pointer",
              scratchpadOpen
                ? "bg-white text-black border-white shadow-xs"
                : "bg-[#1E1E22] border-[#2E2E35] text-slate-300 hover:bg-[#26262B]"
            )}
            title="Technical Notes & Architecture Scratchpad"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Scratchpad</span>
          </button>

          {/* Fullscreen Toggle (desktop only) */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="hidden sm:flex w-8 h-8 rounded-xl bg-[#1E1E22] hover:bg-[#26262B] border border-[#2E2E35] text-slate-300 items-center justify-center transition cursor-pointer"
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
          <div className="w-full p-3 sm:p-4 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="truncate">{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white text-xs underline ml-3 shrink-0 cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

        {/* Centerpiece: Calm Apple Intelligence Orb */}
        <div className="py-1 sm:py-2 flex flex-col items-center">
          <Orb state={orbState} size="xl" volume={audioVolume} />
        </div>

        {/* Interviewer Question Module */}
        <div className="w-full bg-[#1C1C1F] border border-[#2E2E35] rounded-2xl sm:rounded-3xl p-4 sm:p-7 shadow-lg text-center space-y-3 sm:space-y-4">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-slate-300 text-[10px] font-semibold uppercase tracking-wider">
              {currentTurn.category}
            </span>
            {currentTurn.is_follow_up && (
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-semibold uppercase tracking-wider">
                Follow-Up Probe
              </span>
            )}
          </div>

          <h2 className="text-sm sm:text-xl font-medium sm:font-semibold text-white leading-relaxed tracking-tight max-w-2xl mx-auto">
            {currentTurn.question_text}
          </h2>

          {/* Replay / Play Audio Button */}
          <div className="flex flex-col items-center justify-center pt-0.5 gap-2">
            {autoplayBlocked ? (
              <button
                onClick={() => {
                  speechSynth.unlockAudio();
                  speakText(currentTurn.question_text);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FAF2ED] hover:bg-[#F3E3D7] text-[#B3582A] text-xs font-semibold shadow-md transition cursor-pointer animate-bounce"
              >
                <Volume2 className="w-4 h-4 text-[#B3582A]" />
                <span>Tap to Hear Question</span>
              </button>
            ) : (
              <button
                onClick={() => speakText(currentTurn.question_text)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#26262B] hover:bg-[#2E2E35] border border-[#383842] text-slate-300 text-xs transition cursor-pointer min-h-[36px]"
              >
                <Volume2 className="w-3.5 h-3.5 text-slate-400" />
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#26262B] hover:bg-[#2E2E35] border border-[#383842] text-slate-300 text-xs transition cursor-pointer min-h-[36px]"
                >
                  <Lightbulb className="w-3.5 h-3.5 text-amber-300" />
                  <span>Show rubric guidance</span>
                </button>
              ) : (
                <div className="text-left p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                    <Lightbulb className="w-3 h-3" />
                    <span>Rubric guidance — not a model answer</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{hintText}</p>
                  <p className="text-[10px] text-slate-500">Using a hint is recorded in your practice assistance log.</p>
                </div>
              )}
            </div>
          )}

          {/* Honest provenance / source panel */}
          {showProvenance && (
            <details className="text-left pt-1 group">
              <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition">
                <BookOpen className="w-3 h-3" />
                <span>Where this question comes from</span>
              </summary>
              <div className="mt-2 p-3 rounded-xl bg-black/30 border border-white/5 space-y-2">
                <p className="text-[11px] text-slate-300 leading-relaxed">{honestProvenanceNote(currentTurn)}</p>
                {currentTurn.source_basis && (
                  <p className="text-[10px] text-slate-400">
                    Basis: {SOURCE_BASIS_LABELS[currentTurn.source_basis] || currentTurn.source_basis}
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
                          className="inline-flex items-start gap-1.5 text-[11px] text-slate-300 hover:text-white underline decoration-slate-600 underline-offset-2"
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
          <div className="w-full p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#1C1C1F] border border-[#2E2E35] space-y-4 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#2E2E35]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-white">Feedback on this answer</span>
              </div>
              <div className="px-2.5 py-0.5 rounded-full bg-[#FAF2ED]/15 border border-[#C4744B]/30 text-[#EED9CC] text-xs font-bold">
                {scoreDisplay}
              </div>
            </div>

            {turnEvaluation.evidence_quote && (
              <div className="text-xs text-slate-300 space-y-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">From your answer</span>
                <blockquote className="border-l-2 border-[#C4744B]/50 pl-3 italic text-slate-300">
                  “{turnEvaluation.evidence_quote}”
                </blockquote>
              </div>
            )}

            {turnEvaluation.missing_points && turnEvaluation.missing_points.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-[#EED9CC] tracking-tight">Key points to mention:</span>
                <ul className="text-xs text-slate-300 list-disc list-inside space-y-1">
                  {turnEvaluation.missing_points.map((pt: string, idx: number) => (
                    <li key={idx}>{pt}</li>
                  ))}
                </ul>
              </div>
            )}

            {turnEvaluation.misconceptions && turnEvaluation.misconceptions.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-amber-300 tracking-tight">What to correct:</span>
                <ul className="text-xs text-slate-300 list-disc list-inside space-y-1">
                  {turnEvaluation.misconceptions.map((pt: string, idx: number) => (
                    <li key={idx}>{pt}</li>
                  ))}
                </ul>
              </div>
            )}

            {turnEvaluation.stronger_answer && (
              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 text-xs text-slate-300 space-y-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">A stronger answer</span>
                <p className="leading-relaxed text-slate-200">{turnEvaluation.stronger_answer}</p>
                {turnEvaluation.why_its_stronger && (
                  <p className="text-[11px] text-slate-400 leading-relaxed">{turnEvaluation.why_its_stronger}</p>
                )}
              </div>
            )}

            {(retryMessage || disputeMessage) && (
              <p className="text-[11px] text-slate-400 leading-relaxed">{retryMessage || disputeMessage}</p>
            )}

            {/* Retry / dispute forms (practice only) */}
            {showRetryForm && (
              <form onSubmit={handleRetry} className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-300">Your corrected answer</label>
                <textarea
                  rows={3}
                  required
                  value={retryAnswerText}
                  onChange={(e) => setRetryAnswerText(e.target.value)}
                  placeholder="Rewrite your answer using the feedback above..."
                  className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-base sm:text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-white/30 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRetryForm(false)}
                    className="flex-1 py-2 rounded-xl border border-[#2E2E35] text-slate-300 text-xs font-medium hover:bg-white/[0.04] transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isRetrying || !retryAnswerText.trim()}
                    className="flex-1 py-2 rounded-xl bg-white hover:bg-slate-100 text-black text-xs font-semibold transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isRetrying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    <span>{isRetrying ? "Re-evaluating..." : "Retry answer"}</span>
                  </button>
                </div>
              </form>
            )}

            {showDisputeForm && (
              <form onSubmit={handleDispute} className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-300">
                  What did the feedback miss or misread?
                </label>
                <textarea
                  rows={3}
                  required
                  value={disputeText}
                  onChange={(e) => setDisputeText(e.target.value)}
                  placeholder="Explain the point you actually made, or correct a transcription error..."
                  className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-base sm:text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-white/30 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDisputeForm(false)}
                    className="flex-1 py-2 rounded-xl border border-[#2E2E35] text-slate-300 text-xs font-medium hover:bg-white/[0.04] transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDisputing || !disputeText.trim()}
                    className="flex-1 py-2 rounded-xl bg-white hover:bg-slate-100 text-black text-xs font-semibold transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
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
                className="flex-1 py-3 rounded-2xl bg-white hover:bg-slate-100 text-black font-semibold text-xs transition shadow-sm flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
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
                  className="py-3 px-4 rounded-2xl border border-[#2E2E35] text-slate-300 text-xs font-medium hover:bg-white/[0.04] transition cursor-pointer flex items-center justify-center gap-1.5"
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
                  className="py-3 px-4 rounded-2xl border border-[#2E2E35] text-slate-300 text-xs font-medium hover:bg-white/[0.04] transition cursor-pointer flex items-center justify-center gap-1.5"
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
          <div className="w-full p-4 rounded-2xl sm:rounded-3xl bg-[#1C1C1F] border border-[#2E2E35] space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-200">Scratchpad</span>
              <button onClick={() => setScratchpadOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              rows={3}
              value={scratchpadText}
              onChange={(e) => setScratchpadText(e.target.value)}
              placeholder="Notes, code, complexity trade-offs..."
              className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-base sm:text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-white/30 resize-none"
            />
            <p className="text-[10px] text-slate-500">Scratchpad use is recorded in your practice assistance log.</p>
          </div>
        )}

        {/* Primary Interaction Controls */}
        {!(isPractice && turnEvaluation) && (
          <div className="w-full max-w-md mx-auto flex flex-col items-center gap-2.5">
            {!useTypedMode ? (
              <div className="w-full flex flex-col items-center gap-2.5">
                <div className="w-full flex justify-center">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      disabled={isEvaluating}
                      className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 rounded-full bg-white hover:bg-slate-100 text-black font-semibold text-xs sm:text-sm transition shadow-sm flex items-center justify-center gap-2.5 cursor-pointer min-h-[48px] sm:min-h-[52px] disabled:opacity-50"
                    >
                      <Mic className="w-4 h-4 text-black shrink-0" />
                      <span>Answer by Voice</span>
                    </button>
                  ) : (
                    <button
                      onClick={stopRecordingAndSubmit}
                      className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 rounded-full bg-[#C4744B] hover:bg-[#B3582A] text-white font-semibold text-xs sm:text-sm transition shadow-sm flex items-center justify-center gap-2.5 cursor-pointer min-h-[48px] sm:min-h-[52px]"
                    >
                      <Square className="w-4 h-4 fill-white text-white shrink-0" />
                      <span>Submit Answer ({formatSeconds(recordingDuration)})</span>
                    </button>
                  )}
                </div>

                {isEvaluating && (
                  <div className="flex items-center gap-2 text-[11px] sm:text-xs text-slate-400 font-medium">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Evaluating answer...</span>
                  </div>
                )}

                {liveTranscriptPreview && (
                  <p className="text-[11px] text-slate-400 text-center max-w-md line-clamp-2">
                    Transcript: {liveTranscriptPreview}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setUseTypedMode(true)}
                  className="text-[11px] text-slate-500 hover:text-slate-300 transition flex items-center gap-1.5 cursor-pointer min-h-[38px] px-3"
                >
                  <Keyboard className="w-3 h-3" />
                  <span>Type answer instead</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleTypedSubmit} className="w-full space-y-2">
                <div className="relative">
                  <textarea
                    rows={3}
                    required
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    placeholder="Type your answer here..."
                    className="w-full p-3.5 sm:p-4 bg-[#1C1C1F] border border-[#2E2E35] rounded-2xl text-base sm:text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-white/30 resize-none shadow-sm"
                  />
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setUseTypedMode(false)}
                      className="text-[11px] text-slate-400 hover:text-white px-2 py-1.5 min-h-[36px]"
                    >
                      Use voice
                    </button>
                    <button
                      type="submit"
                      disabled={isEvaluating || !typedAnswer.trim()}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-black font-semibold text-xs transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer min-h-[40px]"
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
              </form>
            )}
          </div>
        )}
      </main>

      {/* Early Exit Confirmation Modal */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1C1C1F] border border-[#2E2E35] rounded-3xl p-6 sm:p-8 max-w-sm w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Wrap up this round early?</h3>
              <p className="text-xs text-slate-400 leading-relaxed mt-1">
                We will save your answers so far and prepare your feedback debrief. You will not lose any progress.
              </p>
            </div>
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => setShowEndModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#2E2E35] text-slate-300 text-xs font-medium hover:bg-white/[0.04] transition cursor-pointer"
              >
                Keep practicing
              </button>
              <button
                onClick={handleEndSessionEarly}
                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-black text-xs font-semibold transition cursor-pointer"
              >
                Save & view feedback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
