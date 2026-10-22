"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { api, CandidateUser, InterviewSession } from "@/lib/api";
import { History, Award, Trash2, ArrowRight, RefreshCw, Calendar } from "lucide-react";

export default function HistoryPage() {
  const [user, setUser] = useState<CandidateUser | null>(null);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const u = await api.getMe();
      setUser(u);
      const list = await api.listInterviewSessions();
      setSessions(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm("Delete this session from your history?")) return;
    try {
      await api.deleteInterviewSession(id);
      setSessions(sessions.filter((s) => s.id !== id));
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F1EA] flex flex-col">
      <Navbar user={user} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 pb-24 md:pb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#20232C] tracking-tight">
            Interview Studio History
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
            Review past simulation evaluations, evidence excerpts, and demonstrated topic mastery.
          </p>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <RefreshCw className="w-5 h-5 text-[#20232C] animate-spin" />
          </div>
        ) : sessions.length > 0 ? (
          <div className="space-y-3">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className="bg-white border border-[#E8E5DD] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 hover:border-slate-300 transition group"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#4F46E5]">
                      {sess.mode} ({sess.interviewer_style})
                    </span>
                    <span className="text-[11px] text-slate-400">•</span>
                    <span className="text-xs text-[#20232C] font-semibold">{sess.target_role}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{new Date(sess.created_at).toLocaleDateString()}</span>
                    <span>•</span>
                    <span className="capitalize">{sess.status.replace("_", " ")}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-auto w-full sm:w-auto justify-end pt-1 sm:pt-0 border-t border-slate-100 sm:border-t-0">
                  {sess.overall_score && (
                    <span className="px-2.5 py-1 rounded-xl bg-[#20232C] text-[#F4F1EA] font-semibold text-xs flex items-center gap-1.5 shadow-2xs">
                      <Award className="w-3.5 h-3.5 text-amber-300" />
                      <span>{sess.overall_score} / 5.0</span>
                    </span>
                  )}
                  <Link
                    href={`/interview/${sess.id}/debrief`}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-[#20232C] hover:text-[#F4F1EA] rounded-xl text-xs font-semibold text-slate-700 transition flex items-center gap-1 min-h-[40px]"
                  >
                    <span>View Debrief</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    onClick={(e) => handleDelete(sess.id, e)}
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition cursor-pointer"
                    title="Delete session"
                    aria-label="Delete session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-[#E8E5DD] rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center space-y-4">
            <History className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-semibold text-[#20232C]">No Interview Sessions Yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Start your first turn-by-turn voice or text practice session in the studio to record performance and track readiness.
            </p>
            <Link
              href="/interview"
              className="inline-flex items-center justify-center px-5 py-2.5 bg-[#20232C] text-[#F4F1EA] text-xs font-semibold rounded-xl hover:bg-black transition shadow-xs min-h-[44px]"
            >
              Start Practice Session
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
