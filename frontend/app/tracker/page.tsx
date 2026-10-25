"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { api, CandidateUser } from "@/lib/api";
import { cn, getErrorMessage } from "@/lib/utils";
import {
  Briefcase,
  Plus,
  Calendar,
  Trash2,
  X,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";

const COLUMNS = ["Wishlist", "Applied", "Interviewing", "Offer", "Rejected"];

interface TrackerItem {
  id: string;
  company: string;
  role: string;
  status: string;
  deadline?: string | null;
  notes?: string | null;
}

export default function TrackerPage() {
  const [user, setUser] = useState<CandidateUser | null>(null);
  const [items, setItems] = useState<TrackerItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
  const [saveError, setSaveError] = useState<string | null>(null);

  const [reloadToken, setReloadToken] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function loadTracker() {
      try {
        const u = await api.getMe();
        if (cancelled) return;
        setUser(u);
        const data = await api.listTrackerItems();
        if (cancelled) return;
        setItems(data);
      } catch (err: unknown) {
        if (!cancelled) {
          setLoadError(
            getErrorMessage(err, "Could not load your applications right now."),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadTracker();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const handleRetry = () => {
    setLoading(true);
    setLoadError(null);
    setReloadToken((token) => token + 1);
  };

  useEffect(() => {
    if (!isModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen]);

  const closeModal = () => {
    setIsModalOpen(false);
    setSaveError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim() || !role.trim()) return;
    setSaving(true);
    setSaveError(null);
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
      setDeadline("");
      setNotes("");
      setReloadToken((token) => token + 1);
    } catch (err: unknown) {
      setSaveError(
        getErrorMessage(err, "Could not save that application. Nothing was added."),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: TrackerItem) => {
    setDeletingId(item.id);
    setActionError(null);
    try {
      await api.deleteTrackerItem(item.id);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch (err: unknown) {
      setActionError(
        getErrorMessage(err, `Could not remove ${item.company}. Nothing was deleted.`),
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AppShell user={user} width="wide" contentClassName="space-y-6 sm:space-y-8">
      <PageHeader
        eyebrow="Placement tracker"
        title="Applications"
        description="Track job opportunities, interview rounds, and offer deadlines."
        actions={
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            <span>Add application</span>
          </Button>
        }
      />

      {loadError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger-subtle p-4 text-sm text-danger-ink sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-center gap-2">
            <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {loadError}
          </span>
          <Button variant="secondary" size="sm" onClick={handleRetry}>
            Try again
          </Button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger-subtle p-4 text-sm text-danger-ink"
        >
          <span className="flex items-center gap-2">
            <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {actionError}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss error"
            onClick={() => setActionError(null)}
            className="shrink-0 text-danger-ink hover:bg-danger/10 hover:text-danger-ink"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Mobile stage filter */}
      <div
        role="group"
        aria-label="Filter applications by stage"
        className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 md:hidden"
      >
        {COLUMNS.map((col) => {
          const count = items.filter((it) => it.status === col).length;
          const isActive = mobileActiveStage === col;
          return (
            <button
              key={col}
              type="button"
              onClick={() => setMobileActiveStage(col)}
              aria-pressed={isActive}
              className={cn(
                "flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors",
                isActive
                  ? "border-transparent bg-accent-strong text-on-accent"
                  : "border-line bg-surface-sunken text-ink-secondary hover:border-line-strong",
              )}
            >
              <span>{col}</span>
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-[10px] font-bold leading-5",
                  isActive
                    ? "bg-on-accent/20 text-on-accent"
                    : "border border-line bg-surface text-ink-tertiary",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Spinner size="lg" label="Loading applications…" />
        </div>
      ) : items.length === 0 && !loadError ? (
        <EmptyState
          icon={Briefcase}
          title="No applications tracked yet"
          description="Add the roles you are pursuing to keep deadlines and stages in one place."
          action={
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              <span>Add your first application</span>
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop board */}
          <div className="hidden gap-4 overflow-x-auto pb-4 md:grid md:grid-cols-5">
            {COLUMNS.map((col) => {
              const colItems = items.filter((it) => it.status === col);
              return (
                <div
                  key={col}
                  className="flex min-w-[200px] flex-col rounded-card border border-line bg-surface-sunken p-3"
                >
                  <div className="mb-3 flex items-center justify-between gap-2 px-1">
                    <span className="text-xs font-semibold text-ink">{col}</span>
                    <Badge variant="neutral" className="tabular">
                      {colItems.length}
                    </Badge>
                  </div>

                  <div className="flex-1 space-y-2.5">
                    {colItems.map((item) => (
                      <div
                        key={item.id}
                        className="group space-y-2 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-line-strong"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-ink">
                              {item.company}
                            </div>
                            <div className="truncate text-[11px] text-ink-secondary">
                              {item.role}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${item.company} — ${item.role}`}
                            onClick={() => handleDelete(item)}
                            loading={deletingId === item.id}
                            className="-mr-1 -mt-1 h-7 w-7 shrink-0 text-ink-tertiary opacity-0 transition-opacity hover:text-danger-ink focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                          >
                            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {item.deadline && (
                          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-sunken px-2 py-1 text-[10px] font-medium text-ink-secondary">
                            <Calendar
                              aria-hidden="true"
                              className="h-3 w-3 text-ink-tertiary"
                            />
                            <span>{item.deadline}</span>
                          </div>
                        )}

                        {item.notes && (
                          <p className="line-clamp-3 text-[11px] leading-relaxed text-ink-secondary">
                            {item.notes}
                          </p>
                        )}
                      </div>
                    ))}

                    {colItems.length === 0 && (
                      <div className="rounded-xl border border-dashed border-line p-5 text-center text-[11px] text-ink-tertiary">
                        Nothing here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile stage list */}
          <div className="space-y-3 md:hidden">
            {items
              .filter((it) => it.status === mobileActiveStage)
              .map((item) => (
                <Card key={item.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">
                        {item.company}
                      </div>
                      <div className="truncate text-xs text-ink-secondary">
                        {item.role}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${item.company} — ${item.role}`}
                      onClick={() => handleDelete(item)}
                      loading={deletingId === item.id}
                      className="-mr-1 -mt-1 shrink-0 text-ink-tertiary hover:text-danger-ink"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </div>

                  {item.deadline && (
                    <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-sunken px-2.5 py-1 text-xs font-medium text-ink-secondary">
                      <Calendar
                        aria-hidden="true"
                        className="h-3.5 w-3.5 text-ink-tertiary"
                      />
                      <span>Deadline: {item.deadline}</span>
                    </div>
                  )}

                  {item.notes && (
                    <p className="text-xs leading-relaxed text-ink-secondary">
                      {item.notes}
                    </p>
                  )}
                </Card>
              ))}

            {items.filter((it) => it.status === mobileActiveStage).length ===
              0 && (
              <EmptyState
                title={`No applications in ${mobileActiveStage}`}
                description="Switch stages above or add a new application."
              />
            )}
          </div>
        </>
      )}

      {/* Add application dialog */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-application-title"
            className="w-full max-w-md space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-overlay sm:p-7"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="add-application-title"
                  className="font-serif text-lg font-medium text-ink"
                >
                  Add application
                </h2>
                <p className="mt-1 text-xs text-ink-secondary">
                  Only what you enter is stored. Deadlines are optional.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close dialog"
                onClick={closeModal}
                className="-mr-2 -mt-2 shrink-0 text-ink-tertiary"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <Field label="Company" required>
                <Input
                  type="text"
                  placeholder="e.g. Google, Amazon"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </Field>

              <Field label="Role" required>
                <Input
                  type="text"
                  placeholder="e.g. Software Engineer"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Stage">
                  <Select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {COLUMNS.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Deadline" hint="Optional">
                  <Input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Notes" hint="Optional — rounds, contacts, next steps">
                <Textarea
                  rows={3}
                  placeholder="e.g. Recruiter screen booked for Tuesday"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>

              {saveError && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-subtle p-3 text-xs text-danger-ink"
                >
                  <AlertCircle
                    aria-hidden="true"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  />
                  {saveError}
                </p>
              )}

              <div className="flex gap-2.5 pt-1">
                <Button
                  variant="secondary"
                  onClick={closeModal}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={saving}
                  disabled={!company.trim() || !role.trim()}
                  className="flex-1"
                >
                  {saving ? "Saving…" : "Add application"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
