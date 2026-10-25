"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TTSComponent } from "@/components/TTSComponent";
import { api, CandidateUser } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Key,
  Send,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";

export default function SettingsPage() {
  const [user, setUser] = useState<CandidateUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Groq key replace state
  const [newKey, setNewKey] = useState<string>("");
  const [keyUpdating, setKeyUpdating] = useState<boolean>(false);
  const [keySuccess, setKeySuccess] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  // Telegram link code state
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState<boolean>(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // History deletion state
  const [confirmingDelete, setConfirmingDelete] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [deleteSuccess, setDeleteSuccess] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const u = await api.getMe();
        if (!cancelled) setUser(u);
      } catch (err: unknown) {
        if (!cancelled) {
          setLoadError(getErrorMessage(err, "Could not load your settings."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    setKeyUpdating(true);
    setKeySuccess(null);
    setKeyError(null);
    try {
      const res = await api.setupGroqKey(newKey.trim());
      setKeySuccess(`Groq key updated: ${res.key_masked}`);
      setNewKey("");
      try {
        const u = await api.getMe();
        setUser(u);
      } catch {
        // The key change already succeeded; a stale masked value in the
        // header is harmless and fixes itself on the next page load.
      }
    } catch (err: unknown) {
      setKeyError(
        getErrorMessage(err, "That key could not be validated. Nothing was changed."),
      );
    } finally {
      setKeyUpdating(false);
    }
  };

  const handleGenerateLinkCode = async () => {
    setCodeLoading(true);
    setCodeError(null);
    setCopied(false);
    try {
      const res = await api.getTelegramLinkCode();
      setLinkCode(res.code);
    } catch (err: unknown) {
      setCodeError(
        getErrorMessage(err, "Could not generate a link code. Try again."),
      );
    } finally {
      setCodeLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!linkCode) return;
    try {
      await navigator.clipboard.writeText(`/link ${linkCode}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked by the browser; the code is visible
      // on screen so the user can still copy it by hand.
      setCopied(false);
    }
  };

  const handleDeleteHistory = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteAllHistory();
      setDeleteSuccess(true);
      setConfirmingDelete(false);
      setTimeout(() => setDeleteSuccess(false), 4000);
    } catch (err: unknown) {
      setDeleteError(
        getErrorMessage(err, "Could not delete your history. Nothing was removed."),
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell user={user} width="narrow" contentClassName="space-y-6 sm:space-y-8">
      <PageHeader
        eyebrow="Settings"
        title="Account & privacy"
        description="Manage your Groq API key, Telegram companion, voice preview, and stored interview data."
      />

      {loading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" label="Loading settings…" />
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-subtle p-4 text-xs font-medium text-danger-ink"
        >
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {!loading && (
        <>
          <Card className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-ink">Appearance</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
                  Follow your system setting, or pin the light workspace or dark
                  studio.
                </p>
              </div>
              <ThemeToggle variant="segmented" hideLegend />
            </div>
          </Card>

          <Card className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-surface-sunken text-ink">
                  <Key aria-hidden="true" className="h-4 w-4" />
                </span>
                <h2 className="text-sm font-semibold text-ink">Groq API key</h2>
              </div>
              {user?.groq_key_configured && user.groq_key_masked ? (
                <Badge variant="success">{user.groq_key_masked}</Badge>
              ) : null}
            </div>

            <p className="text-xs leading-relaxed text-ink-secondary">
              Your key powers transcription and answer evaluation. It is
              encrypted at rest and never sent to the Telegram bot.
            </p>

            {keySuccess && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-subtle p-3 text-xs font-medium text-success-ink"
              >
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span>{keySuccess}</span>
              </div>
            )}

            {keyError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-subtle p-3 text-xs font-medium text-danger-ink"
              >
                <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span>{keyError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateKey} className="space-y-3">
              <Field
                label="Replace Groq key"
                hint="Paste a key from console.groq.com. Validation happens before it is saved."
              >
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder="gsk_…"
                  className="font-mono"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                />
              </Field>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  loading={keyUpdating}
                  disabled={!newKey.trim()}
                >
                  {keyUpdating ? "Saving key…" : "Update Groq key"}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center gap-2.5 border-b border-line pb-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-surface-sunken text-ink">
                <Send aria-hidden="true" className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold text-ink">
                Telegram companion
              </h2>
            </div>

            <p className="text-xs leading-relaxed text-ink-secondary">
              Connect Telegram to practice flashcards and spaced-review
              questions on mobile. Linking uses a single-use code that expires
              in ten minutes.
            </p>

            {user?.telegram_linked ? (
              <div
                role="status"
                className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-subtle p-3.5 text-xs font-medium text-success-ink"
              >
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span>Your account is linked to the Telegram bot.</span>
              </div>
            ) : linkCode ? (
              <div className="space-y-3 rounded-xl border border-line bg-surface-sunken p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">
                  One-time code · expires in 10 minutes
                </p>
                <p className="font-mono text-2xl font-semibold tracking-[0.2em] text-ink">
                  {linkCode}
                </p>
                <p className="text-xs leading-relaxed text-ink-secondary">
                  Open the bot and send{" "}
                  <code className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink">
                    /link {linkCode}
                  </code>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={handleCopy}>
                    {copied ? (
                      <>
                        <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                        <span>Copy command</span>
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleGenerateLinkCode}
                    loading={codeLoading}
                  >
                    Generate new code
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {codeError && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-subtle p-3 text-xs font-medium text-danger-ink"
                  >
                    <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span>{codeError}</span>
                  </div>
                )}
                <Button onClick={handleGenerateLinkCode} loading={codeLoading}>
                  <Send aria-hidden="true" className="h-3.5 w-3.5" />
                  <span>{codeLoading ? "Generating…" : "Generate link code"}</span>
                </Button>
              </div>
            )}
          </Card>

          <TTSComponent />

          <Card className="space-y-4 border-danger/30 p-4 sm:p-6">
            <div className="flex items-center gap-2.5 border-b border-line pb-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-danger/30 bg-danger-subtle text-danger-ink">
                <ShieldAlert aria-hidden="true" className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold text-danger-ink">
                Data privacy & deletion
              </h2>
            </div>

            <p className="text-xs leading-relaxed text-ink-secondary">
              Deleting removes every saved round: transcripts, answers, scores,
              and debrief notes. Your profile and API key are kept. Deleted data
              cannot be recovered.
            </p>

            {deleteSuccess && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-subtle p-3 text-xs font-medium text-success-ink"
              >
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span>All interview records have been permanently deleted.</span>
              </div>
            )}

            {deleteError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-subtle p-3 text-xs font-medium text-danger-ink"
              >
                <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            {confirmingDelete ? (
              <div className="space-y-3 rounded-xl border border-danger/30 bg-danger-subtle p-4">
                <p className="text-xs font-medium leading-relaxed text-danger-ink">
                  Delete all interview records permanently? This cannot be
                  undone.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    loading={deleting}
                    onClick={handleDeleteHistory}
                  >
                    {deleting ? "Deleting…" : "Yes, delete everything"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={deleting}
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="secondary"
                className="border-danger/40 text-danger-ink hover:bg-danger-subtle"
                onClick={() => {
                  setDeleteError(null);
                  setConfirmingDelete(true);
                }}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                <span>Delete interview records</span>
              </Button>
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}
