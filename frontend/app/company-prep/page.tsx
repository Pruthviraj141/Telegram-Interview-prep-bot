"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { api, CandidateUser, CompanyPrepPack } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { AlertCircle, ArrowRight, Building2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

export default function CompanyPrepPage() {
  const [user, setUser] = useState<CandidateUser | null>(null);
  const [company, setCompany] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [prepData, setPrepData] = useState<CompanyPrepPack | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getMe()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        // The header still renders without a profile; the request itself
        // reports its own failure below.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.companyPrep(company.trim(), role.trim() || undefined);
      setPrepData(data);
    } catch (err: unknown) {
      setError(
        getErrorMessage(err, "Could not load a prep pack for that company."),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell user={user} width="default" contentClassName="space-y-6 sm:space-y-8">
      <PageHeader
        eyebrow="Company prep"
        title="Company interview packs"
        description="Curated practice questions for a company you are targeting. These are common placement topics, not actual company questions."
      />

      <Card className="p-4 sm:p-6">
        <form
          onSubmit={handleSearch}
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
        >
          <Field label="Company" required className="flex-1">
            <Input
              type="text"
              placeholder="e.g. Amazon, Google, Microsoft, TCS"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </Field>

          <Field label="Role (optional)" className="flex-1">
            <Input
              type="text"
              placeholder={user?.target_role || "Software Engineer"}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </Field>

          <Button
            type="submit"
            loading={loading}
            disabled={!company.trim()}
            className="sm:mb-0"
          >
            {loading ? (
              <span>Generating…</span>
            ) : (
              <>
                <Search aria-hidden="true" className="h-4 w-4" />
                <span>Generate questions</span>
              </>
            )}
          </Button>
        </form>
      </Card>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-subtle p-4 text-xs font-medium text-danger-ink"
        >
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {prepData && (
        <div className="space-y-6">
          <Card className="space-y-4 p-6 sm:p-8">
            <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-ink">
                {prepData.company} · {prepData.target_role}
              </h2>
              <Link
                href="/interview?style=mixed"
                className={buttonClasses({ size: "sm", className: "self-start sm:self-auto" })}
              >
                <span>Practice questions</span>
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </div>

            <p className="text-sm leading-relaxed text-ink-secondary">
              {prepData.research_summary}
            </p>

            {prepData.disclaimer && (
              <p className="rounded-lg border border-line bg-surface-sunken p-3 text-[11px] leading-relaxed text-ink-tertiary">
                {prepData.disclaimer}
              </p>
            )}
          </Card>

          <div className="space-y-3">
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
              Practice questions
            </h3>
            <ul className="space-y-3">
              {prepData.practice_questions?.map((q) => (
                <li
                  key={q.id}
                  className="space-y-2 rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong sm:p-5"
                >
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="font-semibold uppercase tracking-tight text-ink-tertiary">
                      {q.category}
                    </span>
                    <Badge variant="outline">{q.difficulty}</Badge>
                  </div>
                  <p className="text-sm font-medium leading-snug text-ink">
                    {q.question}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!prepData && !loading && !error && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-line p-5 text-xs text-ink-tertiary">
          <Building2 aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>
            Enter a company name to pull a curated practice pack. Nothing is
            stored until you start a round.
          </span>
        </div>
      )}
    </AppShell>
  );
}
