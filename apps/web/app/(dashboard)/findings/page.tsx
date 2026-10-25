"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Download,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import FindingCard from "@/components/findings/finding-card";
import {
  EmptyState,
  MetricCard,
  Pagination,
  SearchInput,
  PageSkeleton,
} from "@/components/ui";
import {
  getAllFindings,
  getSavedScans,
  subscribeToStore,
} from "@/lib/scans/scan-store";
import type { Finding } from "@bug-detective/shared-types";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

function FindingsContent() {
  const searchParams = useSearchParams();
  const scanIdParam = searchParams.get("scanId") || "all";

  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [scans, setScans] = useState<ReturnType<typeof getSavedScans>>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [analyzerFilter, setAnalyzerFilter] = useState<string>("all");
  const [selectedScanId, setSelectedScanId] = useState<string>(scanIdParam);
  const [sortBy, setSortBy] = useState<
    "severity_desc" | "severity_asc" | "confidence" | "file" | "line"
  >("severity_desc");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const loadData = () => {
    setFindings(getAllFindings());
    setScans(getSavedScans());
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    return subscribeToStore(() => {
      loadData();
    });
  }, []);

  useEffect(() => {
    if (scanIdParam) {
      setSelectedScanId(scanIdParam);
    }
  }, [scanIdParam]);

  // Reset pagination when filter changes
  useEffect(() => {
    setPage(1);
  }, [
    searchQuery,
    severityFilter,
    categoryFilter,
    statusFilter,
    analyzerFilter,
    selectedScanId,
    sortBy,
    pageSize,
  ]);

  // Filter and Sort
  const filteredFindings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return findings
      .filter((f) => {
        const matchesQuery =
          q.length === 0 ||
          f.title.toLowerCase().includes(q) ||
          f.filePath.toLowerCase().includes(q) ||
          (f.ruleId && f.ruleId.toLowerCase().includes(q)) ||
          (f.explanation && f.explanation.toLowerCase().includes(q)) ||
          f.evidence.toLowerCase().includes(q);

        const matchesSeverity =
          severityFilter === "all" || f.severity === severityFilter;

        const matchesCategory =
          categoryFilter === "all" || f.category === categoryFilter;

        const matchesStatus =
          statusFilter === "all" || f.status === statusFilter;

        const matchesAnalyzer =
          analyzerFilter === "all" || f.analyzer === analyzerFilter;

        const matchesScan =
          selectedScanId === "all" || f.scanId === selectedScanId;

        return (
          matchesQuery &&
          matchesSeverity &&
          matchesCategory &&
          matchesStatus &&
          matchesAnalyzer &&
          matchesScan
        );
      })
      .sort((a, b) => {
        if (sortBy === "severity_desc") {
          return (
            (SEVERITY_ORDER[b.severity] || 0) -
            (SEVERITY_ORDER[a.severity] || 0)
          );
        }
        if (sortBy === "severity_asc") {
          return (
            (SEVERITY_ORDER[a.severity] || 0) -
            (SEVERITY_ORDER[b.severity] || 0)
          );
        }
        if (sortBy === "confidence") {
          return (b.confidence ?? 0) - (a.confidence ?? 0);
        }
        if (sortBy === "file") {
          return a.filePath.localeCompare(b.filePath);
        }
        if (sortBy === "line") {
          return a.startLine - b.startLine;
        }
        return 0;
      });
  }, [
    findings,
    searchQuery,
    severityFilter,
    categoryFilter,
    statusFilter,
    analyzerFilter,
    selectedScanId,
    sortBy,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredFindings.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedFindings = filteredFindings.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  // Metrics
  const totalCount = findings.length;
  const criticalCount = findings.filter(
    (f) => f.severity === "critical" || f.severity === "high",
  ).length;
  const confirmedCount = findings.filter((f) => f.status === "confirmed").length;
  const falsePositiveCount = findings.filter(
    (f) => f.status === "false_positive",
  ).length;
  const needsReviewCount = findings.filter(
    (f) => f.status === "needs_review",
  ).length;
  const aiFindingsCount = findings.filter((f) => f.analyzer === "ai-model").length;

  const handleResetFilters = () => {
    setSearchQuery("");
    setSeverityFilter("all");
    setCategoryFilter("all");
    setStatusFilter("all");
    setAnalyzerFilter("all");
    setSelectedScanId("all");
    setSortBy("severity_desc");
  };

  // Export triage feedback for AI training
  const handleExportTriage = () => {
    const feedbackSamples = findings.map((f) => ({
      finding_id: f.id,
      rule_id: f.ruleId,
      file_path: f.filePath,
      line_start: f.startLine,
      line_end: f.endLine,
      evidence: f.evidence,
      explanation: f.explanation,
      triage_decision: f.status,
      timestamp: new Date().toISOString(),
    }));

    const blob = new Blob([JSON.stringify(feedbackSamples, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bug-detective-triage-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setExportNotice(
      `Exported ${feedbackSamples.length} triage decisions for AI model fine-tuning!`,
    );
    setTimeout(() => setExportNotice(null), 4000);
  };

  if (loading) {
    return <PageSkeleton variant="metrics" count={4} />;
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Bug className="size-4" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Defect & Issue Tracker
            </p>
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Findings Tracker
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Review code defects, evaluate AI explanations, and mark confirmed bugs or false positives.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportTriage}
            className="gap-1.5 rounded-xl text-xs font-medium"
            title="Export triage labels to fine-tune AI model"
          >
            <Download className="size-3.5" />
            <span>Export Triage Dataset</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
            className="gap-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            <span>Reset Filters</span>
          </Button>
        </div>
      </div>

      {/* Export notification */}
      {exportNotice && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
            <span>{exportNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            className="text-emerald-400 hover:opacity-80"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Reusable Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          title="Total Issues"
          value={totalCount}
          subtitle="Across active scans"
          variant="default"
        />
        <MetricCard
          title="Critical & High"
          value={criticalCount}
          subtitle="High priority risks"
          variant="critical"
        />
        <MetricCard
          title="AI Detected"
          value={aiFindingsCount}
          subtitle="With code explanations"
          variant="purple"
          icon={Sparkles}
        />
        <MetricCard
          title="Confirmed Bugs"
          value={confirmedCount}
          subtitle="Verified by engineer"
          variant="critical"
        />
        <MetricCard
          title="False Positives"
          value={falsePositiveCount}
          subtitle="Ignored / dismissed"
          variant="default"
        />
        <MetricCard
          title="Needs Review"
          value={needsReviewCount}
          subtitle="Pending manual review"
          variant="warning"
        />
      </div>

      {/* Toolbar: Reusable Search, Filters, Sort */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by rule ID (AI-SEC-001), title, file path, or code evidence..."
        />

        {/* Filters and Sorting Row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Severity filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            aria-label="Filter by severity"
            className="h-9 rounded-xl border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="h-9 rounded-xl border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="all">All Categories</option>
            <option value="security">Security</option>
            <option value="bug">Bug</option>
            <option value="performance">Performance</option>
            <option value="maintainability">Maintainability</option>
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="h-9 rounded-xl border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="all">All Triage Statuses</option>
            <option value="needs_review">Needs Review</option>
            <option value="confirmed">Confirmed Defect</option>
            <option value="false_positive">False Positive</option>
          </select>

          {/* Analyzer filter */}
          <select
            value={analyzerFilter}
            onChange={(e) => setAnalyzerFilter(e.target.value)}
            aria-label="Filter by analyzer"
            className="h-9 rounded-xl border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="all">All Analyzers</option>
            <option value="ai-model">AI Model Only</option>
            <option value="typescript-ast">TypeScript AST</option>
          </select>

          {/* Scan Filter */}
          {scans.length > 1 && (
            <select
              value={selectedScanId}
              onChange={(e) => setSelectedScanId(e.target.value)}
              aria-label="Filter by scan"
              className="h-9 rounded-xl border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All Scans</option>
              {scans.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.repositoryFullName || s.fixtureId} (
                  {s.commitSha ? s.commitSha.slice(0, 7) : "Local"})
                </option>
              ))}
            </select>
          )}

          {/* Sort Selector */}
          <div className="ml-auto flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="Sort findings"
              className="h-9 rounded-xl border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="severity_desc">Severity: High → Low</option>
              <option value="severity_asc">Severity: Low → High</option>
              <option value="confidence">Highest AI Confidence</option>
              <option value="file">File Path (A → Z)</option>
              <option value="line">Line Number</option>
            </select>
          </div>
        </div>
      </div>

      {/* Findings List or Reusable Empty State */}
      {filteredFindings.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No matching findings"
          description={
            searchQuery || severityFilter !== "all" || categoryFilter !== "all"
              ? "No findings matched your current search or filter criteria."
              : "No findings recorded yet. Run a scan to discover code defects."
          }
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleResetFilters}>
                Reset Filters
              </Button>
              <Link href="/repositories">
                <Button size="sm">Go to Repositories</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-3.5">
          {paginatedFindings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} />
          ))}
        </div>
      )}

      {/* Reusable Pagination with Ellipsis (...) */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={filteredFindings.length}
        pageSize={pageSize}
        pageSizeOptions={[5, 10, 20, 50]}
        onPageSizeChange={setPageSize}
        itemLabel="findings"
      />
    </main>
  );
}

export default function FindingsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="metrics" count={4} />}>
      <FindingsContent />
    </Suspense>
  );
}
