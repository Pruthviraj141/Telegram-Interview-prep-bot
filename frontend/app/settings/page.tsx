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
  AlertCircle
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
  const [codeCopied, setCodeCopied] = useState<boolean>(false);

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
      setKeySuccess(`Groq key updated: ${res.key_masked}`);
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
    if (!confirm("Are you sure you want to permanently delete all your interview sessions and debrief history? This cannot be undone.")) {
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
    <div className="min-h-screen bg-[#F4F1EA] flex flex-col">
      <Navbar user={user} />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#20232C] tracking-tight">
            Account & Security Settings
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your BYOK Groq API key, link with your Telegram bot companion, and exercise data deletion rights.
          </p>
        </div>

        {/* Groq Key Card */}
        <div className="bg-white border border-[#E4E0D6] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#20232C]">
            <Key className="w-4 h-4 text-[#5967F2]" />
            <span>Groq API Key (Encrypted at Rest)</span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Your Groq key authorises your private voice and LLM interviews. Current status:{" "}
            <span className="font-semibold text-emerald-700">
              {user?.groq_key_masked || "Not Configured"}
            </span>
          </p>

          {keySuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs">
              {keySuccess}
            </div>
          )}

          <form onSubmit={handleUpdateKey} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Replace Key
              </label>
              <input
                type="password"
                placeholder="gsk_..."
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#5967F2]"
              />
            </div>
            <button
              type="submit"
              disabled={keyUpdating || !newKey.trim()}
              className="px-4 py-2 bg-[#5967F2] text-white text-xs font-bold rounded-xl hover:bg-[#4855D6] transition disabled:opacity-50"
            >
              {keyUpdating ? "Validating & Encrypting..." : "Update Groq Key"}
            </button>
          </form>
        </div>

        {/* Telegram Linking Card */}
        <div className="bg-white border border-[#E4E0D6] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#20232C]">
            <Send className="w-4 h-4 text-[#168A72]" />
            <span>Telegram Bot Companion Linking</span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Connect your Telegram account to receive daily practice reminders, quick text practice, and spaced revision tips.
            Linking uses a single-use code and never sends your Groq key to Telegram.
          </p>

          {user?.telegram_linked ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Your account is linked with Telegram!</span>
            </div>
          ) : (
            <div>
              {linkCode ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="text-[11px] text-slate-500 font-medium">Your 10-Minute One-Time Code:</div>
                  <div className="text-2xl font-mono font-black text-[#5967F2] tracking-widest">{linkCode}</div>
                  <p className="text-xs text-slate-600">
                    Open your Telegram bot and send: <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800 font-bold">/link {linkCode}</code>
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleGenerateLinkCode}
                  disabled={codeLoading}
                  className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-black transition flex items-center gap-2 disabled:opacity-50"
                >
                  {codeLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>Generate Linking Code</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Gemini TTS Audio Tester */}
        <TTSComponent />

        {/* Data Privacy & Deletion */}
        <div className="bg-white border border-red-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-red-700">
            <Trash2 className="w-4 h-4 text-red-600" />
            <span>Permanent History Deletion</span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            In compliance with candidate agency and privacy by design, you can permanently delete all your
            recorded turns, transcripts, answers, and debrief evaluations. Deleted data will no longer influence
            future preparation or recommendations.
          </p>

          {deleteSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs">
              All interview history successfully deleted.
            </div>
          )}

          <button
            onClick={handleDeleteHistory}
            disabled={deleting}
            className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition flex items-center gap-2 disabled:opacity-50"
          >
            {deleting ? "Deleting Records..." : "Permanently Delete Interview History"}
          </button>
        </div>
      </main>
    </div>
  );
}
