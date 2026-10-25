"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { api, CandidateUser, InterviewSession } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { History, Award, Trash2, ArrowRight, RefreshCw, Calendar, AlertCircle } from "lucide-react";

export default function HistoryPage() {
  const [user, setUser] = useState<CandidateUser | null>(null);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      try {
        const u = await api.getMe();
        if (cancelled) return;
        setUser(u);
        const list = await api.listInterviewSessions();
        if (cancelled) return;
        setSessions(list);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Could not load your interview history."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setReloadToken((token) => token + 1);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (deletingId) return;
    if (!confirm("Delete this session from your history?")) return;
    setDeletingId(id);
    setError(null);
    try {
      await api.deleteInterviewSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not delete that session. Nothing was removed."));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#202124] flex flex-col font-sans">
      <Navbar user={user} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 pb-24 md:pb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#202124] tracking-tight">
            History
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Review past interview rounds, turn scores, and feedback debriefs.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200/80 rounded-2xl text-rose-800 text-xs flex items-center justify-between gap-3 shadow-xs">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-medium">{error}</span>
            </span>
            <button
              onClick={handleRetry}
              className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 font-semibold hover:bg-rose-100 transition shrink-0 min-h-[32px]"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-20 flex justify-center">
            <RefreshCw className="w-5 h-5 text-[#202124] animate-spin" />
          </div>
        ) : sessions.length > 0 ? (
          <div className="space-y-3">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className="bg-white border border-[#E6E6E4] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 hover:border-slate-300 transition group"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-600">
                      {sess.mode} ({sess.interviewer_style})
                    </span>
                    <span className="text-[11px] text-slate-400">•</span>
                    <span className="text-xs text-[#202124] font-semibold">{sess.target_role}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{new Date(sess.created_at).toLocaleDateString()}</span>
                    <span>•</span>
                    <span className="capitalize">{sess.status.replace("_", " ")}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-auto w-full sm:w-auto justify-end pt-1 sm:pt-0 border-t border-slate-100 sm:border-t-0">
                  {sess.overall_score != null && (
                    <span className="px-2.5 py-1 rounded-xl bg-[#FAF2ED] border border-[#EED9CC] text-[#B3582A] font-bold text-xs flex items-center gap-1.5 shadow-2xs">
                      <Award className="w-3.5 h-3.5 text-[#C4744B]" />
                      <span>{Number(sess.overall_score).toFixed(1)} / 5.0</span>
                    </span>
                  )}
                  <Link
                    href={`/interview/${sess.id}/debrief`}
                    className="px-3.5 py-2 bg-[#F7F7F5] hover:bg-[#202124] hover:text-white border border-[#E6E6E4] rounded-xl text-xs font-semibold text-[#202124] transition flex items-center gap-1 min-h-[40px]"
                  >
                    <span>Review feedback</span>
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
          <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center space-y-4">
            <div className="w-10 h-10 rounded-2xl bg-[#FAF2ED] border border-[#EED9CC] text-[#B3582A] mx-auto flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-[#202124]">No practice rounds yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Pick any topic and run through a 5-minute drill. You will get instant scores and feedback after every round.
            </p>
            <Link
              href="/interview"
              className="inline-flex items-center justify-center px-4 py-2 bg-[#202124] hover:bg-[#111113] text-white text-xs font-semibold rounded-xl transition shadow-xs min-h-[44px]"
            >
              Start a practice round
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
