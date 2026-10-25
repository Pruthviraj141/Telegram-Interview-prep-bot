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
    sm: "w-16 h-16 sm:w-20 sm:h-20",
    md: "w-24 h-24 sm:w-32 sm:h-32",
    lg: "w-28 h-28 sm:w-40 sm:h-40 md:w-48 md:h-48",
    xl: "w-32 h-32 sm:w-44 sm:h-44 md:w-56 md:h-56",
  };

  // Subtle volume scaling (bounded and smooth, not jittery)
  const volScaled = Math.min(Math.max(volume, 0), 100);
  const dynamicScale = state === "listening" && volScaled > 3
    ? 1 + (volScaled / 100) * 0.12
    : 1;

  const getStatusLabel = () => {
    switch (state) {
      case "listening":
        return "Listening...";
      case "transcribing":
        return "Transcribing...";
      case "thinking":
        return "Evaluating response...";
      case "speaking":
        return "Speaking...";
      case "paused":
        return "Paused";
      case "preflight":
        return "Connecting...";
      case "error":
        return "Microphone issue";
      case "idle":
      default:
        return "Ready";
    }
  };

  // Apple-grade chromatic core and rim styling
  const getCoreStyle = () => {
    switch (state) {
      case "listening":
        return "from-[#1C2522] via-[#16352B] to-[#1B4D3E] border-emerald-500/40 shadow-[0_0_40px_rgba(27,107,80,0.18)]";
      case "transcribing":
      case "thinking":
        return "from-[#201F2B] via-[#28273D] to-[#312E52] border-indigo-400/35 shadow-[0_0_40px_rgba(79,70,229,0.16)]";
      case "speaking":
        return "from-[#1F242C] via-[#252E3B] to-[#2E3C4F] border-slate-300/40 shadow-[0_0_35px_rgba(148,163,184,0.14)]";
      case "error":
        return "from-[#2B1F20] via-[#3D2526] to-[#4F2C2D] border-rose-500/40 shadow-[0_0_35px_rgba(244,63,94,0.16)]";
      case "paused":
        return "from-[#1A1A1D] via-[#222226] to-[#2A2A30] border-slate-600/30";
      case "preflight":
        return "from-[#1F222B] via-[#262C3A] to-[#2F374A] border-indigo-500/30";
      case "idle":
      default:
        return "from-[#1A1A1E] via-[#222227] to-[#2C2D35] border-white/15 shadow-[0_0_30px_rgba(255,255,255,0.04)]";
    }
  };

  const getAnimationClass = () => {
    switch (state) {
      case "listening":
        return "orb-listening";
      case "thinking":
      case "transcribing":
        return "orb-thinking";
      case "speaking":
        return "orb-speaking";
      case "idle":
      default:
        return "orb-idle";
    }
  };

  return (
    <div className={cn("flex flex-col items-center justify-center select-none", className)}>
      <div className="relative flex items-center justify-center">
        {/* Subtle Ambient Refraction Ring */}
        <div
          style={{ transform: `scale(${dynamicScale * 1.08})` }}
          className={cn(
            "absolute rounded-full border border-white/10 blur-[2px] transition-transform duration-200 pointer-events-none",
            sizeMap[size]
          )}
        />

        {/* Primary Tactile Orb Sphere */}
        <div
          style={{ transform: `scale(${dynamicScale})` }}
          className={cn(
            "relative rounded-full bg-gradient-to-br border flex items-center justify-center transition-transform duration-150 overflow-hidden",
            sizeMap[size],
            getCoreStyle(),
            getAnimationClass()
          )}
        >
          {/* Internal Specular Glass Highlight */}
          <div className="absolute top-2 inset-x-4 h-1/3 bg-gradient-to-b from-white/12 to-transparent rounded-t-full pointer-events-none" />

          {/* Audio-Reactive Wave Equalizer (Minimal 5-bar display when active) */}
          {(state === "listening" || state === "speaking") && (
            <div className="flex items-center gap-1.5 z-10">
              {[0.5, 0.9, 1.2, 0.8, 0.6].map((multiplier, idx) => {
                const barHeight = Math.max(6, Math.min(32, (volScaled * multiplier) / 3));
                return (
                  <div
                    key={idx}
                    style={{ height: `${barHeight}px` }}
                    className={cn(
                      "w-1 rounded-full transition-all duration-75",
                      state === "listening" ? "bg-emerald-400" : "bg-slate-200"
                    )}
                  />
                );
              })}
            </div>
          )}

          {/* Thinking / Transcribing Spinner Accent */}
          {(state === "thinking" || state === "transcribing") && (
            <div className="w-8 h-8 rounded-full border-2 border-indigo-400/30 border-t-indigo-400 animate-spin z-10" />
          )}

          {/* Idle Calm Specular Center Dot */}
          {state === "idle" && (
            <div className="w-2.5 h-2.5 rounded-full bg-white/40 shadow-xs" />
          )}
        </div>
      </div>

      {/* Status Text */}
      <div className="mt-3 text-xs font-medium text-[#8E929E] tracking-tight">
        {getStatusLabel()}
      </div>
    </div>
  );
};
