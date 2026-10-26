import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Pull a human-readable message out of an unknown thrown value without
 * assuming the error shape. Falls back to the supplied copy.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

const TOPIC_LABELS: Record<string, string> = {
  behavioral_intro: "Background",
  behavioral_failure: "Failure & Ownership",
  behavioral_collaboration: "Collaboration",
  behavioral_prioritization: "Prioritization",
  behavioral_evidence: "Behavioral",
  project_deep_dive: "Project Deep Dive",
  project_architecture: "Project Architecture",
  project_bottleneck: "Bottleneck Diagnosis",
  project_tradeoffs: "Trade-offs",
  project_failure: "Production Failure",
  dsa_general: "Data Structures & Algorithms",
  dsa_hashing: "Hashing",
  dsa_two_pointers: "Two Pointers & Windows",
  dsa_trees_graphs_dp: "Trees, Graphs & DP",
  dsa_complexity: "Complexity & Edge Cases",
  sql: "DBMS & SQL",
  oop: "OOP & Language Internals",
  networking: "Computer Networks",
  operating_systems: "Operating Systems",
  system_design_architecture: "System Design",
  backend_api: "Backend & APIs",
  ml_foundations: "ML Foundations",
};

/**
 * Question categories arrive either as display text ("DSA") or as canonical
 * keys ("behavioral_intro"). Never show the raw key to a candidate.
 */
export function topicLabel(category?: string | null): string {
  const raw = (category || "").trim();
  if (!raw) return "General";
  const mapped = TOPIC_LABELS[raw.toLowerCase()];
  if (mapped) return mapped;
  if (!raw.includes("_")) return raw;
  return raw
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
