"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { api, CandidateUser, CandidateProfile } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { FileText, CheckCircle2, RefreshCw, AlertCircle } from "lucide-react";

export default function ResumePage() {
  const [user, setUser] = useState<CandidateUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [profile, setProfile] = useState<CandidateProfile | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const u = await api.getMe();
        setUser(u);
        const res = await api.getResume();
        setProfile(res.confirmed_profile || res.parsed_profile);
      } catch (err: unknown) {
        setLoadError(getErrorMessage(err, "Could not load your resume profile."));
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
    setSaveError(null);
    try {
      const res = await api.confirmProfile(profile);
      if (res?.confirmed_profile) {
        setProfile(res.confirmed_profile);
      }
      setSuccessMsg("Candidate profile updated. Future interview turns will adapt to these skills.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err, "Could not save your profile. Your changes were not saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#202124] flex flex-col font-sans">
      <Navbar user={user} />

      <main className="flex-1 max-w-3xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-6 sm:py-12 space-y-6 sm:space-y-8 pb-24 md:pb-12">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#202124]">
            Profile & Skills
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Skills, target role, and projects used to personalize interview questions.
          </p>
        </div>

        {successMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2 shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">{successMsg}</span>
          </div>
        )}

        {loadError && (
          <div className="p-4 bg-rose-50 border border-rose-200/80 rounded-2xl text-rose-800 text-xs flex items-center gap-2 shadow-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{loadError}</span>
          </div>
        )}

        {saveError && (
          <div className="p-4 bg-rose-50 border border-rose-200/80 rounded-2xl text-rose-800 text-xs flex items-center gap-2 shadow-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{saveError}</span>
          </div>
        )}

        {loading && (
          <div className="py-16 flex justify-center">
            <RefreshCw className="w-5 h-5 text-[#202124] animate-spin" />
          </div>
        )}

        {!loading && !loadError && !profile && (
          <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-8 text-center space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FAF2ED] border border-[#EED9CC] text-[#B3582A] mx-auto flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-[#202124]">No resume profile yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Upload a resume during onboarding to generate an editable profile. Interview
              questions stay grounded in what you confirm here.
            </p>
          </div>
        )}

        {profile && (
          <form onSubmit={handleSave} className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-xs space-y-5 text-xs">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Primary Target Role
              </label>
              <input
                type="text"
                required
                value={profile.primary_role}
                onChange={(e) => setProfile({ ...profile, primary_role: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs text-[#202124] focus:outline-none focus:ring-1 focus:ring-[#202124]"
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
                className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs text-[#202124] focus:outline-none focus:ring-1 focus:ring-[#202124]"
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
                className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs text-[#202124] focus:outline-none focus:ring-1 focus:ring-[#202124]"
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
                className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs text-[#202124] focus:outline-none focus:ring-1 focus:ring-[#202124] resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-5 py-2.5 bg-[#202124] hover:bg-[#111113] text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer min-h-[44px]"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Save Profile</span>
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
