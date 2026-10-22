"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { api, CandidateUser } from "@/lib/api";
import {
  Settings as SettingsIcon,
  Key,
  ShieldAlert,
  Send,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Copy,
  AlertCircle,
  ShieldCheck
} from "lucide-react";

import { TTSComponent } from "@/components/TTSComponent";

export default function SettingsPage() {
  const [user, setUser] = useState<CandidateUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Groq key replace state
  const [newKey, setNewKey] = useState<string>("");
  const [keyUpdating, setKeyUpdating] = useState<boolean>(false);
  const [keySuccess, setKeySuccess] = useState<string | null>(null);

  // Telegram link code state
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState<boolean>(false);

  // History deletion state
  const [deleting, setDeleting] = useState<boolean>(false);
  const [deleteSuccess, setDeleteSuccess] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const u = await api.getMe();
      setUser(u);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUpdateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    setKeyUpdating(true);
    setKeySuccess(null);
    try {
      const res = await api.setupGroqKey(newKey.trim());
      setKeySuccess(`Groq key successfully updated: ${res.key_masked}`);
      setNewKey("");
      await loadData();
    } catch (err: any) {
      alert(err.message || "Failed to validate key.");
    } finally {
      setKeyUpdating(false);
    }
  };

  const handleGenerateLinkCode = async () => {
    setCodeLoading(true);
    try {
      const res = await api.getTelegramLinkCode();
      setLinkCode(res.code);
    } finally {
      setCodeLoading(false);
    }
  };

  const handleDeleteHistory = async () => {
    if (!confirm("Are you sure you want to permanently delete all your interview sessions and debrief history? This action cannot be undone.")) {
      return;
    }
    setDeleting(true);
    try {
      await api.deleteAllHistory();
      setDeleteSuccess(true);
      setTimeout(() => setDeleteSuccess(false), 4000);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F1EA] text-[#20232C] flex flex-col font-sans">
      <Navbar user={user} />

      <main className="flex-1 max-w-3xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-6 sm:py-12 space-y-6 sm:space-y-8 pb-24 md:pb-12">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#E8E5DD] text-[#20232C] text-xs font-semibold tracking-tight mb-2.5 shadow-xs">
            <SettingsIcon className="w-3.5 h-3.5 text-[#4F46E5]" />
            <span>Preferences & BYOK Security</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-[#20232C]">
            Settings & Privacy
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
            Manage your Groq API credentials, connect your Telegram bot, and exercise candidate data rights.
          </p>
        </div>

        {/* Groq Key Card */}
        <div className="bg-white border border-[#E8E5DD] rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#F4F1EA]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#FAFAF8] border border-[#E8E5DD] flex items-center justify-center text-[#20232C]">
                <Key className="w-4 h-4" />
              </div>
              <h2 className="text-xs sm:text-sm font-semibold text-[#20232C]">
                Groq API Key (Encrypted at Rest)
              </h2>
            </div>
            {user?.groq_key_configured && (
              <span className="text-[10px] sm:text-[11px] font-medium text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                {user.groq_key_masked}
              </span>
            )}
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Your Groq key powers turn-by-turn voice interviews and answer evaluation. Plaintext keys are encrypted using Fernet cryptography and never returned to the browser.
          </p>

          {keySuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{keySuccess}</span>
            </div>
          )}

          <form onSubmit={handleUpdateKey} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Replace Groq Key
              </label>
              <input
                type="password"
                placeholder="gsk_..."
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-base sm:text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#20232C]"
              />
            </div>
            <button
              type="submit"
              disabled={keyUpdating || !newKey.trim()}
              className="w-full sm:w-auto px-5 py-2.5 bg-[#20232C] hover:bg-black text-white text-xs font-semibold rounded-xl transition disabled:opacity-50 cursor-pointer min-h-[44px]"
            >
              {keyUpdating ? "Validating & Encrypting..." : "Update Groq Key"}
            </button>
          </form>
        </div>

        {/* Telegram Linking Card */}
        <div className="bg-white border border-[#E8E5DD] rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#F4F1EA]">
            <div className="w-8 h-8 rounded-xl bg-[#FAFAF8] border border-[#E8E5DD] flex items-center justify-center text-[#20232C]">
              <Send className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-[#20232C]">
              Telegram Bot Companion Link
            </h2>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Connect your Telegram account to practice flashcards, receive spaced review questions, and stay consistent on mobile.
            Linking uses a single-use code and never sends your Groq key over Telegram.
          </p>

          {user?.telegram_linked ? (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Your account is actively linked with the Telegram Bot!</span>
            </div>
          ) : (
            <div>
              {linkCode ? (
                <div className="p-5 bg-[#FAFAF8] border border-[#E8E5DD] rounded-2xl space-y-2">
                  <div className="text-[11px] text-slate-500 font-medium">Your 10-Minute One-Time Code:</div>
                  <div className="text-3xl font-mono font-bold text-[#20232C] tracking-widest">{linkCode}</div>
                  <p className="text-xs text-slate-600">
                    Open your Telegram bot and send: <code className="bg-white px-2 py-0.5 rounded-lg border border-[#E8E5DD] font-bold text-[#20232C]">/link {linkCode}</code>
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleGenerateLinkCode}
                  disabled={codeLoading}
                  className="px-5 py-2.5 bg-[#20232C] hover:bg-black text-white text-xs font-semibold rounded-xl transition flex items-center gap-2 disabled:opacity-50 cursor-pointer min-h-[38px]"
                >
                  {codeLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Generate Link Code</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Neural TTS Synthesis Engine Tester */}
        <TTSComponent />

        {/* Data Privacy & Permanent Deletion */}
        <div className="bg-white border border-rose-200/80 rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-rose-100">
            <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-700">
              <Trash2 className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-rose-800">
              Data Privacy & Permanent Deletion
            </h2>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            In compliance with candidate agency and privacy by design, you can permanently delete all your
            recorded turns, transcripts, answers, and debrief evaluations. Deleted data cannot be recovered.
          </p>

          {deleteSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs">
              All interview records have been permanently purged.
            </div>
          )}

          <button
            onClick={handleDeleteHistory}
            disabled={deleting}
            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl transition flex items-center gap-2 disabled:opacity-50 cursor-pointer min-h-[38px]"
          >
            {deleting ? "Purging Records..." : "Permanently Delete Interview Records"}
          </button>
        </div>
      </main>
    </div>
  );
}
