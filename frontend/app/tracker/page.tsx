"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { api, CandidateUser } from "@/lib/api";
import { Briefcase, Plus, Calendar, Building2, Trash2, Edit2, ArrowRight, RefreshCw } from "lucide-react";

const COLUMNS = ["Wishlist", "Applied", "Interviewing", "Offer", "Rejected"];

export default function TrackerPage() {
  const [user, setUser] = useState<CandidateUser | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [company, setCompany] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [status, setStatus] = useState<string>("Applied");
  const [deadline, setDeadline] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const u = await api.getMe();
      setUser(u);
      const data = await api.listTrackerItems();
      setItems(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim() || !role.trim()) return;
    setSaving(true);
    try {
      await api.createTrackerItem({
        company,
        role,
        status,
        deadline: deadline || undefined,
        notes: notes || undefined,
      });
      setIsModalOpen(false);
      setCompany("");
      setRole("");
      setNotes("");
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      await api.deleteTrackerItem(itemId);
      setItems(items.filter((it) => it.id !== itemId));
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F1EA] flex flex-col">
      <Navbar user={user} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#20232C] tracking-tight">
              Placement Pipeline Tracker
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Organize target opportunities and link preparation actions directly to hiring deadlines.
            </p>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-[#5967F2] hover:bg-[#4855D6] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" /> Add Opportunity
          </button>
        </div>

        {/* Kanban Board */}
        {loading ? (
          <div className="py-20 flex justify-center">
            <RefreshCw className="w-6 h-6 text-[#5967F2] animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
            {COLUMNS.map((col) => {
              const colItems = items.filter((it) => it.status === col);
              return (
                <div key={col} className="bg-slate-200/50 rounded-2xl p-4 flex flex-col min-w-[220px]">
                  <div className="flex items-center justify-between mb-3 text-xs font-bold uppercase tracking-wider text-slate-600">
                    <span>{col}</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-300/80 text-[10px]">
                      {colItems.length}
                    </span>
                  </div>

                  <div className="space-y-3 flex-1">
                    {colItems.map((item) => (
                      <div
                        key={item.id}
                        className="bg-white border border-[#E4E0D6] rounded-xl p-4 shadow-2xs hover:border-slate-300 transition space-y-2 group"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-bold text-xs text-[#20232C]">{item.company}</div>
                            <div className="text-[11px] text-slate-500">{item.role}</div>
                          </div>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {item.deadline && (
                          <div className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-medium">
                            <Calendar className="w-3 h-3" />
                            <span>{item.deadline}</span>
                          </div>
                        )}
                      </div>
                    ))}

                    {colItems.length === 0 && (
                      <div className="border border-dashed border-slate-300 rounded-xl p-4 text-center text-[11px] text-slate-400">
                        No opportunities
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4E0D6] rounded-3xl p-8 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-[#20232C]">Add Target Opportunity</h3>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Company</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Google, Flipkart"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Role Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SDE 1, Graduate Trainee"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Stage</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {COLUMNS.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Deadline or Interview Date</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-[#5967F2] text-white font-bold hover:bg-[#4855D6] transition"
                >
                  {saving ? "Saving..." : "Add to Pipeline"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
