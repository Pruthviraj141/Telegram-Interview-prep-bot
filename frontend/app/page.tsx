"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { DashboardView } from "@/components/DashboardView";
import { api, CandidateUser } from "@/lib/api";
import { RefreshCw } from "lucide-react";

export default function HomePage() {
  const [user, setUser] = useState<CandidateUser | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const u = await api.getMe();
      setUser(u);
      if (u.onboarding_state === "COMPLETED") {
        const dash = await api.getDashboard();
        setDashboardData(dash);
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect to backend service.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F1EA] flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-6 h-6 text-[#5967F2] animate-spin" />
        <span className="text-xs uppercase tracking-widest font-semibold text-slate-500">
          Loading Coach Workspace...
        </span>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="min-h-screen bg-[#F4F1EA] flex flex-col items-center justify-center p-4">
        <div className="bg-white border border-[#E4E0D6] rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-xs">
          <div className="text-red-500 font-bold text-sm">Connection Warning</div>
          <p className="text-xs text-slate-600 leading-relaxed">
            {error || "Could not retrieve candidate identity. Ensure FastAPI backend is running on http://127.0.0.1:8000."}
          </p>
          <button
            onClick={loadData}
            className="w-full py-2.5 bg-[#5967F2] text-white rounded-xl text-xs font-bold hover:bg-[#4855D6] transition"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F1EA] flex flex-col">
      <Navbar user={user} />
      <main className="flex-1">
        {user.onboarding_state !== "COMPLETED" ? (
          <OnboardingWizard initialUser={user} onComplete={loadData} />
        ) : (
          <DashboardView user={user} dashboardData={dashboardData} />
        )}
      </main>
    </div>
  );
}
