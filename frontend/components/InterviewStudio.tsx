"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Orb, OrbState } from "./Orb";
import { speechSynth, AudioRecorder, NeuralVoice, FALLBACK_NEURAL_VOICES } from "@/lib/speech";
import { api, InterviewSession, InterviewTurn } from "@/lib/api";
import {
  Mic,
  Square,
  Volume2,
  VolumeX,
  Send,
  Code2,
  Sparkles,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Settings2,
  ArrowLeft,
  CheckCircle2,
  Radio,
  Keyboard,
  PlayCircle,
  HelpCircle,
  X,
  RefreshCw,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InterviewStudioProps {
  initialSession: InterviewSession;
  initialTurn: InterviewTurn;
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

  // Recording & Direct Hands-Free Submission
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [liveTranscriptPreview, setLiveTranscriptPreview] = useState<string>("");
  const [scratchpadOpen, setScratchpadOpen] = useState<boolean>(false);
  const [scratchpadText, setScratchpadText] = useState<string>("");
  const [useTypedMode, setUseTypedMode] = useState<boolean>(false);
  const [typedAnswer, setTypedAnswer] = useState<string>("");

  // Practice Mode Options & Instant Feedback
  const [turnEvaluation, setTurnEvaluation] = useState<any>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  // Modals & Errors
  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recorderRef = useRef<AudioRecorder | null>(null);
  const timerRef = useRef<any>(null);

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

  // Speak question automatically when a new turn arrives
  useEffect(() => {
    if (currentTurn && currentTurn.question_text && !isMuted) {
      speakText(currentTurn.question_text);
    }
    return () => {
      speechSynth.stop();
      if (recorderRef.current) recorderRef.current.cancel();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentTurn.id, isMuted]);

  // Voice speech synthesis
  const speakText = async (text: string) => {
    setOrbState("speaking");
    await speechSynth.speak(
      text,
      { neuralVoiceId: selectedVoiceId, speed: voiceSpeed },
      () => setOrbState("idle"),
      () => setOrbState("idle")
    );
  };

  const handleStopSpeaking = () => {
    speechSynth.stop();
    setOrbState("idle");
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
    } catch (err: any) {
      setErrorMsg(err.message || "Could not access microphone. Please check browser permissions.");
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

      setOrbState("thinking");

      // 2. Submit turn answer with transcript for calibrated evaluation
      const res = await api.submitTurnAnswer(currentTurn.id, {
        original_transcript: text,
        corrected_transcript: text,
        is_voice: true,
        scratchpad_text: scratchpadOpen ? scratchpadText : undefined,
      });

      handleTurnResult(res);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to process turn answer. You can retry speaking or switch to typing.");
      setOrbState("idle");
    } finally {
      setIsEvaluating(false);
    }
  };

  // Submit typed response fallback
  const handleTypedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedAnswer.trim()) return;
    setErrorMsg(null);
    setOrbState("thinking");
    setIsEvaluating(true);

    try {
      const res = await api.submitTurnAnswer(currentTurn.id, {
        typed_answer: typedAnswer.trim(),
        is_voice: false,
        scratchpad_text: scratchpadOpen ? scratchpadText : undefined,
      });
      setTypedAnswer("");
      handleTurnResult(res);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit answer. Please retry.");
      setOrbState("idle");
    } finally {
      setIsEvaluating(false);
    }
  };

  // Handle Turn Result
  const handleTurnResult = (res: any) => {
    if (res.is_session_completed) {
      // Session fully finished -> Redirect to debrief
      router.push(`/interview/${session.id}/debrief`);
      return;
    }

    if (session.mode === "practice" && res.evaluated_turn?.evaluation) {
      // Show coaching turn feedback drawer
      setTurnEvaluation(res.evaluated_turn.evaluation);
      setOrbState("idle");
      // Cache next turn to advance after reviewing
      if (res.next_turn) {
        (window as any).__cachedNextTurn = res.next_turn;
      }
    } else if (res.next_turn) {
      // Realistic simulation: advance seamlessly
      setCurrentTurn(res.next_turn);
      setLiveTranscriptPreview("");
      setOrbState("idle");
    }
  };

  const handleAdvanceToNextTurn = () => {
    const next = (window as any).__cachedNextTurn;
    if (next) {
      setCurrentTurn(next);
      setTurnEvaluation(null);
      (window as any).__cachedNextTurn = null;
    } else {
      router.push(`/interview/${session.id}/debrief`);
    }
  };

  const handleEndSessionEarly = async () => {
    try {
      await api.endInterviewSession(session.id);
      router.push(`/interview/${session.id}/debrief`);
    } catch {
      router.push("/");
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const currentVoice = neuralVoices.find((v) => v.id === selectedVoiceId) || neuralVoices[0];
  const targetQuestions = session.blueprint?.target_questions || 5;

  return (
    <div
      className={cn(
        "min-h-screen bg-[#141416] text-[#F3F3F5] flex flex-col justify-between selection:bg-[#4F46E5] selection:text-white transition-all relative overflow-hidden font-sans",
        isFullscreen && "fixed inset-0 z-50 overflow-y-auto"
      )}
    >
      {/* Top Studio Control Bar (Calm Apple-grade charcoal & hairline border) */}
      <header className="relative z-20 border-b border-[#2A2A30] bg-[#141416]/95 backdrop-blur-md px-3 sm:px-8 py-2.5 sm:py-3.5 flex items-center justify-between">
        {/* Left: Exit & Context Breadcrumbs */}
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
          </div>
        </div>

        {/* Right: Neural Voice Settings & Studio Controls */}
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

            {/* Voice Dropdown Drawer */}
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

                {/* Speed Slider */}
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

      {/* Main Studio Body (Apple layout: responsive, comfortable margins) */}
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
          <div className="flex items-center justify-center gap-2">
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

          {/* Replay Audio Button */}
          <div className="flex items-center justify-center pt-0.5">
            <button
              onClick={() => speakText(currentTurn.question_text)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#26262B] hover:bg-[#2E2E35] border border-[#383842] text-slate-300 text-xs transition cursor-pointer min-h-[36px]"
            >
              <Volume2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Replay Question</span>
            </button>
          </div>
        </div>

        {/* Practice Mode Coaching Feedback Modal / Drawer */}
        {turnEvaluation && (
          <div className="w-full p-6 rounded-3xl bg-[#1C1C1F] border border-[#2E2E35] space-y-4 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#2E2E35]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-white">Turn Assessment Score</span>
              </div>
              <div className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                {turnEvaluation.overall_score || "4.0"} / 5.0
              </div>
            </div>

            {turnEvaluation.missing_points && turnEvaluation.missing_points.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider">Key Gaps / Missing Points:</span>
                <ul className="text-xs text-slate-300 list-disc list-inside space-y-1">
                  {turnEvaluation.missing_points.map((pt: string, idx: number) => (
                    <li key={idx}>{pt}</li>
                  ))}
                </ul>
              </div>
            )}

            {turnEvaluation.stronger_answer && (
              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 text-xs text-slate-300 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Recommended Coaching Answer:</span>
                <p className="leading-relaxed">{turnEvaluation.stronger_answer}</p>
              </div>
            )}

            <button
              onClick={handleAdvanceToNextTurn}
              className="w-full py-3 rounded-2xl bg-white hover:bg-slate-100 text-black font-semibold text-xs transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Continue to Next Question</span>
              <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
            </button>
          </div>
        )}

        {/* Technical Scratchpad (Expandable) */}
        {scratchpadOpen && (
          <div className="w-full p-4 rounded-3xl bg-[#1C1C1F] border border-[#2E2E35] space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-200">Scratchpad (Architecture & Code Thoughts)</span>
              <button onClick={() => setScratchpadOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              rows={4}
              value={scratchpadText}
              onChange={(e) => setScratchpadText(e.target.value)}
              placeholder="Jot down time complexity, algorithm steps, or system design trade-offs here..."
              className="w-full p-3 bg-black/40 border border-white/10 rounded-2xl text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-white/30 resize-none"
            />
          </div>
        )}

        {/* Primary Interaction Controls (Siri-grade Voice & Dictation UX) */}
        {!turnEvaluation && (
          <div className="w-full max-w-md mx-auto flex flex-col items-center gap-2.5">
            {!useTypedMode ? (
              // Voice Answering Mode
              <div className="w-full flex flex-col items-center gap-2.5">
                <div className="w-full flex justify-center">
                  {!isRecording ? (
                    // Start Speaking Button (Comfortable 48-52px touch target)
                    <button
                      onClick={startRecording}
                      disabled={isEvaluating}
                      className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 rounded-full bg-white hover:bg-slate-100 text-black font-semibold text-xs sm:text-sm transition-all duration-150 shadow-md hover:shadow-lg flex items-center justify-center gap-2.5 cursor-pointer min-h-[48px] sm:min-h-[52px]"
                    >
                      <Mic className="w-4 h-4 text-black shrink-0" />
                      <span>Click to Answer by Voice</span>
                    </button>
                  ) : (
                    // Active Recording Stop & Submit Button
                    <button
                      onClick={stopRecordingAndSubmit}
                      className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 rounded-full bg-[#1B6B50] hover:bg-[#155A43] text-white font-semibold text-xs sm:text-sm transition-all duration-150 shadow-md flex items-center justify-center gap-2.5 cursor-pointer min-h-[48px] sm:min-h-[52px] animate-pulse"
                    >
                      <Square className="w-4 h-4 fill-white text-white shrink-0" />
                      <span>Complete & Submit ({formatSeconds(recordingDuration)})</span>
                    </button>
                  )}
                </div>

                {isEvaluating && (
                  <div className="flex items-center gap-2 text-[11px] sm:text-xs text-slate-400 font-medium">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Transcribing voice and evaluating rubric...</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setUseTypedMode(true)}
                  className="text-[11px] text-slate-500 hover:text-slate-300 transition flex items-center gap-1.5 cursor-pointer min-h-[38px] px-3"
                >
                  <Keyboard className="w-3 h-3" />
                  <span>Switch to Typed Text Answer</span>
                </button>
              </div>
            ) : (
              // Typed Fallback Mode
              <form onSubmit={handleTypedSubmit} className="w-full space-y-2">
                <div className="relative">
                  <textarea
                    rows={3}
                    required
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    placeholder="Type your structured answer here (trade-offs, approach, edge cases)..."
                    className="w-full p-3.5 sm:p-4 bg-[#1C1C1F] border border-[#2E2E35] rounded-2xl text-base sm:text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-white/30 resize-none shadow-sm"
                  />
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setUseTypedMode(false)}
                      className="text-[11px] text-slate-400 hover:text-white px-2 py-1.5 min-h-[36px]"
                    >
                      Use Voice Instead
                    </button>
                    <button
                      type="submit"
                      disabled={isEvaluating || !typedAnswer.trim()}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-black font-semibold text-xs transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer min-h-[40px]"
                    >
                      {isEvaluating ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Scoring...</span>
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
              <h3 className="text-base font-semibold text-white">Conclude Session Early?</h3>
              <p className="text-xs text-slate-400 leading-relaxed mt-1">
                Your completed turns will be scored and compiled into a partial debrief report so you never lose progress.
              </p>
            </div>
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => setShowEndModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#2E2E35] text-slate-300 text-xs font-medium hover:bg-white/[0.04] transition cursor-pointer"
              >
                Continue Round
              </button>
              <button
                onClick={handleEndSessionEarly}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition cursor-pointer"
              >
                Conclude & Debrief
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
