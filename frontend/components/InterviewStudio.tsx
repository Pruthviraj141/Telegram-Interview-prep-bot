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
  X
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

  // Voice Settings (Neural Voices)
  const [neuralVoices, setNeuralVoices] = useState<NeuralVoice[]>(FALLBACK_NEURAL_VOICES);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("en-US-ChristopherNeural");
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

  // Practice Mode Options
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [showPracticeFeedback, setShowPracticeFeedback] = useState<boolean>(false);
  const [turnEvaluation, setTurnEvaluation] = useState<any>(null);

  // Modals & Errors
  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recorderRef = useRef<AudioRecorder | null>(null);
  const timerRef = useRef<any>(null);

  // Load available neural voices
  useEffect(() => {
    const voices = speechSynth.getNeuralVoices();
    if (voices && voices.length > 0) {
      setNeuralVoices(voices);
    }
  }, []);

  // Speak question automatically when a new turn starts
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
      setErrorMsg(err.message || "Microphone access blocked. You can type your answer below.");
      setOrbState("error");
    }
  };

  // 1-Click Done Speaking -> DIRECT SUBMIT TO AI (No confirmation modal/rechecking needed)
  const stopRecordingAndSubmit = async () => {
    if (!recorderRef.current) return;
    setIsRecording(false);
    setAudioVolume(0);
    clearInterval(timerRef.current);
    setOrbState("transcribing");

    try {
      const audioBlob = await recorderRef.current.stop();

      // Transient in-memory transcription via Whisper (never persisted)
      const res = await api.transcribeAudio(audioBlob);
      const recognizedText = res.transcript?.trim();

      if (!recognizedText || recognizedText.length < 2) {
        setErrorMsg("Didn't catch any audio. Please click 'Speak Answer' again.");
        setOrbState("idle");
        return;
      }

      setLiveTranscriptPreview(recognizedText);
      // Immediately submit answer directly to AI!
      await submitAnswerDirectly(recognizedText, true);
    } catch (err: any) {
      setErrorMsg(err.message || "Voice processing failed. Please retry or type answer.");
      setOrbState("error");
    }
  };

  // Submit Answer Directly to AI Engine
  const submitAnswerDirectly = async (answerText: string, fromVoice: boolean = true) => {
    handleStopSpeaking();
    setOrbState("thinking");
    setErrorMsg(null);

    try {
      const res = await api.submitTurnAnswer(currentTurn.id, {
        original_transcript: fromVoice ? answerText : undefined,
        corrected_transcript: fromVoice ? answerText : undefined,
        typed_answer: !fromVoice ? answerText : undefined,
        is_voice: fromVoice,
        scratchpad_text: scratchpadText || undefined,
      });

      const evalData = res.evaluated_turn.evaluation;
      setTurnEvaluation(evalData);

      // Check if session completed
      if (res.is_session_completed) {
        router.push(`/interview/${session.id}/debrief`);
        return;
      }

      // Practice Mode handling
      if (session.mode === "practice" && !autoAdvance) {
        setShowPracticeFeedback(true);
        setOrbState("idle");
        if (evalData?.spoken_coaching_summary && !isMuted) {
          speakText(evalData.spoken_coaching_summary);
        }
      } else {
        // Continuous Direct Interview: Next turn begins immediately
        if (res.next_turn) {
          setCurrentTurn(res.next_turn);
          setLiveTranscriptPreview("");
          setTypedAnswer("");
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to analyze answer with AI.");
      setOrbState("error");
    }
  };

  // Manual next turn button for practice mode feedback view
  const handleContinueNextTurn = async () => {
    setShowPracticeFeedback(false);
    setLiveTranscriptPreview("");
    setTypedAnswer("");
    handleStopSpeaking();

    const updated = await api.getInterviewSession(session.id);
    const turns = updated.turns || [];
    const last = turns[turns.length - 1];

    if (updated.session.status === "completed" || turns.length >= (session.blueprint?.target_questions || 5)) {
      router.push(`/interview/${session.id}/debrief`);
    } else if (last && last.id !== currentTurn.id) {
      setCurrentTurn(last);
    }
  };

  const handleConfirmEndEarly = async () => {
    handleStopSpeaking();
    if (recorderRef.current) recorderRef.current.cancel();
    try {
      await api.endInterviewSession(session.id);
      router.push(`/interview/${session.id}/debrief`);
    } catch {
      router.push(`/interview/${session.id}/debrief`);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const currentVoice = neuralVoices.find((v) => v.id === selectedVoiceId) || neuralVoices[0];

  return (
    <div
      className={cn(
        "min-h-screen bg-[#090D16] text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white transition-all relative overflow-hidden font-sans",
        isFullscreen && "fixed inset-0 z-50 overflow-y-auto"
      )}
    >
      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Studio Control Bar */}
      <header className="relative z-20 border-b border-slate-800/80 bg-[#0B0F1C]/90 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        {/* Left: Exit & Context Breadcrumbs */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowEndModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 text-xs font-semibold transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exit Session</span>
          </button>

          <div className="h-4 w-px bg-slate-800" />

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-200">
                {session.blueprint?.target_role || session.target_role || "Interview"}
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                {session.mode === "realistic" ? "Realistic Simulation" : "Practice Mode"}
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              Question {currentTurn.turn_index + 1} of {session.blueprint?.target_questions || 5} • {currentTurn.category}
            </span>
          </div>
        </div>

        {/* Right: Voice Settings & Controls */}
        <div className="flex items-center gap-2.5">
          {/* Voice Selector Pill */}
          <div className="relative">
            <button
              onClick={() => setShowVoiceSettings(!showVoiceSettings)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 text-xs font-medium text-slate-300 transition"
              title="Change interviewer neural voice"
            >
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden md:inline">{currentVoice?.name || "Neural Voice"}</span>
              <Settings2 className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </button>

            {/* Voice Dropdown Drawer */}
            {showVoiceSettings && (
              <div className="absolute right-0 mt-2 w-72 p-3 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Interviewer Voice</span>
                  <button onClick={() => setShowVoiceSettings(false)} className="text-slate-400 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {neuralVoices.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setSelectedVoiceId(v.id);
                        setShowVoiceSettings(false);
                        speechSynth.speak(`Hello, I am ${v.name}. Let's continue your interview.`, { neuralVoiceId: v.id, speed: voiceSpeed });
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-xl text-xs transition flex items-center justify-between",
                        selectedVoiceId === v.id
                          ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/40"
                          : "hover:bg-slate-800/80 text-slate-300"
                      )}
                    >
                      <div>
                        <div className="font-semibold">{v.name}</div>
                        <div className="text-[10px] text-slate-400">{v.style}</div>
                      </div>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{v.tag}</span>
                    </button>
                  ))}
                </div>

                {/* Speed Slider */}
                <div className="pt-2 border-t border-slate-800">
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
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Mute Button */}
          <button
            onClick={() => {
              if (!isMuted) handleStopSpeaking();
              setIsMuted(!isMuted);
            }}
            className={cn(
              "p-2 rounded-xl border text-xs font-medium transition",
              isMuted
                ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                : "bg-slate-800/70 border-slate-700/60 text-slate-300 hover:bg-slate-700/80"
            )}
            title={isMuted ? "Unmute AI Voice" : "Mute AI Voice"}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Technical Scratchpad */}
          <button
            onClick={() => setScratchpadOpen(!scratchpadOpen)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition",
              scratchpadOpen
                ? "bg-indigo-600 text-white border-indigo-500 shadow-xs"
                : "bg-slate-800/70 border-slate-700/60 text-slate-300 hover:bg-slate-700/80"
            )}
            title="Technical Notes & Code Scratchpad"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Notes</span>
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 transition"
            title="Toggle Fullscreen Studio"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Center Stage: Interviewer Orb & Question */}
      <main className="relative z-10 flex-1 max-w-4xl w-full mx-auto px-4 py-8 flex flex-col items-center justify-between gap-6">
        {/* Error Alert */}
        {errorMsg && (
          <div className="w-full p-4 rounded-2xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white text-xs underline ml-4">
              Dismiss
            </button>
          </div>
        )}

        {/* Interviewer Glowing Orb */}
        <div className="py-4 flex flex-col items-center">
          <Orb state={orbState} size="xl" volume={audioVolume} />
        </div>

        {/* Current Question Card */}
        <div className="w-full bg-[#0D1322]/90 border border-slate-800/80 rounded-3xl p-6 sm:p-8 backdrop-blur-md shadow-2xl text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <span className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[11px] font-bold uppercase tracking-wider">
              {currentTurn.category}
            </span>
            {currentTurn.is_follow_up && (
              <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[11px] font-bold uppercase tracking-wider">
                Follow-Up Question
              </span>
            )}
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-slate-100 leading-snug tracking-tight max-w-2xl mx-auto">
            {currentTurn.question_text}
          </h2>

          {/* Re-play voice question button */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              onClick={() => speakText(currentTurn.question_text)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 text-slate-400 hover:text-slate-200 text-xs transition"
            >
              <Volume2 className="w-3 h-3 text-cyan-400" />
              <span>Replay Question</span>
            </button>
          </div>
        </div>

        {/* Live Answer Feedback preview (if transcribing or practice review) */}
        {liveTranscriptPreview && (
          <div className="w-full p-4 rounded-2xl bg-indigo-950/40 border border-indigo-800/50 text-indigo-200 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-indigo-400">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Transcribed Answer (Submitted Directly to AI)</span>
            </div>
            <p className="text-slate-300 italic line-clamp-3">"{liveTranscriptPreview}"</p>
          </div>
        )}

        {/* Practice Mode Instant Feedback Modal/Drawer */}
        {showPracticeFeedback && turnEvaluation && (
          <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-sm text-slate-200">Immediate Turn Evaluation</span>
              </div>
              <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300">
                Score: {turnEvaluation.overall_turn_score}/5
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {turnEvaluation.spoken_coaching_summary}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={handleContinueNextTurn}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition"
              >
                Continue to Next Question &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Typed Answer Mode (Alternative to voice) */}
        {useTypedMode && (
          <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-6 space-y-3 shadow-xl">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold">Type your response below:</span>
              <button onClick={() => setUseTypedMode(false)} className="text-indigo-400 hover:underline">
                Switch to Voice
              </button>
            </div>
            <textarea
              rows={4}
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              placeholder="Structure your answer using STAR method or architectural trade-offs..."
              className="w-full p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-slate-200 placeholder:text-slate-600 text-xs focus:outline-hidden focus:border-indigo-500"
            />
            <div className="flex justify-end">
              <button
                onClick={() => submitAnswerDirectly(typedAnswer, false)}
                disabled={!typedAnswer.trim()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition shadow-xs"
              >
                <Send className="w-3.5 h-3.5" /> Submit to AI
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Action Dock: SEAMLESS HANDS-FREE VOICE CONTROL */}
      <footer className="relative z-20 border-t border-slate-800/80 bg-[#0B0F1C]/95 backdrop-blur-md p-4 sm:p-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Mode helper note */}
          <div className="text-center sm:text-left">
            <div className="text-xs font-semibold text-slate-300">
              {isRecording ? "Listening to your answer..." : "Ready for your answer"}
            </div>
            <div className="text-[11px] text-slate-500">
              {isRecording
                ? `Recording: ${formatSeconds(recordingDuration)} • Tap Finish Answer when done`
                : "Tap Speak Answer to reply naturally like a real interview"}
            </div>
          </div>

          {/* Primary Voice Action Button */}
          <div className="flex items-center gap-3">
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={orbState === "thinking" || orbState === "transcribing"}
                className="group relative flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <Mic className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span>Speak Answer</span>
              </button>
            ) : (
              <button
                onClick={stopRecordingAndSubmit}
                className="flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm shadow-lg shadow-emerald-600/40 animate-pulse transition-all"
              >
                <Square className="w-4 h-4 fill-white" />
                <span>Done Speaking — Send to AI</span>
              </button>
            )}

            {/* Toggle Typed Mode */}
            <button
              onClick={() => setUseTypedMode(!useTypedMode)}
              className={cn(
                "p-3.5 rounded-2xl border transition",
                useTypedMode
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-slate-200"
              )}
              title="Type response instead of speaking"
            >
              <Keyboard className="w-4 h-4" />
            </button>
          </div>
        </div>
      </footer>

      {/* Technical Scratchpad Drawer */}
      {scratchpadOpen && (
        <aside className="fixed inset-y-0 right-0 w-80 sm:w-96 bg-[#0E1322] border-l border-slate-800 shadow-2xl z-50 p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-sm text-slate-200">Technical Scratchpad</span>
              </div>
              <button onClick={() => setScratchpadOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Draft pseudocode, formulas, or system design trade-offs. The AI will evaluate this alongside your spoken answer.
            </p>
            <textarea
              rows={16}
              value={scratchpadText}
              onChange={(e) => setScratchpadText(e.target.value)}
              placeholder="e.g.&#10;class LRUCache:&#10;  def __init__(self, capacity):&#10;    ...&#10;&#10;Tradeoffs: O(1) get & put using Hashmap + Doubly Linked List"
              className="w-full p-3 font-mono text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-hidden focus:border-indigo-500 resize-none"
            />
          </div>
          <button
            onClick={() => setScratchpadOpen(false)}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            Keep & Close Scratchpad
          </button>
        </aside>
      )}

      {/* Early End Confirmation Modal */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">Conclude Interview Early?</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                You can generate a partial debrief scorecard based on the answers you have given so far. Raw audio is never saved.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowEndModal(false)}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                Resume Interview
              </button>
              <button
                onClick={handleConfirmEndEarly}
                className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-xs"
              >
                End & View Debrief
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
