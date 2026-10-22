"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { api, CandidateUser, CandidateProfile } from "@/lib/api";
import { FileText, CheckCircle2, Upload, RefreshCw, AlertCircle, ArrowRight } from "lucide-react";

export default function ResumePage() {
  const [user, setUser] = useState<CandidateUser | null>(null);
  const [resumeData, setResumeData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [profile, setProfile] = useState<CandidateProfile | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const u = await api.getMe();
        setUser(u);
        const res = await api.getResume();
        setResumeData(res);
        setProfile(res.confirmed_profile || res.parsed_profile);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setSuccessMsg(null);
    try {
      await api.confirmProfile(profile);
      setSuccessMsg("Candidate profile updated. Future interview turns will adapt to these skills.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F1EA] text-[#20232C] flex flex-col font-sans">
      <Navbar user={user} />

      <main className="flex-1 max-w-3xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-6 sm:py-12 space-y-6 sm:space-y-8 pb-24 md:pb-12">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#E8E5DD] text-[#20232C] text-xs font-semibold tracking-tight mb-2.5 shadow-xs">
            <FileText className="w-3.5 h-3.5 text-[#4F46E5]" />
            <span>Extracted Identity & Skills</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-[#20232C]">
            Resume Profile & Claims
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
            Review and adjust extracted projects and technical proficiencies. The interview studio probes these authentic claims during Project Defence.
          </p>
        </div>

        {successMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2 shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">{successMsg}</span>
          </div>
        )}

        {profile && (
          <form onSubmit={handleSave} className="bg-white border border-[#E8E5DD] rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-xs space-y-5 text-xs">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Primary Target Role
              </label>
              <input
                type="text"
                required
                value={profile.primary_role}
                onChange={(e) => setProfile({ ...profile, primary_role: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-base sm:text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#20232C]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Programming Languages
              </label>
              <input
                type="text"
                value={profile.programming_languages.join(", ")}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    programming_languages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-base sm:text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#20232C]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Frameworks, Libraries & Tools
              </label>
              <input
                type="text"
                value={profile.frameworks_and_tools.join(", ")}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    frameworks_and_tools: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-base sm:text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#20232C]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Notable Projects (Architecture & Claims)
              </label>
              <textarea
                rows={3}
                value={profile.notable_projects.join("\n")}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    notable_projects: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-base sm:text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#20232C] resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-6 py-2.5 bg-[#20232C] hover:bg-black text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer min-h-[44px]"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Save Profile Adjustments</span>
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
