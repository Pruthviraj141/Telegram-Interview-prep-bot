"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { api, CandidateUser } from "@/lib/api";
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

      const res = await fetch("http://localhost:8000/api/company-prep", {
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
    <div className="min-h-screen bg-[#F4F1EA] text-[#20232C] flex flex-col font-sans">
      <Navbar user={user} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-6 sm:py-12 space-y-6 sm:space-y-8 pb-24 md:pb-12">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#E8E5DD] text-[#20232C] text-xs font-semibold tracking-tight mb-2.5 shadow-xs">
            <Building2 className="w-3.5 h-3.5 text-[#4F46E5]" />
            <span>Target Company Placement Pack</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-[#20232C]">
            Company-Specific Rehearsal
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
            Curate technical interview blueprints aligned to the exact engineering culture, tech stack, and interview formats of your target company.
          </p>
        </div>

        {/* Search Input Card */}
        <div className="bg-white border border-[#E8E5DD] rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-xs">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 sm:gap-3.5">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Target Company
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Amazon, Google, Microsoft, TCS, Infosys"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-base sm:text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#20232C]"
              />
            </div>

            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Target Role
              </label>
              <input
                type="text"
                placeholder={user?.target_role || "Software Engineer"}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-base sm:text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#20232C]"
              />
            </div>

            <div className="sm:self-end">
              <button
                type="submit"
                disabled={loading || !company.trim()}
                className="w-full sm:w-auto px-6 py-2.5 bg-[#20232C] hover:bg-black text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer min-h-[44px]"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>Fetch Pack</span>
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
            <div className="bg-white border border-[#E8E5DD] rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F4F1EA]">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Grounded Blueprint
                  </span>
                  <h2 className="text-xl font-semibold text-[#20232C]">
                    {prepData.company} • {prepData.target_role}
                  </h2>
                </div>
                <Link
                  href={`/interview?style=mixed`}
                  className="px-4 py-2 bg-[#20232C] text-white text-xs font-semibold rounded-xl hover:bg-black transition inline-flex items-center gap-1.5 shadow-xs self-start sm:self-auto"
                >
                  <span>Rehearse in Studio</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {prepData.research_summary}
              </p>

              <div className="p-3 bg-[#FAFAF8] border border-[#E8E5DD] rounded-2xl text-[11px] text-slate-500 leading-relaxed">
                <strong>Disclaimer:</strong> {prepData.disclaimer}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
                Target Interview Questions Blueprint
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {prepData.practice_questions?.map((q: any) => (
                  <div
                    key={q.id}
                    className="bg-white border border-[#E8E5DD] rounded-2xl p-5 shadow-xs space-y-2 hover:border-slate-300 transition"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-600 uppercase tracking-tight">{q.category}</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#FAFAF8] border border-[#E8E5DD] font-semibold text-slate-700">
                        {q.difficulty}
                      </span>
                    </div>
                    <div className="text-xs sm:text-sm font-semibold text-[#20232C] leading-snug">
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
