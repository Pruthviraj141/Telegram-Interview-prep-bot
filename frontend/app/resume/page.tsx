"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { api, CandidateUser, CandidateProfile } from "@/lib/api";
import { FileText, CheckCircle2, Upload, RefreshCw, AlertCircle } from "lucide-react";

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
      setSuccessMsg("Candidate profile updated! This now informs your future interview turns.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F1EA] flex flex-col">
      <Navbar user={user} />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#20232C] tracking-tight">
            Candidate Resume & Confirmed Profile
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review and adjust extracted projects and technical proficiencies. The interview studio probes these authentic claims during Project Defence.
          </p>
        </div>

        {successMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {profile && (
          <form onSubmit={handleSave} className="bg-white border border-[#E4E0D6] rounded-2xl p-6 sm:p-8 shadow-xs space-y-4 text-xs">
            <div>
              <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                Primary Target Role
              </label>
              <input
                type="text"
                required
                value={profile.primary_role}
                onChange={(e) => setProfile({ ...profile, primary_role: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#5967F2]"
              />
            </div>

            <div>
              <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
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
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#5967F2]"
              />
            </div>

            <div>
              <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
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
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#5967F2]"
              />
            </div>

            <div>
              <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
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
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#5967F2]"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-[#5967F2] hover:bg-[#4855D6] text-white font-bold rounded-xl transition flex items-center gap-2 shadow-xs disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              <span>Save Profile Changes</span>
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
