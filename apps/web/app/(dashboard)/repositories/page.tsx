"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ExternalLink,
  FolderGit2,
  GitFork,
  Globe,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { GitHubIcon } from "@/components/ui/github-icon";
import type { GitHubUser } from "@/lib/auth/session";
import type { GitHubRepository } from "@/lib/github/repositories";

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

function formatRelativeTime(dateString: string): string {
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
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "public" | "private">("all");

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
          const errorData = (await response.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          throw new Error(
            errorData.error?.message || "Failed to load repositories.",
          );
        }
        const data = (await response.json()) as {
          repositories: GitHubRepository[];
        };
        if (!controller.signal.aborted) {
          setRepositories(data.repositories);
          console.log("data repositories", data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setErrorMessage(
            err instanceof Error ? err.message : "Could not load repositories.",
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

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredRepositories = useMemo(() => {
    return repositories.filter((repo) => {
      const matchesSearch =
        normalizedSearchQuery.length === 0 ||
        repo.name.toLowerCase().includes(normalizedSearchQuery) ||
        (repo.description ?? "")
          .toLowerCase()
          .includes(normalizedSearchQuery) ||
        (repo.language ?? "").toLowerCase().includes(normalizedSearchQuery);

      const matchesFilter =
        filter === "all" ||
        (filter === "private" && repo.isPrivate) ||
        (filter === "public" && !repo.isPrivate);

      return matchesSearch && matchesFilter;
    });
  }, [repositories, normalizedSearchQuery, filter]);

  if (sessionLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted/40" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl border border-border/60 bg-card/60"
            />
          ))}
        </div>
      </div>
    );
  }

  // Unauthenticated State: Hero Card to Connect GitHub
  if (!session?.authenticated) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        {urlError && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold">GitHub Authentication Notice</p>
              <p className="mt-1 text-xs text-amber-300/90">
                {urlError === "oauth_not_configured"
                  ? "GitHub OAuth credentials (AUTH_GITHUB_ID & AUTH_GITHUB_SECRET) are not configured in your .env.local file."
                  : `Authentication could not be completed: ${urlError}`}
              </p>
            </div>
          </div>
        )}

        <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-b from-card via-card to-background p-8 shadow-2xl sm:p-12">
          {/* Subtle decorative glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-primary/10 blur-3xl"
          />

          <div className="relative flex flex-col items-center text-center">
            <div className="relative mb-6">
              <div className="grid size-16 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-inner">
                <GitHubIcon className="size-8" />
              </div>
              <div className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-emerald-500 text-slate-950">
                <Sparkles className="size-3.5" />
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              GitHub Integration
            </span>

            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Connect your GitHub account
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Link your GitHub account to securely inspect code repositories,
              run automated TypeScript static analysis, and discover defects in
              real time.
            </p>

            {/* Feature highlights */}
            <div className="mt-8 grid w-full max-w-2xl gap-3 text-left sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-background/50 p-3.5">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <ShieldCheck className="size-4 text-emerald-400" />
                  <span>Scoped Read Access</span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  Minimum permissions to discover and analyze repositories.
                </p>
              </div>

              <div className="rounded-xl border border-border/60 bg-background/50 p-3.5">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <Globe className="size-4 text-primary" />
                  <span>Public & Private</span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  Access your personal projects and team repositories.
                </p>
              </div>

              <div className="rounded-xl border border-border/60 bg-background/50 p-3.5">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <FolderGit2 className="size-4 text-sky-400" />
                  <span>Instant Import</span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  One-click scan kickoff with zero manual configuration.
                </p>
              </div>
            </div>

            {/* Connect CTA Button */}
            <div className="mt-10">
              <a
                href="/api/auth/github"
                className="group relative inline-flex items-center gap-3 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98]"
              >
                <GitHubIcon className="size-5 transition-transform group-hover:scale-110" />
                <span>Continue with GitHub</span>
              </a>
            </div>

            {!session?.isConfigured && (
              <p className="mt-6 text-xs text-muted-foreground">
                <span className="font-semibold text-amber-400">Note:</span> Set{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                  AUTH_GITHUB_ID
                </code>{" "}
                and{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                  AUTH_GITHUB_SECRET
                </code>{" "}
                in <code className="font-mono text-[11px]">.env.local</code> to
                enable live OAuth.
              </p>
            )}
          </div>
        </div>
      </div>
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
                <span className="size-1.5 rounded-full bg-emerald-400" />
                Connected
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              @{session.user?.login} · {repositories.length} accessible
              repositories
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={session.user?.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <GitHubIcon className="size-3.5" />
            <span>View GitHub Profile</span>
            <ExternalLink className="size-3 text-muted-foreground" />
          </a>
        </div>
      </motion.section>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full min-w-0 md:max-w-md md:flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search repositories by name, language, or description"
            className="h-11 w-full rounded-xl border border-border bg-card py-2 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear repository search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex w-full items-center gap-2 md:w-auto">
          <div className="grid min-w-0 flex-1 grid-cols-3 rounded-xl border border-border bg-card p-1 text-xs md:flex md:flex-none">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`min-w-0 rounded-lg px-1.5 py-2 text-[11px] font-medium transition-colors sm:px-2.5 sm:text-xs ${filter === "all"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              All ({repositories.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("public")}
              className={`min-w-0 rounded-lg px-1.5 py-2 text-[11px] font-medium transition-colors sm:px-2.5 sm:text-xs ${filter === "public"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              Public ({repositories.filter((r) => !r.isPrivate).length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("private")}
              className={`min-w-0 rounded-lg px-1.5 py-2 text-[11px] font-medium transition-colors sm:px-2.5 sm:text-xs ${filter === "private"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              Private ({repositories.filter((r) => r.isPrivate).length})
            </button>
          </div>

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
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <FolderGit2 className="mx-auto size-10 text-muted-foreground/60" />
          <h2 className="mt-3 text-sm font-semibold text-foreground">
            {normalizedSearchQuery
              ? "No matching repositories found"
              : "No repositories discovered"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {normalizedSearchQuery
              ? `No repositories matched "${searchQuery}". Try adjusting your search or filters.`
              : "Your connected GitHub account doesn't seem to have repositories in this category."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false} mode="popLayout">
          {filteredRepositories.map((repo, index) => {
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
                className="group relative flex min-h-[190px] min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 sm:p-5"
              >
                <div>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <a
                      href={repo.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group/link flex min-w-0 flex-1 items-center gap-1.5 font-semibold text-foreground transition-colors hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="truncate text-[15px] sm:text-base">{repo.name}</span>
                      <ExternalLink className="size-3 shrink-0 opacity-0 transition-opacity group-hover/link:opacity-100 group-focus-visible/link:opacity-100" />
                    </a>

                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${repo.isPrivate
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

                    <span className="shrink-0">{formatRelativeTime(repo.updatedAt)}</span>
                  </div>
                </div>
              </motion.article>
            );
          })}
          </AnimatePresence>
        </div>
      )}
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
