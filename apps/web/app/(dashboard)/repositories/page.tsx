"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FolderGit2,
  GitCommit,
  GitFork,
  Globe,
  Lock,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { GitHubIcon } from "@/components/ui/github-icon";
import { Button } from "@/components/ui/button";
import FindingCard from "@/components/findings/finding-card";
import ScanFindingsReport from "@/components/findings/scan-findings-report";
import { EmptyState, Pagination, SearchInput } from "@/components/ui";
import { saveScan } from "@/lib/scans/scan-store";
import type { GitHubUser } from "@/lib/auth/session";
import type { GitHubRepository } from "@/lib/github/repositories";
import type {
  AnalysisResponse,
  GitHubCommit,
  GitHubSessionState,
} from "@bug-detective/shared-types";

type SessionState = {
  authenticated: boolean;
  user: GitHubUser | null;
  isConfigured: boolean;
};

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  Ruby: "#701516",
  PHP: "#4F5D95",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  Shell: "#89e051",
};

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

function RepositoriesContent() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const shouldReduceMotion = useReducedMotion();

  const [session, setSession] = useState<SessionState | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "public" | "private">("all");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"updated" | "stars" | "forks" | "name_asc" | "name_desc">("updated");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);

  // Selection & Scan State
  const [selectedRepository, setSelectedRepository] =
    useState<GitHubRepository | null>(null);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<AnalysisResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.ok) {
          const data = (await response.json()) as SessionState;
          if (!controller.signal.aborted) {
            setSession(data);
          }
        }

        // Fetch CSRF token for scan API
        const ghSessionRes = await fetch("/api/github/session", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (ghSessionRes.ok) {
          const ghData = (await ghSessionRes.json()) as GitHubSessionState;
          if (!controller.signal.aborted && ghData.csrfToken) {
            setCsrfToken(ghData.csrfToken);
          }
        }
      } catch {
        // Ignored on abort
      } finally {
        if (!controller.signal.aborted) {
          setSessionLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!session?.authenticated) return;

    const controller = new AbortController();

    async function loadRepositories() {
      setReposLoading(true);
      setErrorMessage(null);
      try {
        const response = await fetch("/api/repositories", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(
            body?.error?.message || "Failed to load repositories from GitHub.",
          );
        }
        const data = (await response.json()) as {
          repositories: GitHubRepository[];
        };
        if (!controller.signal.aborted) {
          setRepositories(data.repositories);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : "Failed to load repositories.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setReposLoading(false);
        }
      }
    }

    void loadRepositories();

    return () => {
      controller.abort();
    };
  }, [session?.authenticated]);

  // Load commits when a repository is selected
  async function handleSelectRepository(repo: GitHubRepository) {
    setSelectedRepository(repo);
    setSelectedSha(null);
    setScan(null);
    setScanError(null);
    setCommitsLoading(true);
    setCommitsError(null);

    try {
      const response = await fetch(`/api/repositories/${repo.id}/commits`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          body?.error?.message || "Could not load recent commits for this repository.",
        );
      }
      const data = (await response.json()) as { commits: GitHubCommit[] };
      setCommits(data.commits);
      if (data.commits.length > 0) {
        setSelectedSha(data.commits[0].sha);
      }
    } catch (err) {
      setCommitsError(
        err instanceof Error ? err.message : "Failed to load commits.",
      );
    } finally {
      setCommitsLoading(false);
    }
  }

  // Trigger scan for the selected commit
  async function handleStartScan() {
    if (!selectedRepository || !selectedSha || scanning) return;
    setScanning(true);
    setScan(null);
    setScanError(null);

    try {
      const response = await fetch("/api/github/scans", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({
          repositoryId: selectedRepository.id,
          commitSha: selectedSha,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          body?.error?.message || body?.detail || "The repository scan failed.",
        );
      }
      const scanResult = body as AnalysisResponse;
      setScan(scanResult);
      saveScan(scanResult);
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : "The repository scan failed.",
      );
    } finally {
      setScanning(false);
    }
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    for (const repo of repositories) {
      if (repo.language) langs.add(repo.language);
    }
    return Array.from(langs).sort();
  }, [repositories]);

  const filteredRepositories = useMemo(() => {
    return repositories
      .filter((repo) => {
        const matchesSearch =
          normalizedSearchQuery.length === 0 ||
          repo.name.toLowerCase().includes(normalizedSearchQuery) ||
          (repo.description ?? "")
            .toLowerCase()
            .includes(normalizedSearchQuery) ||
          (repo.language ?? "").toLowerCase().includes(normalizedSearchQuery);

        const matchesFilter =
          filter === "all" ||
          (filter === "public" && !repo.isPrivate) ||
          (filter === "private" && repo.isPrivate);

        const matchesLang =
          languageFilter === "all" || repo.language === languageFilter;

        return matchesSearch && matchesFilter && matchesLang;
      })
      .sort((a, b) => {
        if (sortBy === "stars") return b.starsCount - a.starsCount;
        if (sortBy === "forks") return b.forksCount - a.forksCount;
        if (sortBy === "name_asc") return a.name.localeCompare(b.name);
        if (sortBy === "name_desc") return b.name.localeCompare(a.name);
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      });
  }, [repositories, normalizedSearchQuery, filter, languageFilter, sortBy]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filter, languageFilter, sortBy, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredRepositories.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRepositories = filteredRepositories.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  if (sessionLoading) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div className="h-24 w-full animate-pulse rounded-2xl border border-border/60 bg-card/60" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl border border-border/60 bg-card/60"
            />
          ))}
        </div>
      </main>
    );
  }

  // Unauthenticated State
  if (!session?.authenticated) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-sm sm:p-12">
          <div className="relative max-w-2xl space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" />
              Automated Code & Bug Inspection
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Connect your GitHub account
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Authorize Bug Detective to inspect authorized repositories, review
              pull request diffs, and pinpoint security flaws with AI analysis.
            </p>
            <div className="pt-4">
              <a
                href="/api/auth/github"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-95"
              >
                <GitHubIcon className="size-4" />
                <span>Connect with GitHub</span>
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Selected Repository View (Commit Selector & Scan Findings)
  if (selectedRepository) {
    return (
      <main className="mx-auto w-full max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
        {/* Back and Repo Header */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedRepository(null);
                setScan(null);
                setCommits([]);
              }}
              className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
              title="Back to all repositories"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-foreground">
                  {selectedRepository.fullName}
                </h1>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    selectedRepository.isPrivate
                      ? "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                      : "border border-border bg-muted/60 text-muted-foreground"
                  }`}
                >
                  {selectedRepository.isPrivate ? "Private" : "Public"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Default branch: {selectedRepository.defaultBranch || "main"}
              </p>
            </div>
          </div>

          <a
            href={selectedRepository.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <span>View on GitHub</span>
            <ExternalLink className="size-3" />
          </a>
        </div>

        {/* Commit Selection & Scan Kickoff Grid */}
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Commits List */}
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Recent Commits
                </h2>
                <p className="text-xs text-muted-foreground">
                  Select an immutable commit to analyze
                </p>
              </div>
              <GitCommit className="size-4 text-muted-foreground" />
            </div>

            {commitsLoading ? (
              <div className="mt-4 space-y-2.5">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-xl bg-background"
                  />
                ))}
              </div>
            ) : commitsError ? (
              <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
                {commitsError}
              </div>
            ) : commits.length === 0 ? (
              <p className="mt-4 text-xs text-muted-foreground">
                No recent commits found for this repository.
              </p>
            ) : (
              <div className="mt-4 space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {commits.map((c) => {
                  const isSelected = selectedSha === c.sha;
                  return (
                    <button
                      key={c.sha}
                      type="button"
                      onClick={() => {
                        setSelectedSha(c.sha);
                        setScan(null);
                        setScanError(null);
                      }}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border bg-background hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="line-clamp-1 text-xs font-semibold text-foreground">
                          {c.message}
                        </p>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {c.sha.slice(0, 7)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{c.author || "Unknown"}</span>
                        <span>{formatRelativeTime(c.date)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Scan Action Box */}
          <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300">
                  <Sparkles className="size-4" />
                </span>
                <h2 className="text-base font-semibold text-foreground">
                  AI Code Analysis
                </h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Bug Detective runs deep static analysis and intelligent bug detection
                on this exact commit. It checks for memory leaks, XSS risks, unhandled
                exceptions, and logic defects.
              </p>

              {selectedSha && (
                <div className="mt-4 rounded-xl border border-border/80 bg-background p-3">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Selected Commit SHA:
                  </p>
                  <p className="mt-0.5 break-all font-mono text-xs font-semibold text-primary">
                    {selectedSha}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6">
              <Button
                type="button"
                className="w-full gap-2 rounded-xl py-6 text-sm font-semibold"
                disabled={!selectedSha || scanning}
                onClick={() => void handleStartScan()}
              >
                {scanning ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    <span>Analyzing code with AI...</span>
                  </>
                ) : (
                  <>
                    <Play className="size-4 fill-current" />
                    <span>Analyze This Commit</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Scan Status & Errors */}
        {scanError && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{scanError}</span>
          </div>
        )}

        {/* Scan Findings Section */}
        {scan && (
          <section className="space-y-6 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5">
              <div>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                  Scan {scan.status.toUpperCase()}
                </span>
                <h3 className="mt-2 text-xl font-bold text-foreground">
                  {scan.findings.length === 0
                    ? "No defects identified"
                    : `${scan.findings.length} Finding${scan.findings.length > 1 ? "s" : ""} Detected`}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Analyzers executed: {scan.analyzers.map((a) => a.name).join(", ")}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-border bg-background px-4 py-2 text-center">
                  <p className="text-lg font-bold text-foreground">
                    {scan.files.length}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Files Scanned</p>
                </div>
                <div className="rounded-xl border border-border bg-background px-4 py-2 text-center">
                  <p className="text-lg font-bold text-foreground">
                    {scan.findings.length}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Findings</p>
                </div>
              </div>
            </div>

            {/* Findings List */}
            {scan.findings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                <ShieldCheck className="mx-auto size-12 text-emerald-400" />
                <h4 className="mt-3 text-base font-semibold text-foreground">
                  Clean Scan Result
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  No compiler errors or AI pattern defects were discovered in this commit.
                </p>
              </div>
            ) : (
              <ScanFindingsReport scan={scan} initialPageSize={5} />
            )}
          </section>
        )}
      </main>
    );
  }

  // Authenticated State: Repositories List
  return (
    <main className="mx-auto w-full max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
      {/* User Header Profile */}
      <motion.section
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex min-w-0 flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center"
      >
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={session.user?.avatarUrl}
            alt={session.user?.login ?? "User"}
            className="size-12 rounded-xl border border-border object-cover shadow-sm"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground">
                {session.user?.name || session.user?.login}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                Connected
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Select any repository below to browse commits and launch an AI bug scan.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={session.user?.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>GitHub Profile</span>
            <ExternalLink className="size-3 text-muted-foreground" />
          </a>
        </div>
      </motion.section>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="w-full min-w-0 md:max-w-md md:flex-1">
          <SearchInput
            placeholder="Search repositories by name, language, or description..."
            value={searchQuery}
            onChange={setSearchQuery}
            className="h-11 bg-card"
          />
        </div>

        <div className="flex w-full items-center gap-2 md:w-auto">
          <div className="grid min-w-0 flex-1 grid-cols-3 rounded-xl border border-border bg-card p-1 text-xs md:flex md:flex-none">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`min-w-0 rounded-lg px-1.5 py-2 text-[11px] font-medium transition-colors sm:px-2.5 sm:text-xs ${
                filter === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({repositories.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("public")}
              className={`min-w-0 rounded-lg px-1.5 py-2 text-[11px] font-medium transition-colors sm:px-2.5 sm:text-xs ${
                filter === "public"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Public ({repositories.filter((r) => !r.isPrivate).length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("private")}
              className={`min-w-0 rounded-lg px-1.5 py-2 text-[11px] font-medium transition-colors sm:px-2.5 sm:text-xs ${
                filter === "private"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Private ({repositories.filter((r) => r.isPrivate).length})
            </button>
          </div>

          {/* Language Filter */}
          {availableLanguages.length > 0 && (
            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              aria-label="Filter by language"
              className="h-10 rounded-xl border border-border bg-card px-3 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All Languages</option>
              {availableLanguages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          )}

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            aria-label="Sort repositories"
            className="h-10 rounded-xl border border-border bg-card px-3 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="updated">Recently Updated</option>
            <option value="stars">Most Stars</option>
            <option value="forks">Most Forks</option>
            <option value="name_asc">Name (A → Z)</option>
            <option value="name_desc">Name (Z → A)</option>
          </select>

          {/* Page Size Selector */}
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label="Items per page"
            className="h-10 rounded-xl border border-border bg-card px-2 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value={6}>6 / page</option>
            <option value={9}>9 / page</option>
            <option value={12}>12 / page</option>
            <option value={24}>24 / page</option>
          </select>

          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            disabled={reposLoading}
            title="Refresh repository list"
            aria-label="Refresh repository list"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 md:size-10"
          >
            <RefreshCw
              className={`size-3.5 ${reposLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Repositories Grid */}
      {reposLoading && repositories.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl border border-border/60 bg-card/60"
            />
          ))}
        </div>
      ) : filteredRepositories.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title={
            normalizedSearchQuery
              ? "No matching repositories found"
              : "No repositories discovered"
          }
          description={
            normalizedSearchQuery
              ? `No repositories matched "${searchQuery}". Try adjusting your search or filters.`
              : "Your connected GitHub account doesn't seem to have repositories in this category."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false} mode="popLayout">
            {paginatedRepositories.map((repo, index) => {
              const langColor = repo.language
                ? LANGUAGE_COLORS[repo.language] || "#888888"
                : null;

              return (
                <motion.article
                  key={repo.id}
                  layout={!shouldReduceMotion}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0, y: 8 }}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.22,
                    delay: shouldReduceMotion ? 0 : Math.min(index * 0.035, 0.28),
                  }}
                  whileHover={shouldReduceMotion ? undefined : { y: -3 }}
                  onClick={() => void handleSelectRepository(repo)}
                  className="group relative flex min-h-[190px] min-w-0 cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition-all hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5 sm:p-5"
                >
                  <div>
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 font-semibold text-foreground transition-colors group-hover:text-primary">
                        <span className="truncate text-[15px] sm:text-base">
                          {repo.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <a
                          href={repo.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Open on GitHub"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${
                            repo.isPrivate
                              ? "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                              : "border border-border bg-muted/60 text-muted-foreground"
                          }`}
                        >
                          {repo.isPrivate ? (
                            <>
                              <Lock className="size-2.5" />
                              <span>Private</span>
                            </>
                          ) : (
                            <>
                              <Globe className="size-2.5" />
                              <span>Public</span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    <p className="mt-3 line-clamp-2 min-h-10 break-words text-xs leading-5 text-muted-foreground">
                      {repo.description || "No description provided."}
                    </p>
                  </div>

                  <div className="mt-5 border-t border-border/60 pt-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                        {repo.language && (
                          <span className="inline-flex max-w-full items-center gap-1.5">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: langColor || "#888" }}
                            />
                            <span className="truncate">{repo.language}</span>
                          </span>
                        )}

                        {repo.starsCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Star className="size-3 text-amber-400" />
                            <span>{repo.starsCount}</span>
                          </span>
                        )}

                        {repo.forksCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <GitFork className="size-3" />
                            <span>{repo.forksCount}</span>
                          </span>
                        )}
                      </div>

                      <span className="flex items-center gap-1 font-medium text-primary">
                        <span>Select & Scan</span>
                        <ChevronRight className="size-3" />
                      </span>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Reusable Pagination with Ellipses (...) for Long Repository Lists */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={filteredRepositories.length}
        pageSize={pageSize}
        pageSizeOptions={[6, 9, 12, 24]}
        onPageSizeChange={setPageSize}
        itemLabel="repositories"
      />
    </main>
  );
}

export default function RepositoriesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
          <div className="h-10 w-48 animate-pulse rounded-lg bg-muted/40" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-2xl border border-border/60 bg-card/60"
              />
            ))}
          </div>
        </div>
      }
    >
      <RepositoriesContent />
    </Suspense>
  );
}
