"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { DebriefView } from "@/components/DebriefView";
import { api, CandidateUser, InterviewSession, InterviewTurn } from "@/lib/api";
import { RefreshCw, AlertCircle } from "lucide-react";
import { Suspense } from "react";

function DebriefContent() {
  const params = useParams();
  const sessionId = params.id as string;


  const [user, setUser] = useState<CandidateUser | null>(null);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDebrief() {
      setLoading(true);
      setError(null);
      try {
        const u = await api.getMe();
        setUser(u);
        const data = await api.getInterviewSession(sessionId);
        setSession(data.session);
        setTurns(data.turns);
      } catch (err: any) {
        setError(err.message || "Failed to load session debrief.");
      } finally {
        setLoading(false);
      }
    }
    if (sessionId) fetchDebrief();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F1EA] flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-6 h-6 text-[#5967F2] animate-spin" />
        <span className="text-xs uppercase tracking-widest font-semibold text-slate-500">
          Generating Comprehensive Debrief...
        </span>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-[#F4F1EA] flex flex-col items-center justify-center p-4">
        <div className="bg-white border border-[#E4E0D6] rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-xs">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
          <h2 className="text-base font-bold text-[#20232C]">Debrief Unavailable</h2>
          <p className="text-xs text-slate-600 leading-relaxed">{error || "Could not retrieve debrief records."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F1EA] flex flex-col">
      <Navbar user={user} />
      <main className="flex-1">
        <DebriefView session={session} turns={turns} debrief={session.debrief} />
      </main>
    </div>
  );
}

export default function DebriefPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F4F1EA] flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-6 h-6 text-[#5967F2] animate-spin" />
          <span className="text-xs uppercase tracking-widest font-semibold text-slate-500">
            Generating Comprehensive Debrief...
          </span>
        </div>
      }
    >
      <DebriefContent />
    </Suspense>
  );
}

