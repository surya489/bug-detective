"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import FindingCard from "@/components/findings/finding-card";
import { EmptyState, Pagination, SearchInput } from "@/components/ui";
import type {
  AnalysisResponse,
  Finding,
  FindingCategory,
  FindingSeverity,
  FindingStatus,
} from "@bug-detective/shared-types";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

interface ScanFindingsReportProps {
  scan: AnalysisResponse;
  initialPageSize?: number;
}

export default function ScanFindingsReport({
  scan,
  initialPageSize = 5,
}: ScanFindingsReportProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<
    "severity_desc" | "severity_asc" | "line" | "file" | "confidence"
  >("severity_desc");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Reset page when filters or scan change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, severityFilter, categoryFilter, statusFilter, sortBy, pageSize, scan.id]);

  const filteredFindings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return scan.findings
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

        return matchesQuery && matchesSeverity && matchesCategory && matchesStatus;
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
        if (sortBy === "line") {
          return a.startLine - b.startLine;
        }
        if (sortBy === "file") {
          return a.filePath.localeCompare(b.filePath);
        }
        return 0;
      });
  }, [scan.findings, searchQuery, severityFilter, categoryFilter, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredFindings.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedFindings = filteredFindings.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const handleResetFilters = () => {
    setSearchQuery("");
    setSeverityFilter("all");
    setCategoryFilter("all");
    setStatusFilter("all");
    setSortBy("severity_desc");
  };

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    severityFilter !== "all" ||
    categoryFilter !== "all" ||
    statusFilter !== "all";

  return (
    <div className="space-y-4">
      {/* Header and Filter Controls */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Scan Findings ({scan.findings.length})
            </h4>
            <p className="text-xs text-muted-foreground">
              Paginated findings report with evidence and AI review.
            </p>
          </div>

          {/* Quick counts */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {scan.commitSha && (
              <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono font-medium text-amber-300">
                {scan.commitSha.slice(0, 7)}
              </span>
            )}
            <span className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 font-medium text-rose-300">
              {scan.findings.filter((f) => f.severity === "critical" || f.severity === "high").length} Critical/High
            </span>
            <span className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 font-medium text-purple-300">
              {scan.findings.filter((f) => f.analyzer === "ai-model").length} AI Verified
            </span>
            {scan.findings.some((f) => f.inCommitDiff) && (
              <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-300">
                {scan.findings.filter((f) => f.inCommitDiff).length} in commit diff
              </span>
            )}
          </div>
        </div>

        {/* Reusable Search Bar */}
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search report by title, rule ID, file, or code..."
        />

        {/* Filter and Sort Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Severity filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            aria-label="Filter report by severity"
            className="h-8.5 rounded-xl border border-border bg-background px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
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
            aria-label="Filter report by category"
            className="h-8.5 rounded-xl border border-border bg-background px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
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
            aria-label="Filter report by triage status"
            className="h-8.5 rounded-xl border border-border bg-background px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="needs_review">Needs Review</option>
            <option value="confirmed">Confirmed Defect</option>
            <option value="false_positive">False Positive</option>
          </select>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            aria-label="Sort findings report"
            className="h-8.5 rounded-xl border border-border bg-background px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="severity_desc">Severity: High → Low</option>
            <option value="severity_asc">Severity: Low → High</option>
            <option value="confidence">Highest AI Confidence</option>
            <option value="line">Line Number</option>
            <option value="file">File Path (A → Z)</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:text-foreground ml-auto"
              title="Reset filters"
            >
              <RotateCcw className="size-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Findings List */}
      {filteredFindings.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No findings match current filters"
          description={
            hasActiveFilters
              ? "Try adjusting your search query, severity, or category filter."
              : "No findings reported for this scan."
          }
          action={
            hasActiveFilters ? (
              <Button size="sm" variant="outline" onClick={handleResetFilters}>
                Clear Filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3.5">
          {paginatedFindings.map((finding) => (
            <FindingCard key={finding.fingerprint ?? finding.id} finding={finding} />
          ))}
        </div>
      )}

      {/* Reusable Pagination with Ellipses (...) for Long Lists */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={filteredFindings.length}
        pageSize={pageSize}
        pageSizeOptions={[3, 5, 10, 20]}
        onPageSizeChange={setPageSize}
        itemLabel="findings"
      />
    </div>
  );
}
