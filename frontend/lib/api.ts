/**
 * API client for the AI Interview Coach FastAPI backend.
 * Handles authentication headers, token storage, and error parsing.
 */

export function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    return `http://${host}:8000/api`;
  }
  return "http://localhost:8000/api";
}

const API_BASE = getApiBase();

export interface CandidateUser {
  id: string;
  email?: string;
  display_name?: string;
  onboarding_state: "AWAITING_GROQ_KEY" | "AWAITING_RESUME" | "AWAITING_PROFILE_CONFIRM" | "AWAITING_PREP_SETUP" | "COMPLETED";
  groq_key_configured: boolean;
  groq_key_masked?: string;
  resume_uploaded: boolean;
  target_role?: string;
  target_company?: string;
  telegram_linked: boolean;
}

export interface CandidateProfile {
  primary_role: string;
  target_roles: string[];
  programming_languages: string[];
  frameworks_and_tools: string[];
  database_technologies: string[];
  notable_projects: string[];
  years_of_experience: string;
  recommended_topics: string[];
}

export interface InterviewSession {
  id: string;
  clerk_id: string;
  mode: "realistic" | "practice";
  interviewer_style:
    | "hr"
    | "technical"
    | "project_defence"
    | "mixed"
    | "dsa"
    | "system_design"
    | "aiml"
    | "resume";
  duration_mode: "quick" | "standard" | "full";
  target_role: string;
  seniority: string;
  difficulty: string;
  status: "in_progress" | "completed" | "partial_completed" | "cancelled";
  current_turn_index: number;
  blueprint: any;
  overall_score?: number | null;
  debrief?: any;
  created_at: string;
}

export interface InterviewSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  topic?: string;
  source_type?: string;
  verified_on?: string;
}

export interface InterviewTurn {
  id: string;
  session_id: string;
  turn_index: number;
  question_id?: string;
  question_text: string;
  category: string;
  category_key?: string;
  // Present in practice mode; intentionally absent in realistic mode until debrief.
  rubric?: any;
  is_follow_up: boolean;
  original_transcript?: string;
  corrected_transcript?: string;
  typed_answer?: string;
  is_voice: number;
  scratchpad_text?: string;
  audio_url?: string;
  evaluation?: any;
  evaluation_status: "pending" | "completed" | "failed";
  retry_count: number;
  retry_history?: any[];
  dispute_history?: any[];
  // Provenance: where the question comes from. Always truthful, never a
  // claim that a generated/curated question was asked by a company.
  source_basis?: string;
  sources?: InterviewSource[];
  provenance?: { kind?: string; note?: string; [key: string]: any };
}

// Get or set local user token/ID
export function getStoredAuthToken(): string {
  if (typeof window === "undefined") return "demo_user";
  const token = localStorage.getItem("ai_coach_auth_token");
  if (!token) {
    const freshId = "user_" + Math.random().toString(36).substring(2, 10);
    localStorage.setItem("ai_coach_auth_token", freshId);
    return freshId;
  }
  return token;
}

export function setStoredAuthToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("ai_coach_auth_token", token);
  }
}

/**
 * Error carrying the HTTP status so callers can distinguish recoverable
 * states (e.g. 409 already-submitted, 502 model failure) without string
 * matching on the message.
 */
export class ApiError extends Error {
  status: number;
  detail?: any;

  constructor(message: string, status: number, detail?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredAuthToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has("Authorization") && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("X-Clerk-User-Id") && token) {
    headers.set("X-Clerk-User-Id", token);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = "API request failed";
    let errJson: any = null;
    try {
      errJson = await response.json();
      errorDetail = errJson.detail?.message || errJson.detail || errorDetail;
    } catch {
      errorDetail = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new ApiError(
      typeof errorDetail === "string" ? errorDetail : JSON.stringify(errorDetail),
      response.status,
      errJson?.detail
    );
  }

  return response.json();
}

export const api = {
  // Auth & Onboarding
  getMe: () => fetchApi<CandidateUser>("/auth/me"),
  setupGroqKey: (groq_key: string) =>
    fetchApi<{ status: string; key_masked: string; next_step: string }>("/auth/groq-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groq_key }),
    }),
  getGroqKeyStatus: () => fetchApi<{ configured: boolean; key_masked?: string }>("/auth/groq-key"),
  deleteGroqKey: () => fetchApi<{ status: string }>("/auth/groq-key", { method: "DELETE" }),

  // Resume
  uploadResume: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return fetchApi<{ status: string; parsed_profile: CandidateProfile; next_step: string }>("/resume/upload", {
      method: "POST",
      body: formData,
    });
  },
  getResume: () => fetchApi<any>("/resume"),
  confirmProfile: (profile: CandidateProfile) =>
    fetchApi<{ status: string; confirmed_profile: CandidateProfile; next_step: string }>("/resume/confirm", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    }),
  submitPrepSetup: (data: {
    target_role: string;
    target_company?: string;
    seniority: string;
    target_date?: string;
    interview_type: string;
  }) =>
    fetchApi<{ status: string; onboarding_state: string; roadmap: any }>("/onboarding/prep-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  // Dashboard
  getDashboard: () => fetchApi<any>("/dashboard"),

  // Interview Studio
  startInterviewSession: (data: {
    mode: "realistic" | "practice";
    interviewer_style: string;
    duration_mode: string;
    phase?: string;
    drill_skill?: string;
    custom_categories?: string[];
  }) =>
    fetchApi<{ session: InterviewSession; current_turn: InterviewTurn }>("/interview/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getInterviewSession: (sessionId: string) =>
    fetchApi<{ session: InterviewSession; turns: InterviewTurn[] }>(`/interview/session/${sessionId}`),

  listInterviewSessions: () => fetchApi<InterviewSession[]>("/interview/sessions"),

  transcribeAudio: async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append("audio", audioBlob, "audio.webm");
    return fetchApi<{ transcript: string; confidence: string }>("/interview/transcribe", {
      method: "POST",
      body: formData,
    });
  },

  submitTurnAnswer: (turnId: string, data: {
    original_transcript?: string;
    corrected_transcript?: string;
    typed_answer?: string;
    is_voice: boolean;
    scratchpad_text?: string;
    assistance_used?: any;
  }) =>
    fetchApi<{
      status: string;
      evaluated_turn: InterviewTurn;
      next_turn: InterviewTurn | null;
      is_session_completed: boolean;
    }>(`/interview/turn/${turnId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  retryTurnAnswer: (turnId: string, data: {
    corrected_transcript?: string;
    typed_answer?: string;
    is_voice: boolean;
  }) =>
    fetchApi<{
      status: string;
      retry_evaluation: any;
      original_evaluation: any;
    }>(`/interview/turn/${turnId}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  disputeTurnFeedback: (turnId: string, data: {
    clarification: string;
    corrected_transcript?: string;
  }) =>
    fetchApi<{
      status: string;
      message: string;
      original_evaluation: any;
      reassessed_evaluation: any;
    }>(`/interview/turn/${turnId}/dispute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  endInterviewSession: (sessionId: string) =>
    fetchApi<{ session: InterviewSession; debrief: any }>(`/interview/session/${sessionId}/end`, {
      method: "POST",
    }),

  deleteInterviewSession: (sessionId: string) =>
    fetchApi<{ status: string }>(`/interview/session/${sessionId}`, { method: "DELETE" }),

  deleteAllHistory: () => fetchApi<{ status: string }>("/interview/history", { method: "DELETE" }),

  // Placement Tracker
  listTrackerItems: () => fetchApi<any[]>("/tracker"),
  createTrackerItem: (item: { company: string; role: string; status: string; deadline?: string; notes?: string }) =>
    fetchApi<{ status: string; id: string }>("/tracker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    }),
  updateTrackerItem: (itemId: string, item: any) =>
    fetchApi<{ status: string }>(`/tracker/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    }),
  deleteTrackerItem: (itemId: string) =>
    fetchApi<{ status: string }>(`/tracker/${itemId}`, { method: "DELETE" }),

  // Telegram Link
  getTelegramLinkCode: () =>
    fetchApi<{ code: string; expires_in_seconds: number; instructions: string }>("/telegram/link-code", {
      method: "POST",
    }),

  // Consent
  recordConsent: () =>
    fetchApi<{ status: string }>("/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent_type: "audio_transient_processing" }),
    }),
  checkConsent: () => fetchApi<{ has_consented: boolean }>("/consent"),

  // Neural TTS
  getTTSVoices: () =>
    fetchApi<Array<{ id: string; name: string; gender: string; style: string; tag: string }>>("/interview/tts/voices"),
  synthesizeSpeech: async (text: string, voice?: string, rate?: string, signal?: AbortSignal): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/interview/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: voice || "en-US-ChristopherNeural", rate: rate || "+0%" }),
      signal,
    });
    if (!res.ok) {
      throw new Error(`TTS synthesis failed with status ${res.status}`);
    }
    return await res.blob();
  },
};
