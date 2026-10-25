"use client";

import React, { Suspense, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { DebriefView } from "@/components/DebriefView";
import { Spinner } from "@/components/ui/spinner";
import { api, CandidateUser, InterviewSession, InterviewTurn } from "@/lib/api";

function LoadingDebrief() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <Spinner size="md" />
      <span className="text-xs font-medium text-ink-secondary">
        Loading debrief…
      </span>
    </div>
  );
}

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
    return <LoadingDebrief />;
  }

  if (error || !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4 rounded-card border border-line bg-surface p-8 text-center shadow-card">
          <AlertCircle
            aria-hidden="true"
            className="mx-auto h-8 w-8 text-danger-ink"
          />
          <h2 className="text-base font-semibold text-ink">
            Debrief unavailable
          </h2>
          <p className="text-xs leading-relaxed text-ink-secondary">
            {error || "Could not retrieve debrief records."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <AppShell user={user} width="default">
      <DebriefView session={session} turns={turns} debrief={session.debrief} />
    </AppShell>
  );
}

export default function DebriefPage() {
  return (
    <Suspense fallback={<LoadingDebrief />}>
      <DebriefContent />
    </Suspense>
  );
}
