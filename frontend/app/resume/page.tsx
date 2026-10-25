"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { api, CandidateUser, CandidateProfile } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";

export default function ResumePage() {
  const [user, setUser] = useState<CandidateUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [profile, setProfile] = useState<CandidateProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const u = await api.getMe();
        if (cancelled) return;
        setUser(u);
        const res = await api.getResume();
        if (cancelled) return;
        setProfile(res.confirmed_profile || res.parsed_profile);
      } catch (err: unknown) {
        if (!cancelled) {
          setLoadError(getErrorMessage(err, "Could not load your resume profile."));
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setSuccessMsg(null);
    setSaveError(null);
    try {
      const res = await api.confirmProfile(profile);
      if (res?.confirmed_profile) {
        setProfile(res.confirmed_profile);
      }
      setSuccessMsg(
        "Candidate profile updated. Future interview turns will adapt to these skills.",
      );
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setSaveError(
        getErrorMessage(
          err,
          "Could not save your profile. Your changes were not saved.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell user={user} width="narrow" contentClassName="space-y-6 sm:space-y-8">
      <PageHeader
        eyebrow="Resume profile"
        title="Profile & skills"
        description="Skills, target role, and projects used to personalize interview questions."
      />

      {successMsg && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-subtle p-4 text-xs font-medium text-success-ink"
        >
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
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

      {saveError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-subtle p-4 text-xs font-medium text-danger-ink"
        >
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" label="Loading your profile…" />
        </div>
      )}

      {!loading && !loadError && !profile && (
        <EmptyState
          icon={FileText}
          title="No resume profile yet"
          description="Upload a resume during onboarding to generate an editable profile. Interview questions stay grounded in what you confirm here."
        />
      )}

      {profile && (
        <Card className="p-4 sm:p-6">
          <form onSubmit={handleSave} className="space-y-5">
            <Field label="Primary target role" required>
              <Input
                type="text"
                value={profile.primary_role}
                onChange={(e) =>
                  setProfile({ ...profile, primary_role: e.target.value })
                }
              />
            </Field>

            <Field
              label="Programming languages"
              hint="Comma separated — e.g. Python, TypeScript"
            >
              <Input
                type="text"
                value={profile.programming_languages.join(", ")}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    programming_languages: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Field>

            <Field
              label="Frameworks, libraries & tools"
              hint="Comma separated — only what you have actually used"
            >
              <Input
                type="text"
                value={profile.frameworks_and_tools.join(", ")}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    frameworks_and_tools: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Field>

            <Field
              label="Notable projects"
              hint="One per line — architecture and claims you can defend out loud"
            >
              <Textarea
                rows={4}
                value={profile.notable_projects.join("\n")}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    notable_projects: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Field>

            <div className="flex justify-end border-t border-line pt-4">
              <Button type="submit" loading={saving}>
                {saving ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </AppShell>
  );
}
