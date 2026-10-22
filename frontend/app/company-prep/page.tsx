"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { api, CandidateUser } from "@/lib/api";
import { Building2, Search, ArrowRight, Sparkles, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";

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
    <div className="min-h-screen bg-[#F4F1EA] flex flex-col">
      <Navbar user={user} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-[#168A72] text-xs font-bold uppercase tracking-wider mb-2">
            <Building2 className="w-3.5 h-3.5" /> Company Rehearsal
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#20232C] tracking-tight">
            Target Company Placement Prep
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Grounded practice drills combining curated questions, your confirmed profile, and company-specific technical blueprints.
          </p>
        </div>

        {/* Search Input Card */}
        <div className="bg-white border border-[#E4E0D6] rounded-2xl p-6 shadow-xs">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Company Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Amazon, TCS, Microsoft, Infosys"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#5967F2]"
              />
            </div>

            <div className="flex-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Target Role
              </label>
              <input
                type="text"
                placeholder={user?.target_role || "Software Engineer"}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#5967F2]"
              />
            </div>

            <div className="sm:self-end">
              <button
                type="submit"
                disabled={loading || !company.trim()}
                className="w-full sm:w-auto px-6 py-2.5 bg-[#168A72] hover:bg-[#12725E] text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>Fetch Prep Pack</span>
              </button>
            </div>
          </form>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-red-800 text-xs">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Results */}
        {prepData && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-white border border-[#E4E0D6] rounded-2xl p-6 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#168A72]">
                  {prepData.company} • {prepData.target_role}
                </span>
                <Link
                  href={`/interview?style=mixed`}
                  className="px-4 py-2 bg-[#5967F2] text-white text-xs font-bold rounded-xl hover:bg-[#4855D6] transition flex items-center gap-1.5 shadow-xs"
                >
                  <span>Rehearse in Studio</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                {prepData.research_summary}
              </p>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-relaxed">
                <strong>Disclaimer:</strong> {prepData.disclaimer}
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Recommended Practice Question Blueprint
              </h2>
              {prepData.practice_questions?.map((q: any) => (
                <div
                  key={q.id}
                  className="bg-white border border-[#E4E0D6] rounded-xl p-4 shadow-2xs space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-[#5967F2] uppercase">{q.category}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold text-slate-600">
                      {q.difficulty}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[#20232C]">{q.question}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
