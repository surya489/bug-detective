"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  FolderGit2,
  FileCode,
  GitCommit,
  Play,
  Radar,
  RefreshCw,
  Sparkles,
  X,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  MetricCard,
  Pagination,
  ScanStatusBadge,
  SearchInput,
  PageSkeleton,
} from "@/components/ui";
import {
  getSavedScans,
  saveScan,
  subscribeToStore,
} from "@/lib/scans/scan-store";
import type {
  AnalysisResponse,
  ScanStatus,
} from "@bug-detective/shared-types";

function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return "recently";
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000)
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ScansPage() {
  const [scans, setScans] = useState<AnalysisResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggeringFixture, setTriggeringFixture] = useState<string | null>(null);
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "findings" | "duration">("newest");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);

  // Expanded details drawer
  const [expandedScanId, setExpandedScanId] = useState<string | null>(null);

  useEffect(() => {
    setScans(getSavedScans());
    setLoading(false);

    return subscribeToStore(() => {
      setScans(getSavedScans());
    });
  }, []);

  // Quick run fixture scan
  const handleRunFixtureScan = async (fixtureId: "buggy-react-app" | "clean-react-app") => {
    setTriggeringFixture(fixtureId);
    setTriggerMessage(null);
    try {
      const response = await fetch("/api/analyzer/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fixtureId }),
      });
      const data = (await response.json()) as AnalysisResponse;
      if (!response.ok) {
        throw new Error("Failed to trigger local fixture scan.");
      }
      saveScan(data);
      setTriggerMessage(`Successfully completed scan for ${fixtureId}! Discovered ${data.findings.length} findings.`);
      setTimeout(() => setTriggerMessage(null), 5000);
    } catch (err) {
      setTriggerMessage(err instanceof Error ? err.message : "Failed to run scan.");
    } finally {
      setTriggeringFixture(null);
    }
  };

  // Filtered and Sorted Scans
  const filteredScans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return scans
      .filter((s) => {
        const matchesQuery =
          q.length === 0 ||
          s.id.toLowerCase().includes(q) ||
          (s.repositoryFullName && s.repositoryFullName.toLowerCase().includes(q)) ||
          (s.fixtureId && s.fixtureId.toLowerCase().includes(q)) ||
          (s.commitSha && s.commitSha.toLowerCase().includes(q));

        const matchesStatus =
          statusFilter === "all" || s.status === statusFilter;

        const matchesType =
          typeFilter === "all" ||
          (typeFilter === "repository" && Boolean(s.repositoryFullName)) ||
          (typeFilter === "fixture" && Boolean(s.fixtureId && !s.repositoryFullName));

        return matchesQuery && matchesStatus && matchesType;
      })
      .sort((a, b) => {
        if (sortBy === "oldest") {
          return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
        }
        if (sortBy === "findings") {
          return b.findings.length - a.findings.length;
        }
        if (sortBy === "duration") {
          const durA = new Date(a.finishedAt).getTime() - new Date(a.startedAt).getTime();
          const durB = new Date(b.finishedAt).getTime() - new Date(b.startedAt).getTime();
          return durB - durA;
        }
        return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
      });
  }, [scans, searchQuery, statusFilter, typeFilter, sortBy]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, typeFilter, sortBy, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredScans.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedScans = filteredScans.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  // Aggregate Metrics
  const totalFindingsCount = useMemo(
    () => scans.reduce((acc, s) => acc + s.findings.length, 0),
    [scans],
  );
  const criticalCount = useMemo(
    () =>
      scans.reduce(
        (acc, s) =>
          acc +
          s.findings.filter((f) => f.severity === "critical" || f.severity === "high")
            .length,
        0,
      ),
    [scans],
  );

  if (loading) {
    return <PageSkeleton variant="list" count={5} />;
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Radar className="size-4" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Inspection Engine
            </p>
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Scan History & Runs
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Review recent commit scans, inspect analyzer performance, and examine defects.
          </p>
        </div>

        {/* Quick Action Triggers */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={triggeringFixture !== null}
            onClick={() => void handleRunFixtureScan("buggy-react-app")}
            className="gap-1.5 rounded-xl text-xs font-medium"
          >
            {triggeringFixture === "buggy-react-app" ? (
              <RefreshCw className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5 fill-current" />
            )}
            <span>Scan Buggy Fixture</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={triggeringFixture !== null}
            onClick={() => void handleRunFixtureScan("clean-react-app")}
            className="gap-1.5 rounded-xl text-xs font-medium"
          >
            {triggeringFixture === "clean-react-app" ? (
              <RefreshCw className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5 fill-current" />
            )}
            <span>Scan Clean Fixture</span>
          </Button>

          <Link href="/repositories">
            <Button size="sm" className="gap-1.5 rounded-xl text-xs font-semibold">
              <FolderGit2 className="size-3.5" />
              <span>Scan GitHub Repo</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Trigger Notification Banner */}
      {triggerMessage && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 p-3.5 text-xs text-primary">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 shrink-0" />
            <span>{triggerMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setTriggerMessage(null)}
            className="text-primary hover:opacity-80"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Reusable Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          title="Total Scans Run"
          value={scans.length}
          subtitle="Across all repos & fixtures"
          variant="default"
        />
        <MetricCard
          title="Completed Scans"
          value={scans.filter((s) => s.status === "completed").length}
          subtitle="Zero runtime failures"
          variant="success"
        />
        <MetricCard
          title="Total Findings"
          value={totalFindingsCount}
          subtitle="Discovered by analyzers"
          variant="default"
        />
        <MetricCard
          title="Critical & High Issues"
          value={criticalCount}
          subtitle="Requiring triage or fix"
          variant="critical"
        />
      </div>

      {/* Search, Filter & Sort Controls */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Reusable Search Bar */}
        <div className="flex-1">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by repo, commit SHA, or scan ID..."
          />
        </div>

        {/* Filter & Sort Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter scans by status"
            className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="partial">Partial</option>
            <option value="failed">Failed</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter scans by target type"
            className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="all">All Target Types</option>
            <option value="repository">GitHub Repositories</option>
            <option value="fixture">Local Fixtures</option>
          </select>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            aria-label="Sort scans"
            className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="newest">Newest Scans First</option>
            <option value="oldest">Oldest Scans First</option>
            <option value="findings">Most Findings First</option>
            <option value="duration">Longest Duration</option>
          </select>
        </div>
      </div>

      {/* Scans List or Reusable Empty State */}
      {filteredScans.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="No scans found"
          description={
            searchQuery
              ? `No scans match "${searchQuery}". Try clearing search or adjusting filters.`
              : "No scans have been run yet. Kick off a fixture scan or analyze a repository commit."
          }
          action={
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRunFixtureScan("buggy-react-app")}
              >
                Run Sample Scan
              </Button>
              <Link href="/repositories">
                <Button size="sm">Go to Repositories</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-4">
          {paginatedScans.map((scan) => {
            const isExpanded = expandedScanId === scan.id;
            const durationMs =
              new Date(scan.finishedAt).getTime() - new Date(scan.startedAt).getTime();
            const durationSec = (Math.max(0, durationMs) / 1000).toFixed(1);

            const critCount = scan.findings.filter((f) => f.severity === "critical").length;
            const highCount = scan.findings.filter((f) => f.severity === "high").length;
            const medCount = scan.findings.filter((f) => f.severity === "medium").length;
            const lowCount = scan.findings.filter((f) => f.severity === "low").length;
            const aiCount = scan.findings.filter((f) => f.analyzer === "ai-model").length;

            return (
              <div
                key={scan.id}
                className="overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-primary/40"
              >
                <div className="p-5 sm:p-6">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-background">
                        {scan.repositoryFullName ? (
                          <FolderGit2 className="size-5 text-primary" />
                        ) : (
                          <FileCode className="size-5 text-purple-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-semibold text-foreground">
                            {scan.repositoryFullName || `Fixture: ${scan.fixtureId}`}
                          </h2>
                          <ScanStatusBadge status={scan.status} />
                          {aiCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-300">
                              <Sparkles className="size-2.5" />
                              {aiCount} AI Detected
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {scan.commitSha && (
                            <span className="inline-flex items-center gap-1 font-mono">
                              <GitCommit className="size-3" />
                              {scan.commitSha.slice(0, 7)}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3" />
                            {durationSec}s duration
                          </span>
                          <span>•</span>
                          <span>{formatRelativeTime(scan.startedAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Link href={`/findings?scanId=${scan.id}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 rounded-xl text-xs font-medium"
                        >
                          <span>View {scan.findings.length} Findings</span>
                          <ArrowRight className="size-3.5" />
                        </Button>
                      </Link>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpandedScanId(isExpanded ? null : scan.id)
                        }
                        className="gap-1 rounded-xl text-xs text-muted-foreground hover:text-foreground"
                      >
                        <span>{isExpanded ? "Hide" : "Details"}</span>
                        <ChevronDown
                          className={`size-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </Button>
                    </div>
                  </div>

                  {/* Findings breakdown badges */}
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Severity breakdown:
                    </span>
                    {critCount > 0 && (
                      <span className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                        {critCount} Critical
                      </span>
                    )}
                    {highCount > 0 && (
                      <span className="rounded-md border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-300">
                        {highCount} High
                      </span>
                    )}
                    {medCount > 0 && (
                      <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                        {medCount} Medium
                      </span>
                    )}
                    {lowCount > 0 && (
                      <span className="rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                        {lowCount} Low
                      </span>
                    )}
                    {scan.findings.length === 0 && (
                      <span className="text-[11px] text-emerald-400">
                        Zero vulnerabilities discovered. Clean build.
                      </span>
                    )}

                    <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>Files inspected: {scan.files.filter((f) => f.status === "included").length}</span>
                      <span>•</span>
                      <span>Analyzers: {scan.analyzers.map((a) => a.name).join(", ")}</span>
                    </div>
                  </div>
                </div>

                {/* Expanded Diagnostic Details */}
                {isExpanded && (
                  <div className="border-t border-border bg-background/50 p-5 text-xs sm:p-6 space-y-4">
                    <div>
                      <h4 className="font-semibold text-foreground">Analyzers Execution</h4>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {scan.analyzers.map((run) => (
                          <div
                            key={run.name}
                            className="rounded-xl border border-border bg-card p-3"
                          >
                            <div className="flex items-center justify-between font-medium">
                              <span className="text-foreground">{run.name}</span>
                              <span className="text-muted-foreground">{run.durationMs}ms</span>
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {run.message}
                            </p>
                            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/40 pt-1.5">
                              <span>Files: {run.filesAnalyzed}</span>
                              <span className="font-semibold text-primary">
                                Findings: {run.findingsCount}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-foreground">Inspected Files</h4>
                      <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto rounded-xl border border-border bg-card p-3">
                        {scan.files.map((file) => (
                          <div
                            key={file.path}
                            className="flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className="truncate font-mono text-foreground">
                              {file.path}
                            </span>
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                                file.status === "included"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {file.status} ({(file.sizeBytes / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reusable Pagination with Ellipsis (...) for Scans */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={filteredScans.length}
        pageSize={pageSize}
        pageSizeOptions={[4, 6, 10, 20]}
        onPageSizeChange={setPageSize}
        itemLabel="scans"
      />
    </main>
  );
}
