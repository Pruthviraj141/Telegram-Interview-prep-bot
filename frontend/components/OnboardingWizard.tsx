"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, CandidateUser, CandidateProfile } from "@/lib/api";
import { Key, FileText, CheckCircle2, Sparkles, ArrowRight, ShieldCheck, Upload, AlertCircle, RefreshCw, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [interviewType, setInterviewType] = useState<string>("dsa");

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
      await api.setupGroqKey(groqKey.trim());
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
      setError("Please select a PDF or DOCX resume document.");
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

  const stepsMeta = [
    { num: 1, label: "Groq Key", short: "Key" },
    { num: 2, label: "Resume Upload", short: "Resume" },
    { num: 3, label: "Profile Verification", short: "Profile" },
    { num: 4, label: "Preparation Goals", short: "Goals" },
  ];

  return (
    <div className="max-w-2xl mx-auto py-6 sm:py-16 px-3.5 sm:px-6 font-sans">
      {/* Stepper Header (Apple segmented progress) */}
      <div className="mb-6 sm:mb-10 space-y-2 sm:space-y-3">
        <div className="grid grid-cols-4 gap-2 text-center">
          {stepsMeta.map((s) => (
            <div key={s.num} className="space-y-1">
              <div className="text-[10px] sm:text-[11px] font-semibold tracking-tight text-slate-700">
                <span className={cn(step === s.num ? "text-[#202124] font-bold" : "text-slate-400")}>
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </span>
              </div>
              <div
                className={cn(
                  "h-1 rounded-full transition-all duration-300",
                  step >= s.num ? "bg-[#202124]" : "bg-slate-200"
                )}
              />
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-5 p-3.5 sm:p-4 bg-rose-50 border border-rose-200/80 rounded-2xl flex items-start gap-3 text-rose-800 text-xs shadow-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="font-medium">{error}</div>
        </div>
      )}

      {/* Step 1: Groq Key Setup */}
      {step === 1 && (
        <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-5 sm:p-10 shadow-xs space-y-5 sm:space-y-6">
          <div className="w-10 h-10 rounded-2xl bg-[#F7F7F5] border border-[#E6E6E4] flex items-center justify-center text-[#202124]">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#202124]">Connect Groq API Key</h2>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mt-1.5 sm:mt-2">
              To provide turn-by-turn voice interviews and private rubric evaluation without token limits,
              the coach uses your own Groq key. It is validated against Groq, encrypted at rest using
              Fernet cryptography, and never returned to browser storage.
            </p>
          </div>

          <form onSubmit={handleKeySubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Groq API Key
              </label>
              <input
                type="password"
                required
                placeholder="gsk_..."
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                className="w-full px-3.5 py-3 border border-[#E6E6E4] rounded-xl text-base sm:text-xs font-mono text-[#202124] focus:outline-none focus:ring-1 focus:ring-[#202124]"
              />
              <span className="block mt-2 text-[11px] text-slate-500">
                Obtain a free key at{" "}
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#B3582A] hover:underline font-semibold"
                >
                  console.groq.com/keys
                </a>
              </span>
            </div>

            <div className="p-3.5 bg-[#F7F7F5] rounded-2xl border border-[#E6E6E4] flex items-center gap-3 text-xs text-slate-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Encrypted at rest: Plaintext keys are never logged or exposed.</span>
            </div>

            <button
              type="submit"
              disabled={loading || !groqKey.trim()}
              className="w-full py-3.5 px-6 bg-[#202124] hover:bg-[#111113] text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer min-h-[44px]"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Validating Key against Groq...</span>
                </>
              ) : (
                <>
                  <span>Save & Continue to Resume</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Step 2: Resume Upload */}
      {step === 2 && (
        <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-5 sm:p-10 shadow-xs space-y-5 sm:space-y-6">
          <div className="w-10 h-10 rounded-2xl bg-[#F7F7F5] border border-[#E6E6E4] flex items-center justify-center text-[#202124]">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#202124]">Upload Candidate Resume</h2>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mt-1.5 sm:mt-2">
              Every interview simulates real hiring panels. Our local parser extracts your actual projects, claimed skills,
              and experience so Project Defence questions probe authentic engineering claims.
            </p>
          </div>

          <form onSubmit={handleResumeUpload} className="space-y-4 sm:space-y-5">
            <div className="border border-dashed border-[#E6E6E4] hover:border-slate-400 rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-center transition bg-[#F7F7F5]">
              <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-800 mb-1">
                {resumeFile ? resumeFile.name : "Select PDF or DOCX resume document"}
              </p>
              <p className="text-[11px] text-slate-400 mb-3.5">Max file size: 5 MB</p>
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
                className="inline-block py-2.5 px-4 bg-white border border-[#E6E6E4] hover:border-slate-400 text-slate-800 text-xs font-semibold rounded-xl cursor-pointer transition shadow-xs min-h-[40px]"
              >
                Browse File
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !resumeFile}
              className="w-full py-3.5 px-6 bg-[#202124] hover:bg-[#111113] text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer min-h-[44px]"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Parsing Projects & Skills...</span>
                </>
              ) : (
                <>
                  <span>Extract Profile & Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Step 3: Review Extracted Profile */}
      {step === 3 && extractedProfile && (
        <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-5 sm:p-10 shadow-xs space-y-5 sm:space-y-6">
          <div className="w-10 h-10 rounded-2xl bg-[#F7F7F5] border border-[#E6E6E4] flex items-center justify-center text-[#202124]">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#202124]">Verify Extracted Profile</h2>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mt-1.5 sm:mt-2">
              Review the skills and projects extracted from your resume. You can edit any details below before they become your interview context.
            </p>
          </div>

          <div className="space-y-3.5 sm:space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Primary Target Role
              </label>
              <input
                type="text"
                value={extractedProfile.primary_role}
                onChange={(e) =>
                  setExtractedProfile({ ...extractedProfile, primary_role: e.target.value })
                }
                className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs text-[#202124] focus:outline-none focus:ring-1 focus:ring-[#202124]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs text-[#202124] focus:outline-none focus:ring-1 focus:ring-[#202124]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs text-[#202124] focus:outline-none focus:ring-1 focus:ring-[#202124]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Notable Projects (Probed during Project Defence)
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
                className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs text-[#202124] focus:outline-none focus:ring-1 focus:ring-[#202124] resize-none"
              />
            </div>
          </div>

          <button
            onClick={handleProfileConfirm}
            disabled={loading}
            className="w-full py-3.5 px-6 bg-[#202124] hover:bg-[#111113] text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer min-h-[44px]"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Confirm Profile & Continue"}
          </button>
        </div>
      )}

      {/* Step 4: Placement Preparation Setup */}
      {step === 4 && (
        <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-5 sm:p-10 shadow-xs space-y-5 sm:space-y-6">
          <div className="w-10 h-10 rounded-2xl bg-[#F7F7F5] border border-[#E6E6E4] flex items-center justify-center text-[#202124]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#202124]">Set Placement Goals</h2>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mt-1.5 sm:mt-2">
              Tell us your target role and timeline. We will calibrate interview difficulty and construct your adaptive preparation roadmap.
            </p>
          </div>

          <form onSubmit={handlePrepSubmit} className="space-y-3.5 sm:space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Role
              </label>
              <input
                type="text"
                required
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. Backend Software Engineer"
                className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs text-[#202124] focus:outline-none focus:ring-1 focus:ring-[#202124]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Company (Optional)
              </label>
              <input
                type="text"
                value={targetCompany}
                onChange={(e) => setTargetCompany(e.target.value)}
                placeholder="e.g. Google, Amazon, TCS, or Campus Drive"
                className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs text-[#202124] focus:outline-none focus:ring-1 focus:ring-[#202124]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Seniority
                </label>
                <select
                  value={seniority}
                  onChange={(e) => setSeniority(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs text-[#202124] bg-white"
                >
                  <option value="Intern / Fresher">Intern / Fresher</option>
                  <option value="Junior (1-2 yrs)">Junior (1-2 yrs)</option>
                  <option value="Mid-Level (3-5 yrs)">Mid-Level (3-5 yrs)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Focus Style
                </label>
                <select
                  value={interviewType}
                  onChange={(e) => setInterviewType(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs text-[#202124] bg-white"
                >
                  <option value="dsa">DSA & Coding Patterns</option>
                  <option value="system_design">System Architecture</option>
                  <option value="technical">Core CS Drill</option>
                  <option value="project_defence">Project Defence</option>
                  <option value="mixed">Comprehensive Mixed</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !targetRole.trim()}
              className="w-full mt-3 sm:mt-4 py-3.5 px-6 bg-[#202124] hover:bg-[#111113] text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer min-h-[44px]"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Complete Setup & Enter Studio</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
