"use client";

import React, { useState, useEffect } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { DashboardView } from "@/components/DashboardView";
import { api, CandidateUser, DashboardData, InterviewSession } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

export default function HomePage() {
  const [user, setUser] = useState<CandidateUser | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const u = await api.getMe();
      setUser(u);
      if (u.onboarding_state === "COMPLETED") {
        const [dash, allSessions] = await Promise.all([
          api.getDashboard(),
          api.listInterviewSessions().catch(() => null),
        ]);
        setDashboardData(dash);
        setSessions(allSessions ?? dash.recent_sessions);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't reach the backend service."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Spinner size="md" />
        <span className="text-xs font-medium text-ink-secondary">
          Loading dashboard…
        </span>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4 rounded-card border border-line bg-surface p-8 text-center shadow-card">
          <div className="text-sm font-semibold text-warning-ink">
            Connection warning
          </div>
          <p className="text-xs leading-relaxed text-ink-secondary">
            {error || "Could not connect to the backend server. Please verify the service is running."}
          </p>
          <button
            onClick={loadData}
            className="w-full cursor-pointer rounded-lg bg-accent-strong py-2.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-strong/90"
          >
            Retry connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppShell user={user} width="wide">
      {user.onboarding_state !== "COMPLETED" ? (
        <OnboardingWizard initialUser={user} onComplete={loadData} />
      ) : (
        <DashboardView
          user={user}
          dashboardData={dashboardData}
          sessions={sessions}
        />
      )}
    </AppShell>
  );
}
