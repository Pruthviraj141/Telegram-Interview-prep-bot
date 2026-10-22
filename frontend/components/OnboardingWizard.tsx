"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, CandidateUser, CandidateProfile } from "@/lib/api";
import { Key, FileText, CheckCircle2, Sparkles, ArrowRight, ShieldCheck, Upload, AlertCircle, RefreshCw } from "lucide-react";

interface OnboardingWizardProps {
  initialUser: CandidateUser;
  onComplete: () => void;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ initialUser, onComplete }) => {
  const router = useRouter();
  const [user, setUser] = useState<CandidateUser>(initialUser);
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [groqKey, setGroqKey] = useState<string>("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [extractedProfile, setExtractedProfile] = useState<CandidateProfile | null>(null);

  // Conversational setup
  const [targetRole, setTargetRole] = useState<string>("");
  const [targetCompany, setTargetCompany] = useState<string>("");
  const [seniority, setSeniority] = useState<string>("Fresher / Early Career");
  const [targetDate, setTargetDate] = useState<string>("Within 30 Days");
  const [interviewType, setInterviewType] = useState<string>("mixed");

  useEffect(() => {
    // Map backend onboarding state to wizard step
    switch (user.onboarding_state) {
      case "AWAITING_GROQ_KEY":
        setStep(1);
        break;
      case "AWAITING_RESUME":
        setStep(2);
        break;
      case "AWAITING_PROFILE_CONFIRM":
        setStep(3);
        // Fetch current resume profile if available
        api.getResume().then((res) => {
          if (res?.parsed_profile) setExtractedProfile(res.parsed_profile);
        }).catch(() => {});
        break;
      case "AWAITING_PREP_SETUP":
        setStep(4);
        break;
      case "COMPLETED":
        onComplete();
        break;
    }
  }, [user.onboarding_state]);

  // Step 1: Submit Groq Key
  const handleKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.setupGroqKey(groqKey);
      const updated = await api.getMe();
      setUser(updated);
      setStep(2);
    } catch (err: any) {
      setError(err.message || "Failed to validate Groq key. Please verify and retry.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Upload Resume
  const handleResumeUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resumeFile) {
      setError("Please select a PDF or DOCX resume.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.uploadResume(resumeFile);
      setExtractedProfile(res.parsed_profile);
      setTargetRole(res.parsed_profile.primary_role || "Software Engineer");
      const updated = await api.getMe();
      setUser(updated);
      setStep(3);
    } catch (err: any) {
      setError(err.message || "Resume extraction failed. Please ensure file is a valid PDF or DOCX.");
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Confirm Profile
  const handleProfileConfirm = async () => {
    if (!extractedProfile) return;
    setError(null);
    setLoading(true);
    try {
      await api.confirmProfile(extractedProfile);
      const updated = await api.getMe();
      setUser(updated);
      setStep(4);
    } catch (err: any) {
      setError(err.message || "Failed to confirm profile.");
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Complete Prep Setup
  const handlePrepSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.submitPrepSetup({
        target_role: targetRole || "Software Engineer",
        target_company: targetCompany || undefined,
        seniority,
        target_date: targetDate,
        interview_type: interviewType,
      });
      onComplete();
    } catch (err: any) {
      setError(err.message || "Failed to finalize preparation setup.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 sm:px-6">
      {/* Stepper Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
          <span className={step >= 1 ? "text-[#5967F2]" : ""}>1. Groq Key</span>
          <span className={step >= 2 ? "text-[#5967F2]" : ""}>2. Resume</span>
          <span className={step >= 3 ? "text-[#5967F2]" : ""}>3. Profile</span>
          <span className={step >= 4 ? "text-[#5967F2]" : ""}>4. Prep Goals</span>
        </div>
        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-[#5967F2] h-full transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 text-sm">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Step 1: Groq Key Setup */}
      {step === 1 && (
        <div className="bg-white border border-[#E4E0D6] rounded-2xl p-8 shadow-sm">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-[#5967F2] mb-5">
            <Key className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-[#20232C] mb-2">Connect Your Groq API Key</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            To provide turn-by-turn voice interviews and private answer evaluation without token limits,
            the AI Interview Coach uses your own Groq key. It is validated directly with Groq,
            encrypted at rest using Fernet authenticated encryption, and never shared or exposed in client storage.
          </p>

          <form onSubmit={handleKeySubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Groq API Key
              </label>
              <input
                type="password"
                required
                placeholder="gsk_..."
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#5967F2] focus:border-transparent"
              />
              <span className="block mt-2 text-xs text-slate-500">
                Obtain your free API key at{" "}
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#5967F2] underline font-medium"
                >
                  console.groq.com/keys
                </a>
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center gap-3 text-xs text-slate-600">
              <ShieldCheck className="w-4 h-4 text-[#168A72] shrink-0" />
              <span>Zero secret leakage: Plaintext is never returned to browser or logs.</span>
            </div>

            <button
              type="submit"
              disabled={loading || !groqKey.trim()}
              className="w-full py-3.5 px-6 bg-[#5967F2] hover:bg-[#4855D6] text-white font-medium rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Validating against Groq...
                </>
              ) : (
                <>
                  Validate & Save Securely <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Step 2: Mandatory Resume Upload */}
      {step === 2 && (
        <div className="bg-white border border-[#E4E0D6] rounded-2xl p-8 shadow-sm">
          <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center text-[#168A72] mb-5">
            <FileText className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-[#20232C] mb-2">Upload Candidate Resume</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            A resume is mandatory to ensure every interview simulates real placement panels.
            Our local parser securely extracts your projects, claimed tools, and experience so questions probe authentic claims.
          </p>

          <form onSubmit={handleResumeUpload} className="space-y-5">
            <div className="border-2 border-dashed border-slate-300 hover:border-[#5967F2] rounded-2xl p-8 text-center transition bg-slate-50/50">
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700 mb-1">
                {resumeFile ? resumeFile.name : "Choose PDF or DOCX resume"}
              </p>
              <p className="text-xs text-slate-500 mb-4">Maximum file size: 5 MB</p>
              <input
                type="file"
                id="resume-file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setResumeFile(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
              <label
                htmlFor="resume-file"
                className="inline-block py-2 px-4 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer transition shadow-2xs"
              >
                Browse Document
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !resumeFile}
              className="w-full py-3.5 px-6 bg-[#5967F2] hover:bg-[#4855D6] text-white font-medium rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Extracting & Analyzing Profile...
                </>
              ) : (
                <>
                  Parse & Review Profile <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Step 3: Review & Edit Extracted Profile */}
      {step === 3 && extractedProfile && (
        <div className="bg-white border border-[#E4E0D6] rounded-2xl p-8 shadow-sm">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-[#5967F2] mb-5">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-[#20232C] mb-2">Review Extracted Profile</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            Review the skills and projects extracted from your resume. Your confirmed edits become the canonical interview context.
          </p>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Target Role
              </label>
              <input
                type="text"
                value={extractedProfile.primary_role}
                onChange={(e) =>
                  setExtractedProfile({ ...extractedProfile, primary_role: e.target.value })
                }
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Programming Languages
              </label>
              <input
                type="text"
                value={extractedProfile.programming_languages.join(", ")}
                onChange={(e) =>
                  setExtractedProfile({
                    ...extractedProfile,
                    programming_languages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Frameworks & Tools
              </label>
              <input
                type="text"
                value={extractedProfile.frameworks_and_tools.join(", ")}
                onChange={(e) =>
                  setExtractedProfile({
                    ...extractedProfile,
                    frameworks_and_tools: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Notable Projects (Will be probed in Project Defence)
              </label>
              <textarea
                rows={2}
                value={extractedProfile.notable_projects.join("\n")}
                onChange={(e) =>
                  setExtractedProfile({
                    ...extractedProfile,
                    notable_projects: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleProfileConfirm}
            disabled={loading}
            className="w-full py-3.5 px-6 bg-[#5967F2] hover:bg-[#4855D6] text-white font-medium rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Confirm Profile & Continue"}
          </button>
        </div>
      )}

      {/* Step 4: Conversational Placement Setup */}
      {step === 4 && (
        <div className="bg-white border border-[#E4E0D6] rounded-2xl p-8 shadow-sm">
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 mb-5">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-[#20232C] mb-2">Set Your Placement Goals</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            Tell us what role and company you are preparing for. We'll calibrate your question difficulty and construct your adaptive preparation roadmap.
          </p>

          <form onSubmit={handlePrepSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Target Role
              </label>
              <input
                type="text"
                required
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. Backend Software Engineer"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Target Company (Optional)
              </label>
              <input
                type="text"
                value={targetCompany}
                onChange={(e) => setTargetCompany(e.target.value)}
                placeholder="e.g. Google, Microsoft, Infosys, or Campus Drive"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Seniority Level
                </label>
                <select
                  value={seniority}
                  onChange={(e) => setSeniority(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="Intern / Fresher">Intern / Fresher</option>
                  <option value="Junior (1-2 yrs)">Junior (1-2 yrs)</option>
                  <option value="Mid-Level (3-5 yrs)">Mid-Level (3-5 yrs)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Interview Style
                </label>
                <select
                  value={interviewType}
                  onChange={(e) => setInterviewType(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="mixed">Mixed (Tech, Projects, STAR)</option>
                  <option value="technical">Technical Fundamentals</option>
                  <option value="project_defence">Project Defence</option>
                  <option value="hr">HR / Behavioral</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !targetRole.trim()}
              className="w-full mt-4 py-3.5 px-6 bg-[#168A72] hover:bg-[#12725E] text-white font-medium rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Generate Roadmap & Enter Studio <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
