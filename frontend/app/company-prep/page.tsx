"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { api, CandidateUser, getApiBase } from "@/lib/api";
import { Building2, Search, ArrowRight, Sparkles, AlertCircle, RefreshCw, CheckCircle2, ArrowLeft } from "lucide-react";

export default function CompanyPrepPage() {
  const [user, setUser] = useState<CandidateUser | null>(null);
  const [company, setCompany] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [prepData, setPrepData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getMe().then(setUser).catch(() => {});
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("company_name", company.trim());
      if (role.trim()) formData.append("target_role", role.trim());

      const res = await fetch(`${getApiBase()}/company-prep`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${user?.id || "demo"}`,
          "X-Clerk-User-Id": user?.id || "demo"
        },
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to load company preparation pack.");
      const data = await res.json();
      setPrepData(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch company prep.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#202124] flex flex-col font-sans">
      <Navbar user={user} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-6 sm:py-12 space-y-6 sm:space-y-8 pb-24 md:pb-12">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#202124]">
            Company Interview Packs
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Targeted practice questions for the companies visiting your college.
          </p>
        </div>

        {/* Search Input Card */}
        <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xs">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 sm:gap-3.5">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Company
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Amazon, Google, Microsoft, TCS"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs text-[#202124] focus:outline-none focus:ring-1 focus:ring-[#202124]"
              />
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Role
              </label>
              <input
                type="text"
                placeholder={user?.target_role || "Software Engineer"}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs text-[#202124] focus:outline-none focus:ring-1 focus:ring-[#202124]"
              />
            </div>

            <div className="sm:self-end">
              <button
                type="submit"
                disabled={loading || !company.trim()}
                className="w-full sm:w-auto px-5 py-2.5 bg-[#202124] hover:bg-[#111113] text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer min-h-[44px]"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>Generate Questions</span>
              </button>
            </div>
          </form>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200/80 rounded-2xl flex items-center gap-2.5 text-rose-800 text-xs shadow-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Results Pack */}
        {prepData && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E6E6E4]">
                <div>
                  <h2 className="text-lg font-semibold text-[#202124]">
                    {prepData.company} • {prepData.target_role}
                  </h2>
                </div>
                <Link
                  href={`/interview?style=mixed`}
                  className="px-3.5 py-2 bg-[#202124] hover:bg-[#111113] text-white text-xs font-semibold rounded-xl transition inline-flex items-center gap-1.5 shadow-xs self-start sm:self-auto"
                >
                  <span>Practice Questions</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {prepData.research_summary}
              </p>

              {prepData.disclaimer && (
                <div className="p-3 bg-[#F7F7F5] border border-[#E6E6E4] rounded-xl text-[11px] text-slate-500 leading-relaxed">
                  {prepData.disclaimer}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 px-1">
                Interview Questions
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {prepData.practice_questions?.map((q: any) => (
                  <div
                    key={q.id}
                    className="bg-white border border-[#E6E6E4] rounded-xl p-4 sm:p-5 shadow-xs space-y-2 hover:border-slate-300 transition"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-600 uppercase tracking-tight">{q.category}</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#F7F7F5] border border-[#E6E6E4] font-semibold text-slate-700">
                        {q.difficulty}
                      </span>
                    </div>
                    <div className="text-xs sm:text-sm font-semibold text-[#202124] leading-snug">
                      {q.question}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
