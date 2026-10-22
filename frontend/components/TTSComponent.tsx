"use client";

import React, { useState, useRef } from "react";
import { Volume2, Play, Square, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TTSComponentProps {
  className?: string;
}

export const TTSComponent: React.FC<TTSComponentProps> = ({ className }) => {
  const [text, setText] = useState<string>("Welcome to your mock interview. Can you explain how database indexes work under the hood?");
  const [voice, setVoice] = useState<string>("en-US-EmmaNeural");
  const [loading, setLoading] = useState<boolean>(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleGenerateVoice = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
      const response = await fetch(`${apiBase}/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text.trim(),
          voice: voice,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate audio (${response.status})`);
      }

      // Process the MP3 file binary blob from FastAPI
      const audioBlob = await response.blob();
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      // Auto-play audio
      const audio = new Audio(url);
      audioRef.current = audio;
      await audio.play();
    } catch (err: any) {
      console.error("Error fetching TTS:", err);
      setError(err.message || "Error occurred while generating the voice.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("p-6 rounded-3xl bg-slate-900 border border-slate-800 text-slate-100 shadow-xl space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center text-white shadow-sm">
            <Volume2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-100">
              Free Testing TTS Engine (Edge API)
            </h3>
            <p className="text-[11px] text-slate-400">Zero-Key Natural Neural Voice Testing</p>
          </div>
        </div>

        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          Active: {voice}
        </span>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Interview Text to Synthesize
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type something to test your Next.js play button..."
          rows={3}
          className="w-full p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500 resize-none leading-relaxed"
        />
      </div>

      {error && (
        <div className="p-3 bg-rose-950/50 border border-rose-800 text-rose-300 text-xs rounded-xl">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <button
          onClick={handleGenerateVoice}
          disabled={loading || !text.trim()}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition shadow-md cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Synthesizing...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Test Play Audio</span>
            </>
          )}
        </button>

        {audioUrl && (
          <audio controls src={audioUrl} className="h-8 max-w-[240px]">
            Your browser does not support the audio element.
          </audio>
        )}
      </div>
    </div>
  );
};

export default TTSComponent;
