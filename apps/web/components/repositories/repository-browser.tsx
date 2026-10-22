"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AnalysisResponse,
  GitHubCommit,
  GitHubRepository,
  GitHubSessionState,
} from "@bug-detective/shared-types";
import FindingCard from "@/components/findings/finding-card";
import { Button } from "@/components/ui/button";

type PageState = "loading" | "ready" | "error";
type VisibilityFilter = "all" | "public" | "private";

interface RepositoryPage {
  repositories: GitHubRepository[];
  page: number;
  total: number;
  hasMore: boolean;
  truncated: boolean;
}

interface CommitPage {
  commits: GitHubCommit[];
  hasMore: boolean;
}

function errorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }
  if (
    typeof body === "object" &&
    body !== null &&
    "detail" in body &&
    typeof body.detail === "string"
  ) {
    return body.detail;
  }
  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function dateLabel(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Date unavailable"
    : date.toLocaleString();
}

function VisibilityBadge({ visibility }: { visibility: GitHubRepository["visibility"] }) {
  return (
    <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] capitalize text-muted-foreground">
      {visibility}
    </span>
  );
}

export default function RepositoryBrowser() {
  const [session, setSession] = useState<GitHubSessionState | null>(null);
  const [sessionState, setSessionState] = useState<PageState>("loading");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [repositoriesState, setRepositoriesState] = useState<PageState>("loading");
  const [repositoryError, setRepositoryError] = useState<string | null>(null);
  const [repositoryPage, setRepositoryPage] = useState(1);
  const [repositoryHasMore, setRepositoryHasMore] = useState(false);
  const [repositoryTruncated, setRepositoryTruncated] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [selectedRepository, setSelectedRepository] =
    useState<GitHubRepository | null>(null);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [commitsState, setCommitsState] = useState<PageState>("ready");
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitPage, setCommitPage] = useState(1);
  const [commitHasMore, setCommitHasMore] = useState(false);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [scan, setScan] = useState<AnalysisResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showSkippedFiles, setShowSkippedFiles] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadSession() {
      try {
        const response = await fetch("/api/github/session", { cache: "no-store" });
        const body = (await readJson(response)) as GitHubSessionState | null;
        if (!active) return;
        if (!response.ok || !body) {
          throw new Error("Could not check GitHub connection status.");
        }
        setSession(body);
        setCsrfToken(body.csrfToken);
        setSessionState("ready");
        if (typeof window !== "undefined") {
          const result = new URLSearchParams(window.location.search).get("github");
          if (result === "connected") setNotice("GitHub is connected.");
          if (result === "denied") setNotice("GitHub authorization was cancelled.");
          if (result === "state_error") {
            setNotice("GitHub sign-in could not be verified. Please reconnect.");
          }
          if (result === "error") {
            setNotice("GitHub could not complete authorization. Please try again.");
          }
          if (result) window.history.replaceState({}, "", window.location.pathname);
        }
      } catch (error) {
        if (!active) return;
        setSessionError(
          error instanceof Error ? error.message : "Could not check GitHub status.",
        );
        setSessionState("error");
      }
    }
    void loadSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const loadRepositories = useCallback(async () => {
    await Promise.resolve();
    setRepositoriesState("loading");
    setRepositoryError(null);
    const params = new URLSearchParams({ page: String(repositoryPage) });
    if (search) params.set("q", search);
    if (visibility !== "all") params.set("visibility", visibility);
    try {
      const response = await fetch(`/api/repositories?${params}`, {
        cache: "no-store",
      });
      const body = await readJson(response);
      if (!response.ok) {
        if (response.status === 401) {
          setSession((current) =>
            current ? { ...current, connected: false, login: null } : current,
          );
          setCsrfToken(null);
        }
        throw new Error(errorMessage(body, "Could not load authorized repositories."));
      }
      const result = body as RepositoryPage;
      setRepositories(result.repositories);
      setRepositoryHasMore(result.hasMore);
      setRepositoryTruncated(result.truncated);
      setRepositoriesState("ready");
    } catch (error) {
      setRepositoryError(
        error instanceof Error
          ? error.message
          : "Could not load authorized repositories.",
      );
      setRepositoriesState("error");
    }
  }, [repositoryPage, search, visibility]);

  useEffect(() => {
    if (!session?.connected) return;
    const timeout = window.setTimeout(() => void loadRepositories(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadRepositories, session?.connected]);

  const loadCommits = useCallback(
    async (repository: GitHubRepository, page: number) => {
      await Promise.resolve();
      setCommitsState("loading");
      setCommitError(null);
      setSelectedSha(null);
      setScan(null);
      try {
        const response = await fetch(
          `/api/repositories/${repository.id}/commits?page=${page}`,
          { cache: "no-store" },
        );
        const body = await readJson(response);
        if (!response.ok) {
          throw new Error(errorMessage(body, "Could not load recent commits."));
        }
        const result = body as CommitPage;
        setCommits(result.commits);
        setCommitHasMore(result.hasMore);
        setCommitsState("ready");
      } catch (error) {
        setCommitError(
          error instanceof Error ? error.message : "Could not load recent commits.",
        );
        setCommitsState("error");
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedRepository) return;
    const timeout = window.setTimeout(
      () => void loadCommits(selectedRepository, commitPage),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, [commitPage, loadCommits, selectedRepository]);

  const selectedCommit = useMemo(
    () => commits.find((commit) => commit.sha === selectedSha) ?? null,
    [commits, selectedSha],
  );

  async function disconnect() {
    if (!csrfToken || disconnecting) return;
    setDisconnecting(true);
    setSessionError(null);
    try {
      const response = await fetch("/api/github/disconnect", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      const body = await readJson(response);
      if (!response.ok) {
        throw new Error(errorMessage(body, "Could not disconnect GitHub."));
      }
      setSession((current) =>
        current ? { ...current, connected: false, login: null } : current,
      );
      setCsrfToken(null);
      setRepositories([]);
      setSelectedRepository(null);
      setScan(null);
      const revoked =
        typeof body === "object" &&
        body !== null &&
        "authorizationRevoked" in body &&
        body.authorizationRevoked === true;
      setNotice(
        revoked
          ? "GitHub was disconnected and its authorization revoked."
          : "The local session was cleared. You can also revoke this app from GitHub settings.",
      );
    } catch (error) {
      setSessionError(
        error instanceof Error ? error.message : "Could not disconnect GitHub.",
      );
    } finally {
      setDisconnecting(false);
    }
  }

  async function startScan() {
    if (!selectedRepository || !selectedSha || !csrfToken || scanning) return;
    setScanning(true);
    setScan(null);
    setScanError(null);
    try {
      const response = await fetch("/api/github/scans", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          repositoryId: selectedRepository.id,
          commitSha: selectedSha,
        }),
      });
      const body = await readJson(response);
      if (!response.ok) {
        throw new Error(errorMessage(body, "The repository scan failed."));
      }
      setScan(body as AnalysisResponse);
    } catch (error) {
      setScanError(
        error instanceof Error ? error.message : "The repository scan failed.",
      );
    } finally {
      setScanning(false);
    }
  }

  const skippedFiles = scan?.files.filter((file) => file.status === "skipped") ?? [];
  const includedFiles = scan?.files.filter((file) => file.status === "included") ?? [];

  return (
    <main className="mx-auto w-full max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
            GitHub · Read-only access
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Analyze an immutable commit
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Select a repository installed for this GitHub App and pin the scan to
            its full commit SHA. Source is fetched only for this scan and is not
            saved as repository history.
          </p>
        </div>
        {session?.connected && (
          <Button
            type="button"
            variant="outline"
            disabled={disconnecting}
            onClick={() => void disconnect()}
          >
            {disconnecting ? "Disconnecting…" : `Disconnect @${session.login}`}
          </Button>
        )}
      </section>

      {notice && (
        <p
          className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
          role="status"
        >
          {notice}
        </p>
      )}
      {sessionError && (
        <p
          className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-200"
          role="alert"
        >
          {sessionError}
        </p>
      )}

      {sessionState === "loading" ? (
        <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
      ) : sessionState === "error" ? (
        <section className="rounded-2xl border border-rose-400/20 bg-card p-6" role="alert">
          <h2 className="font-semibold">Connection status unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {sessionError ?? "Retry the page to check GitHub authorization."}
          </p>
        </section>
      ) : !session?.configured ? (
        <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Configure a GitHub App</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Set the server-side GitHub App client ID, client secret, callback URL,
            and session encryption key before connecting an account.
          </p>
        </section>
      ) : !session.connected ? (
        <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
              Connect your GitHub account
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              Browse only repositories available to this app installation.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Bug Detective requests read-only repository contents and the
              metadata access GitHub requires. The session is encrypted in an
              HttpOnly cookie; access tokens are never sent to browser code.
              Install the GitHub App on the repositories you want to analyze.
            </p>
            <a
              href="/api/github/connect"
              className="mt-6 inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Connect GitHub
            </a>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)]">
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Authorized repositories</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Connected as <span className="font-medium text-foreground">@{session.login}</span>
                  </p>
                </div>
                <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
                  Read-only
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
                <label className="block text-sm">
                  <span className="sr-only">Search repositories</span>
                  <input
                    aria-label="Search repositories"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Search owner or repository"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setRepositoryPage(1);
                    }}
                  />
                </label>
                <label className="block text-sm">
                  <span className="sr-only">Filter repository visibility</span>
                  <select
                    aria-label="Filter repository visibility"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={visibility}
                    onChange={(event) => {
                      setVisibility(event.target.value as VisibilityFilter);
                      setRepositoryPage(1);
                    }}
                  >
                    <option value="all">All visibility</option>
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </label>
              </div>

              {repositoryTruncated && (
                <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200" role="status">
                  The installation list reached the configured safety limit. Some repositories may not be listed.
                </p>
              )}
              {repositoriesState === "loading" ? (
                <div className="mt-5 space-y-3" aria-label="Loading repositories">
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="h-24 animate-pulse rounded-xl bg-background" />
                  ))}
                </div>
              ) : repositoriesState === "error" ? (
                <div className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200" role="alert">
                  <p>{repositoryError}</p>
                  <Button className="mt-3" type="button" size="sm" variant="outline" onClick={() => void loadRepositories()}>
                    Retry
                  </Button>
                </div>
              ) : repositories.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-border p-6 text-center">
                  <h3 className="font-medium">No authorized repositories found</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Install the GitHub App for an account or repository you can access, or change the current search and visibility filters.
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {repositories.map((repository) => {
                    const selected = selectedRepository?.id === repository.id;
                    return (
                      <button
                        key={repository.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setSelectedRepository(repository);
                          setCommitPage(1);
                        }}
                        className={`block w-full rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          selected
                            ? "border-primary/60 bg-primary/5"
                            : "border-border bg-background hover:border-primary/40"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{repository.fullName}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {repository.description || "No description provided."}
                            </p>
                          </div>
                          <VisibilityBadge visibility={repository.visibility} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                          <span>Default branch: {repository.defaultBranch ?? "Unavailable"}</span>
                          <span>Updated: {dateLabel(repository.updatedAt)}</span>
                        </div>
                      </button>
                    );
                  })}
                  <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                    <span>Page {repositoryPage}</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={repositoryPage <= 1}
                        onClick={() => setRepositoryPage((page) => page - 1)}
                        type="button"
                      >
                        Previous
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!repositoryHasMore}
                        onClick={() => setRepositoryPage((page) => page + 1)}
                        type="button"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.15em] text-primary">
                  Commit selection
                </p>
                <h2 className="mt-2 text-lg font-semibold">
                  {selectedRepository ? selectedRepository.fullName : "Choose a repository"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Select a recent commit. Every scan is validated against and pinned to its full SHA.
                </p>
              </div>
              {!selectedRepository ? (
                <div className="mt-6 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                  Select an authorized repository to load its recent commits.
                </div>
              ) : commitsState === "loading" ? (
                <div className="mt-6 h-48 animate-pulse rounded-xl bg-background" aria-label="Loading commits" />
              ) : commitsState === "error" ? (
                <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200" role="alert">
                  <p>{commitError}</p>
                  <Button className="mt-3" size="sm" variant="outline" type="button" onClick={() => void loadCommits(selectedRepository, commitPage)}>
                    Retry
                  </Button>
                </div>
              ) : commits.length === 0 ? (
                <p className="mt-6 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                  No commits are available for this repository.
                </p>
              ) : (
                <>
                  <div className="mt-5 space-y-2">
                    {commits.map((commit) => (
                      <button
                        key={commit.sha}
                        type="button"
                        aria-pressed={selectedSha === commit.sha}
                        onClick={() => {
                          setSelectedSha(commit.sha);
                          setScan(null);
                          setScanError(null);
                        }}
                        className={`w-full rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          selectedSha === commit.sha
                            ? "border-primary/60 bg-primary/5"
                            : "border-border bg-background hover:border-primary/40"
                        }`}
                      >
                        <p className="line-clamp-2 text-sm font-medium">{commit.message}</p>
                        <p className="mt-2 font-mono text-[11px] text-primary">
                          {commit.sha.slice(0, 12)}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {commit.author ?? "Unknown author"} · {dateLabel(commit.date)}
                        </p>
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Commit page {commitPage}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={commitPage <= 1} onClick={() => setCommitPage((page) => page - 1)} type="button">
                        Previous
                      </Button>
                      <Button size="sm" variant="outline" disabled={!commitHasMore} onClick={() => setCommitPage((page) => page + 1)} type="button">
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
              {selectedCommit && (
                <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <p className="text-xs font-medium text-primary">Pinned commit</p>
                  <p className="mt-2 break-all font-mono text-xs">{selectedCommit.sha}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    This full SHA, not a moving branch name, will be analyzed.
                  </p>
                  <Button
                    className="mt-4 w-full"
                    type="button"
                    disabled={scanning}
                    onClick={() => void startScan()}
                  >
                    {scanning ? "Retrieving and analyzing…" : "Analyze this commit"}
                  </Button>
                </div>
              )}
            </div>
          </section>

          {scanning && (
            <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground" role="status">
              Revalidating repository access, retrieving eligible files at the selected SHA, and running deterministic TypeScript checks. Repository scripts are not run.
            </p>
          )}
          {scanError && (
            <p className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-200" role="alert">
              {scanError}
            </p>
          )}
          {scan && selectedRepository && (
            <section className="space-y-5" aria-labelledby="scan-results-heading">
              <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.15em] text-primary">
                      {scan.status.replaceAll("_", " ")} scan
                    </p>
                    <h2 id="scan-results-heading" className="mt-2 text-xl font-semibold">
                      {scan.repositoryFullName ?? selectedRepository.fullName}
                    </h2>
                    <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                      Commit {scan.commitSha ?? selectedSha}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="rounded-xl border border-border bg-background px-4 py-3">
                      <p className="text-xl font-semibold tabular-nums">{scan.findings.length}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Findings</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background px-4 py-3">
                      <p className="text-xl font-semibold tabular-nums">{includedFiles.length}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Files included</p>
                    </div>
                  </div>
                </div>
                {scan.errors.length > 0 && (
                  <div className="mt-5 space-y-2" role="status">
                    {scan.errors.map((message, index) => (
                      <p key={`${index}-${message}`} className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-200">
                        {message}
                      </p>
                    ))}
                  </div>
                )}
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {scan.analyzers.map((analyzer) => (
                    <div key={analyzer.name} className="rounded-xl border border-border bg-background p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-sm">{analyzer.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {analyzer.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {analyzer.message}
                      </p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {analyzer.filesAnalyzed} files · {analyzer.findingsCount} findings · {analyzer.durationMs} ms
                      </p>
                    </div>
                  ))}
                </div>
                {skippedFiles.length > 0 && (
                  <div className="mt-5 rounded-xl border border-border bg-background p-4">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 text-left text-sm font-medium"
                      aria-expanded={showSkippedFiles}
                      onClick={() => setShowSkippedFiles((visible) => !visible)}
                    >
                      <span>{skippedFiles.length} files or paths skipped</span>
                      <span className="text-xs text-primary">
                        {showSkippedFiles ? "Hide details" : "Show details"}
                      </span>
                    </button>
                    {showSkippedFiles && (
                      <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto border-t border-border pt-3">
                        {skippedFiles.slice(0, 100).map((file, index) => (
                          <li key={`${file.path}-${file.reason}-${index}`} className="flex flex-wrap justify-between gap-2 text-xs">
                            <span className="break-all font-mono text-muted-foreground">{file.path}</span>
                            <span className="text-amber-200">{file.reason.replaceAll("_", " ")}</span>
                          </li>
                        ))}
                        {skippedFiles.length > 100 && (
                          <li className="text-xs text-muted-foreground">
                            Showing the first 100 entries. The complete skip inventory is included in the API response.
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              {scan.findings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                  <h3 className="font-semibold">No findings returned</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    This is a deterministic compiler result, not proof that the commit is defect-free.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Findings</h3>
                  {scan.findings.map((finding) => (
                    <FindingCard key={finding.id} finding={finding} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Source limits: 500 files, 1 MiB per file, 20 MiB total, 50,000 tree entries, and 5 scans per connected account per 15 minutes. Supported files are not installed or executed.
      </p>
    </main>
  );
}
