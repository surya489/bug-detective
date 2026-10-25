"use client";

import { use, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCode,
  FolderGit2,
  GitCommit,
  Radar,
  Sparkles,
} from "lucide-react";
import { Button, PageSkeleton } from "@/components/ui";
import FindingCard from "@/components/findings/finding-card";
import ScanFindingsReport from "@/components/findings/scan-findings-report";
import { getScanById, subscribeToStore } from "@/lib/scans/scan-store";
import type { AnalysisResponse } from "@bug-detective/shared-types";

function ScanDetailContent({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = use(params);
  const [scan, setScan] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setScan(getScanById(scanId) || null);
    setLoading(false);

    return subscribeToStore(() => {
      setScan(getScanById(scanId) || null);
    });
  }, [scanId]);

  if (loading) {
    return <PageSkeleton variant="detail" />;
  }

  if (!scan) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 text-center">
        <Radar className="mx-auto size-12 text-muted-foreground/60" />
        <h1 className="mt-4 text-xl font-bold text-foreground">Scan Not Found</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          No scan record found matching ID &quot;{scanId}&quot;.
        </p>
        <div className="mt-6">
          <Link href="/scans">
            <Button size="sm" variant="outline" className="gap-2">
              <ArrowLeft className="size-4" />
              <span>Back to Scans</span>
            </Button>
          </Link>
        </div>
      </main>
    );
  }

  const durationMs =
    new Date(scan.finishedAt).getTime() - new Date(scan.startedAt).getTime();
  const durationSec = (Math.max(0, durationMs) / 1000).toFixed(1);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
      {/* Back button & scan header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Link href="/scans">
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
              title="Back to all scans"
            >
              <ArrowLeft className="size-4" />
            </button>
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-foreground">
                {scan.repositoryFullName || `Fixture: ${scan.fixtureId}`}
              </h1>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400 capitalize">
                {scan.status}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              {scan.commitSha && (
                <span className="font-mono">SHA: {scan.commitSha.slice(0, 10)}</span>
              )}
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {durationSec}s
              </span>
              <span>•</span>
              <span>{new Date(scan.startedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <Link href={`/findings?scanId=${scan.id}`}>
          <Button size="sm" variant="outline" className="text-xs">
            Open in Findings Tracker
          </Button>
        </Link>
      </div>

      {/* Analyzer Overview Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Total Findings</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{scan.findings.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Critical Vulnerabilities</p>
          <p className="mt-2 text-2xl font-bold text-rose-400">
            {scan.findings.filter((f) => f.severity === "critical").length}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">AI Model Findings</p>
          <p className="mt-2 text-2xl font-bold text-purple-400">
            {scan.findings.filter((f) => f.analyzer === "ai-model").length}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Files Analyzed</p>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {scan.files.filter((f) => f.status === "included").length}
          </p>
        </div>
      </div>

      {/* Findings Report with Pagination */}
      {scan.findings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center text-xs text-muted-foreground">
          No findings detected in this scan.
        </div>
      ) : (
        <ScanFindingsReport scan={scan} initialPageSize={5} />
      )}
    </main>
  );
}

export default function ScanDetailPage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <ScanDetailContent params={params} />
    </Suspense>
  );
}
