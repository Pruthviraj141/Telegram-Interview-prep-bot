"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type OrbState =
  | "idle"
  | "preflight"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "paused"
  | "error";

interface OrbProps {
  state: OrbState;
  size?: "sm" | "md" | "lg" | "xl";
  volume?: number; // 0 to 100 live audio loudness
  className?: string;
}

export const Orb: React.FC<OrbProps> = ({ state, size = "lg", volume = 0, className }) => {
  const sizeMap = {
    sm: "w-24 h-24",
    md: "w-36 h-36",
    lg: "w-52 h-52",
    xl: "w-64 h-64",
  };

  // Dynamic scale from voice volume
  const dynamicScale = state === "listening" && volume > 5
    ? 1 + (volume / 100) * 0.25
    : 1;

  const getOrbGradient = () => {
    switch (state) {
      case "listening":
        return "from-[#059669] via-[#10B981] to-[#34D399]";
      case "transcribing":
      case "thinking":
        return "from-[#4F46E5] via-[#818CF8] to-[#06B6D4]";
      case "speaking":
        return "from-[#0284C7] via-[#38BDF8] to-[#818CF8]";
      case "error":
        return "from-[#DC2626] via-[#EF4444] to-[#F87171]";
      case "paused":
        return "from-[#475569] via-[#64748B] to-[#94A3B8]";
      case "preflight":
        return "from-[#3B82F6] via-[#6366F1] to-[#8B5CF6]";
      case "idle":
      default:
        return "from-[#4338CA] via-[#6366F1] to-[#06B6D4]";
    }
  };

  const getStatusLabel = () => {
    switch (state) {
      case "listening":
        return "Listening to your answer...";
      case "transcribing":
        return "Transcribing audio instantly...";
      case "thinking":
        return "Analyzing answer & formulating response...";
      case "speaking":
        return "Interviewer speaking...";
      case "paused":
        return "Interview paused";
      case "preflight":
        return "Connecting studio...";
      case "error":
        return "Microphone or connection issue";
      case "idle":
      default:
        return "Ready — Click Speak when ready";
    }
  };

  return (
    <div className={cn("flex flex-col items-center justify-center select-none", className)}>
      <div className="relative flex items-center justify-center">
        {/* Dynamic Multi-Layer Ambient Halo */}
        <div
          style={{ transform: `scale(${dynamicScale * 1.15})` }}
          className={cn(
            "absolute rounded-full blur-3xl transition-all duration-300 pointer-events-none opacity-40",
            sizeMap[size],
            state === "listening" && "bg-emerald-500",
            (state === "thinking" || state === "transcribing") && "bg-indigo-500",
            state === "speaking" && "bg-cyan-400",
            state === "idle" && "bg-indigo-600/30"
          )}
        />

        {/* Outer Ring Pulse */}
        <div
          style={{ transform: `scale(${dynamicScale * 1.06})` }}
          className={cn(
            "absolute rounded-full border border-white/20 blur-[1px] transition-transform duration-150 pointer-events-none",
            sizeMap[size]
          )}
        />

        {/* Core Glowing Orb */}
        <div
          style={{ transform: `scale(${dynamicScale})` }}
          className={cn(
            "rounded-full bg-gradient-to-tr shadow-2xl relative transition-transform duration-150 overflow-hidden cursor-default",
            sizeMap[size],
            getOrbGradient(),
            state === "idle" && "orb-idle",
            state === "listening" && "orb-listening",
            (state === "thinking" || state === "transcribing") && "orb-think",
            state === "speaking" && "orb-speak"
          )}
        >
          {/* Internal Radial Light Specular Highlights */}
          <div className="absolute -top-1/4 -left-1/4 w-3/4 h-3/4 rounded-full bg-white/30 blur-md pointer-events-none" />
          <div className="absolute -bottom-1/4 -right-1/4 w-3/4 h-3/4 rounded-full bg-cyan-300/25 blur-lg pointer-events-none" />
          <div className="absolute inset-0 bg-radial from-transparent via-black/10 to-black/40 pointer-events-none" />
        </div>
      </div>

      {/* Real-time Status Badge */}
      <div className="mt-7 flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-slate-900/80 border border-slate-800/80 backdrop-blur-md shadow-xs">
        <span
          className={cn(
            "w-2 h-2 rounded-full",
            state === "listening" && "bg-emerald-400 animate-ping",
            (state === "thinking" || state === "transcribing") && "bg-indigo-400 animate-pulse",
            state === "speaking" && "bg-cyan-400 animate-pulse",
            state === "idle" && "bg-slate-400",
            state === "error" && "bg-rose-500"
          )}
        />
        <span className="text-[11px] uppercase tracking-widest font-bold text-slate-300">
          {getStatusLabel()}
        </span>
      </div>
    </div>
  );
};
