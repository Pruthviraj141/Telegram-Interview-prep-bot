"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { api, CandidateUser } from "@/lib/api";
import { Briefcase, Plus, Calendar, Building2, Trash2, Edit2, ArrowRight, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

const COLUMNS = ["Wishlist", "Applied", "Interviewing", "Offer", "Rejected"];

export default function TrackerPage() {
  const [user, setUser] = useState<CandidateUser | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Mobile active tab view
  const [mobileActiveStage, setMobileActiveStage] = useState<string>("Applied");

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
    <div className="min-h-screen bg-white text-[#202124] flex flex-col font-sans">
      <Navbar user={user} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-6 sm:py-12 space-y-6 sm:space-y-8 pb-24 md:pb-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#202124]">
              Applications
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Track job opportunities, interview rounds, and offer deadlines.
            </p>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#202124] hover:bg-[#111113] text-white text-xs font-semibold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Add Application</span>
          </button>
        </div>

        {/* Mobile Stage Segmented Filter (Optimized for 360px & 390px screens) */}
        <div className="flex md:hidden overflow-x-auto gap-1.5 pb-2 studio-scroll">
          {COLUMNS.map((col) => {
            const count = items.filter((it) => it.status === col).length;
            const isActive = mobileActiveStage === col;
            return (
              <button
                key={col}
                type="button"
                onClick={() => setMobileActiveStage(col)}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 shrink-0",
                  isActive
                    ? "bg-[#202124] text-white shadow-xs"
                    : "bg-[#F7F7F5] text-slate-600 border border-[#E6E6E4]"
                )}
              >
                <span>{col}</span>
                <span className={cn("text-[10px] px-1.5 py-0.2 rounded-full", isActive ? "bg-white/20 text-white" : "bg-white text-slate-500 border border-[#E6E6E4]")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Board / Kanban View */}
        {loading ? (
          <div className="py-24 flex justify-center">
            <RefreshCw className="w-6 h-6 text-[#202124] animate-spin" />
          </div>
        ) : (
          <div>
            {/* Desktop 5-Column Grid */}
            <div className="hidden md:grid md:grid-cols-5 gap-4 overflow-x-auto pb-4">
              {COLUMNS.map((col) => {
                const colItems = items.filter((it) => it.status === col);
                return (
                  <div key={col} className="bg-[#F7F7F5] rounded-2xl p-4 flex flex-col min-w-[210px] border border-[#E6E6E4]">
                    <div className="flex items-center justify-between mb-3.5 px-1">
                      <span className="text-xs font-semibold tracking-tight text-[#202124]">{col}</span>
                      <span className="px-2 py-0.5 rounded-full bg-white border border-[#E6E6E4] text-[10px] font-bold text-slate-600">
                        {colItems.length}
                      </span>
                    </div>

                    <div className="space-y-3 flex-1">
                      {colItems.map((item) => (
                        <div
                          key={item.id}
                          className="bg-white border border-[#E6E6E4] rounded-xl p-3.5 shadow-xs hover:border-slate-300 transition space-y-2 group"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-semibold text-xs text-[#202124]">{item.company}</div>
                              <div className="text-[11px] text-slate-500">{item.role}</div>
                            </div>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition p-1 cursor-pointer"
                              title="Delete opportunity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {item.deadline && (
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-700 bg-[#F7F7F5] px-2 py-1 rounded-lg border border-[#E6E6E4] font-medium">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>{item.deadline}</span>
                            </div>
                          )}
                        </div>
                      ))}

                      {colItems.length === 0 && (
                        <div className="border border-dashed border-[#E6E6E4] rounded-xl p-5 text-center text-[11px] text-slate-400">
                          Empty
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile Active Stage Cards List */}
            <div className="md:hidden space-y-3">
              {items
                .filter((it) => it.status === mobileActiveStage)
                .map((item) => (
                  <div
                    key={item.id}
                    className="bg-white border border-[#E6E6E4] rounded-xl p-4 shadow-xs space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-sm text-[#202124]">{item.company}</div>
                        <div className="text-xs text-slate-500">{item.role}</div>
                      </div>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-slate-400 hover:text-rose-500 transition p-1 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {item.deadline && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-[#F7F7F5] px-2.5 py-1 rounded-lg border border-[#E6E6E4] font-medium">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Deadline: {item.deadline}</span>
                      </div>
                    )}
                  </div>
                ))}

              {items.filter((it) => it.status === mobileActiveStage).length === 0 && (
                <div className="bg-white border border-[#E6E6E4] rounded-xl p-8 text-center text-xs text-slate-400">
                  No applications in {mobileActiveStage}.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E6E6E4] rounded-2xl sm:rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#202124]">Add Application</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-black">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Company</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Google, Amazon"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs focus:outline-none focus:ring-1 focus:ring-[#202124]"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Role</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Software Engineer"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#E6E6E4] rounded-xl text-base sm:text-xs focus:outline-none focus:ring-1 focus:ring-[#202124]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Stage</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-base sm:text-xs"
                  >
                    {COLUMNS.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Deadline</label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-700 text-base sm:text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[#E6E6E4] text-[#5F6368] font-semibold hover:bg-[#F7F7F5] transition min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !company.trim() || !role.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-[#202124] hover:bg-[#111113] text-white font-semibold transition disabled:opacity-50 cursor-pointer min-h-[44px]"
                >
                  {saving ? "Saving..." : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
