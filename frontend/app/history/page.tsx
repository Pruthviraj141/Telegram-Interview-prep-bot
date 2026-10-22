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

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#20232C] tracking-tight">
            Interview Studio History
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review past simulation evaluations, evidence excerpts, and demonstrated topic mastery.
          </p>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <RefreshCw className="w-6 h-6 text-[#5967F2] animate-spin" />
          </div>
        ) : sessions.length > 0 ? (
          <div className="space-y-3">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className="bg-white border border-[#E4E0D6] rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-slate-300 transition group"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#5967F2]">
                      {sess.mode} ({sess.interviewer_style})
                    </span>
                    <span className="text-[11px] text-slate-400">•</span>
                    <span className="text-xs text-slate-600 font-semibold">{sess.target_role}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(sess.created_at).toLocaleDateString()}</span>
                    <span>•</span>
                    <span className="capitalize">{sess.status.replace("_", " ")}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  {sess.overall_score && (
                    <span className="px-3 py-1 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs">
                      <Award className="w-3.5 h-3.5 text-[#65D9F2]" />
                      <span>{sess.overall_score} / 5.0</span>
                    </span>
                  )}
                  <Link
                    href={`/interview/${sess.id}/debrief`}
                    className="px-4 py-2 bg-slate-100 hover:bg-[#5967F2] hover:text-white rounded-xl text-xs font-semibold text-slate-700 transition flex items-center gap-1"
                  >
                    <span>View Debrief</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    onClick={(e) => handleDelete(sess.id, e)}
                    className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition"
                    title="Delete session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-[#E4E0D6] rounded-3xl p-12 text-center space-y-4">
            <History className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-[#20232C]">No Interview Sessions Yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Start your first turn-by-turn voice or text practice session in the studio to record performance and track readiness.
            </p>
            <Link
              href="/interview"
              className="inline-block px-5 py-2.5 bg-[#5967F2] text-white text-xs font-bold rounded-xl hover:bg-[#4855D6] transition shadow-xs"
            >
              Start Practice Session
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
