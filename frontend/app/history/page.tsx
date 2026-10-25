"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { api, CandidateUser, InterviewSession } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { Award, ArrowRight, CalendarDays, History, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";

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
    <AppShell user={user} width="default" contentClassName="space-y-6">
      <PageHeader
        title="History"
        description="Review past interview rounds, turn scores, and feedback debriefs."
        actions={
          <Link href="/interview" className={buttonClasses({ size: "sm" })}>
            Start a round
          </Link>
        }
      />

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-card border border-danger/30 bg-danger-subtle p-4 text-sm text-danger-ink sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{error}</span>
          <Button variant="secondary" size="sm" onClick={handleRetry}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner label="Loading your rounds" />
        </div>
      ) : sessions.length > 0 ? (
        <ul className="space-y-3">
          {sessions.map((sess) => {
            const isInProgress = sess.status === "in_progress";
            return (
              <li key={sess.id}>
                <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-sunken text-xs font-semibold text-ink-secondary">
                      Q{sess.current_turn_index || 0}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-ink">
                          {sess.target_role}
                        </span>
                        <span className="text-xs capitalize text-ink-tertiary">
                          {sess.interviewer_style?.replace("_", " ") || "General"}
                        </span>
                        {isInProgress ? (
                          <Badge variant="warning">In progress</Badge>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-tertiary">
                        <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
                        <span className="capitalize">{sess.mode}</span>
                        <span aria-hidden="true">·</span>
                        <span>{new Date(sess.created_at).toLocaleDateString()}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">
                          {sess.status.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 self-end border-t border-line pt-3 sm:self-auto sm:border-t-0 sm:pt-0">
                    {sess.overall_score != null ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-warning-subtle px-2.5 py-1 text-xs font-semibold text-warning-ink">
                        <Award aria-hidden="true" className="h-3.5 w-3.5" />
                        <span className="tabular">
                          {Number(sess.overall_score).toFixed(1)} / 5.0
                        </span>
                      </span>
                    ) : null}

                    {isInProgress ? (
                      <Link
                        href={`/interview?resume=${sess.id}`}
                        className={buttonClasses({ size: "sm" })}
                      >
                        Resume round
                        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                      </Link>
                    ) : (
                      <Link
                        href={`/interview/${sess.id}/debrief`}
                        className={buttonClasses({
                          variant: "secondary",
                          size: "sm",
                        })}
                      >
                        Review feedback
                        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                      </Link>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDelete(sess.id, e)}
                      disabled={deletingId === sess.id}
                      title="Delete session"
                      aria-label="Delete session"
                    >
                      {deletingId === sess.id ? (
                        <Spinner size="sm" />
                      ) : (
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card className="p-6 sm:p-8">
          <EmptyState
            icon={History}
            title="No practice rounds yet"
            description="Pick any topic and run through a 5-minute drill. You will get instant scores and feedback after every round."
            action={
              <Link href="/interview" className={buttonClasses()}>
                Start a practice round
              </Link>
            }
          />
        </Card>
      )}
    </AppShell>
  );
}
