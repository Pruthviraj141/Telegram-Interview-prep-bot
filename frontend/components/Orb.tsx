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

const SIZE_MAP: Record<NonNullable<OrbProps["size"]>, string> = {
  sm: "h-16 w-16 sm:h-20 sm:w-20",
  md: "h-24 w-24 sm:h-32 sm:w-32",
  lg: "h-28 w-28 sm:h-40 sm:w-40 md:h-48 md:w-48",
  xl: "h-32 w-32 sm:h-44 sm:w-44 md:h-56 md:w-56",
};

const TONE: Record<
  OrbState,
  { wave: string; halo: string; ring: string; bar: string; label: string }
> = {
  listening: {
    wave: "text-success",
    halo: "bg-success",
    ring: "border-success/40",
    bar: "bg-success",
    label: "Listening",
  },
  speaking: {
    wave: "text-accent",
    halo: "bg-accent",
    ring: "border-accent/40",
    bar: "bg-accent-strong",
    label: "Speaking",
  },
  thinking: {
    wave: "text-accent",
    halo: "bg-accent",
    ring: "border-accent/30",
    bar: "bg-accent",
    label: "Evaluating response",
  },
  transcribing: {
    wave: "text-accent",
    halo: "bg-accent",
    ring: "border-accent/30",
    bar: "bg-accent",
    label: "Transcribing",
  },
  preflight: {
    wave: "text-accent",
    halo: "bg-accent",
    ring: "border-accent/25",
    bar: "bg-accent",
    label: "Connecting",
  },
  paused: {
    wave: "text-ink-tertiary",
    halo: "bg-ink-tertiary",
    ring: "border-line-strong",
    bar: "bg-ink-tertiary",
    label: "Paused",
  },
  error: {
    wave: "text-danger",
    halo: "bg-danger",
    ring: "border-danger/40",
    bar: "bg-danger",
    label: "Microphone issue",
  },
  idle: {
    wave: "text-accent",
    halo: "bg-accent",
    ring: "border-line-strong",
    bar: "bg-accent",
    label: "Ready",
  },
};

/*
 * Wave silhouettes are 200 units wide and fill down to y=100, so a -50%
 * translate loops without a seam. Two periods (deep/mid) and four periods
 * (front) give the stack a parallax feel instead of one flat arc.
 */
const SWELL =
  "M0 56 C 30 30, 70 30, 100 56 C 130 82, 170 82, 200 56 L 200 100 L 0 100 Z";
const RIPPLE =
  "M0 54 C 14 42, 36 42, 50 54 C 64 66, 86 66, 100 54 C 114 42, 136 42, 150 54 C 164 66, 186 66, 200 54 L 200 100 L 0 100 Z";

/** Mirrored loudness profile so the live meter reads as one waveform. */
const BAR_PROFILE = [0.34, 0.55, 0.8, 1, 0.8, 0.55, 0.34];

export const Orb: React.FC<OrbProps> = ({
  state,
  size = "lg",
  volume = 0,
  className,
}) => {
  const tone = TONE[state];
  const vol = Math.min(Math.max(volume, 0), 100);
  const isLive = state === "listening" || state === "speaking";
  const isBusy = state === "thinking" || state === "transcribing";
  const isStill = state === "paused" || state === "error";

  const scale = state === "listening" && vol > 3 ? 1 + (vol / 100) * 0.08 : 1;
  const waveLift = isLive && vol > 3 ? (vol / 100) * 8 : 0;

  return (
    <div
      className={cn(
        "flex select-none flex-col items-center justify-center",
        className,
      )}
    >
      <div className="relative flex items-center justify-center">
        {/* Ambient halo — breathes with the state, never grabs focus */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full opacity-25 blur-2xl",
            tone.halo,
            state === "idle" || state === "paused" ? "orb-halo-calm" : "orb-halo",
          )}
        />

        {/* Static orbit ring, then a dashed ring that spins only while busy */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute rounded-full border opacity-60",
            tone.ring,
            SIZE_MAP[size],
            "scale-[1.14]",
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute rounded-full border border-dashed",
            tone.ring,
            SIZE_MAP[size],
            isBusy ? "orb-ring-spin opacity-70" : "opacity-0",
            "scale-[1.24]",
          )}
        />

        {/* Glass sphere */}
        <div
          style={{ transform: `scale(${scale})` }}
          className={cn(
            "relative overflow-hidden rounded-full border bg-gradient-to-b from-surface-raised via-surface to-canvas shadow-[inset_0_1px_0_var(--line-strong)] transition-transform duration-200",
            SIZE_MAP[size],
            tone.ring,
            isLive ? "orb-live" : "",
          )}
        >
          {/* Glow the waves sit in front of */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 h-2/3 opacity-40 blur-xl",
              tone.halo,
            )}
          />

          {/* Wave stack */}
          <div
            aria-hidden="true"
            className="absolute inset-0 overflow-hidden rounded-full"
            style={{ transform: `translateY(${-waveLift * 0.2}px)` }}
          >
            <svg
              className={cn(
                "absolute -bottom-4 left-0 h-[86%] w-[200%] opacity-60",
                tone.wave,
                isStill ? "" : "orb-wave-deep",
              )}
              viewBox="0 0 200 100"
              preserveAspectRatio="none"
            >
              <path d={SWELL} fill="currentColor" opacity="0.14" />
            </svg>
            <svg
              className={cn(
                "absolute -bottom-3 left-0 h-[72%] w-[200%] opacity-70",
                tone.wave,
                isStill ? "" : "orb-wave-slow",
              )}
              viewBox="0 0 200 100"
              preserveAspectRatio="none"
            >
              <path d={RIPPLE} fill="currentColor" opacity="0.2" />
            </svg>
            <svg
              className={cn(
                "absolute -bottom-3 left-0 h-[58%] w-[200%] opacity-85",
                tone.wave,
                isStill ? "" : "orb-wave-mid",
              )}
              viewBox="0 0 200 100"
              preserveAspectRatio="none"
              style={{ transform: `translateY(${waveLift}px)` }}
            >
              <path d={SWELL} fill="currentColor" opacity="0.26" />
            </svg>
            <svg
              className={cn(
                "absolute -bottom-3 left-0 h-[44%] w-[200%]",
                tone.wave,
                isStill ? "" : "orb-wave-fast",
              )}
              viewBox="0 0 200 100"
              preserveAspectRatio="none"
              style={{ transform: `translateY(${waveLift * 1.5}px)` }}
            >
              <path d={RIPPLE} fill="currentColor" opacity="0.4" />
            </svg>
          </div>

          {/* Specular highlight */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-4 top-2 h-1/3 rounded-t-full bg-gradient-to-b from-surface-raised/50 to-transparent"
          />

          {/* Live audio waveform */}
          {isLive ? (
            <div
              aria-hidden="true"
              className="relative z-10 flex h-full items-center justify-center gap-[3px]"
            >
              {BAR_PROFILE.map((profile, idx) => {
                const measured =
                  vol > 3
                    ? Math.max(10, Math.min(52, vol * profile * 0.6))
                    : null;
                return (
                  <span
                    key={idx}
                    style={
                      measured
                        ? { height: `${measured}%` }
                        : {
                            height: `${14 + profile * 16}%`,
                            animationDelay: `${idx * 110}ms`,
                          }
                    }
                    className={cn(
                      "w-[3px] rounded-full transition-[height] duration-100 ease-out",
                      tone.bar,
                      measured ? "opacity-90" : "orb-bar-idle opacity-60",
                    )}
                  />
                );
              })}
            </div>
          ) : null}

          {/* Busy pulse */}
          {isBusy ? (
            <div className="relative z-10 flex h-full items-center justify-center">
              <span
                className={cn(
                  "h-7 w-7 rounded-full border-2 border-current/30 border-t-current orb-ring-spin",
                  tone.wave,
                )}
              />
            </div>
          ) : null}

          {/* Resting core */}
          {!isLive && !isBusy ? (
            <div className="relative z-10 flex h-full items-center justify-center">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  tone.bar,
                  state === "error" ? "opacity-100" : "opacity-60",
                )}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone.bar,
            isLive ? "animate-pulse" : "opacity-50",
          )}
        />
        <span className="text-xs font-medium tracking-tight text-ink-secondary">
          {tone.label}
        </span>
      </div>
    </div>
  );
};
