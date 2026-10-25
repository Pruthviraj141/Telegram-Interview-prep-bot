"use client";

import React, { useState, useRef } from "react";
import { Volume2, Play, Square, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getApiBase } from "@/lib/api";

interface TTSComponentProps {
  className?: string;
}

export const TTSComponent: React.FC<TTSComponentProps> = ({ className }) => {
  const [text, setText] = useState<string>("Welcome to your mock interview round. Can you explain how database indexes work under the hood?");
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
      const apiBase = getApiBase();
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

      const audioBlob = await response.blob();
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      const audio = new Audio(url);
      audioRef.current = audio;
      await audio.play();
    } catch (err: any) {
      console.error("Error fetching TTS:", err);
      setError(err.message || "Error occurred while synthesizing voice.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("p-6 sm:p-8 rounded-2xl sm:rounded-3xl bg-white border border-[#E6E6E4] text-[#202124] shadow-xs space-y-4", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E6E6E4]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#F7F7F5] border border-[#E6E6E4] flex items-center justify-center text-[#202124]">
            <Volume2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#202124] tracking-tight">
              Voice Preview
            </h3>
            <p className="text-[11px] text-slate-500">Test voice output before your interview</p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-slate-700">
          Sample Prompt
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type an interview prompt to test voice timbre..."
          rows={3}
          className="w-full p-3.5 rounded-xl bg-[#F7F7F5] border border-[#E6E6E4] text-xs text-[#202124] focus:outline-none focus:ring-1 focus:ring-[#202124] resize-none leading-relaxed"
        />
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-semibold text-slate-600">Voice:</label>
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-[#E6E6E4] text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#202124]"
          >
            <option value="en-US-EmmaNeural">Emma (US • Female Recruiter)</option>
            <option value="en-US-ChristopherNeural">Christopher (US • Senior Systems Lead)</option>
            <option value="en-US-JennyNeural">Jenny (US • Natural & Warm)</option>
            <option value="en-US-GuyNeural">Guy (US • Conversational Tech)</option>
            <option value="en-GB-SoniaNeural">Sonia (UK • British Professional)</option>
            <option value="en-IN-NeerjaNeural">Neerja (India • Global Talent)</option>
          </select>
        </div>

        <button
          onClick={handleGenerateVoice}
          disabled={loading || !text.trim()}
          className="px-5 py-2.5 bg-[#202124] hover:bg-[#111113] text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer min-h-[38px]"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Playing Voice...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-white text-white" />
              <span>Play Sample</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
