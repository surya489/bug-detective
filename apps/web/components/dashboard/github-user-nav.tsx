"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  LogOut,
  User,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  Settings,
  LogIn,
  Sparkles,
} from "lucide-react";
import { GitHubIcon } from "@/components/ui/github-icon";
import { Skeleton } from "@/components/ui";
import type { SessionUser } from "@/lib/auth/session";

type SessionState = {
  authenticated: boolean;
  user: SessionUser | null;
  isConfigured: boolean;
};

export function GitHubUserNav() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function checkSession() {
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
        // Silently handle abort or network errors
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void checkSession();

    return () => {
      controller.abort();
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setSession({ authenticated: false, user: null, isConfigured: true });
      window.location.reload();
    } catch {
      setLoggingOut(false);
    }
  }

  if (loading) {
    return <Skeleton variant="circle" className="h-8 w-28" />;
  }

  // User is authenticated (either via email or GitHub)
  if (session?.authenticated && session.user) {
    const isEmailUser = session.user.provider === "credentials";
    const isGitHubConnected = session.user.githubConnected || session.user.provider === "github";
    const displayName = session.user.name || session.user.login || session.user.email || "Developer";
    const githubHandle = session.user.githubUsername || session.user.login;

    return (
      <div className="relative flex items-center gap-2" ref={menuRef}>
        {/* If user logged in with email and has NOT connected GitHub yet, show quick connect button */}
        {isEmailUser && !isGitHubConnected && (
          <a
            href="/api/auth/github"
            title="Connect your GitHub account to scan repositories"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-all hover:bg-primary/20 hover:border-primary active:scale-95 shadow-sm"
          >
            <GitHubIcon className="size-3.5" />
            <span>Connect GitHub</span>
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
          </a>
        )}

        {/* User Pill / Profile Button */}
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-2.5 text-xs font-medium text-foreground transition-all hover:border-primary/40 hover:bg-accent/40 active:scale-[0.98]"
        >
          {session.user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.user.avatarUrl}
              alt={displayName}
              className="size-6 rounded-full border border-border/60 object-cover"
            />
          ) : (
            <div className="flex size-6 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-[10px]">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div className="flex items-center gap-1.5 max-w-[140px] truncate">
            <span className="truncate">{displayName}</span>
            {session.user.isNewUser && (
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-400">
                New
              </span>
            )}
          </div>
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>

        {/* User Dropdown Menu */}
        {menuOpen && (
          <div className="absolute right-0 top-10 z-50 w-72 rounded-2xl border border-border/80 bg-card/95 p-3 shadow-xl backdrop-blur-xl animate-in fade-in zoom-in-95">
            {/* Header / Identity info */}
            <div className="flex items-center gap-3 border-b border-border/80 pb-3 px-1">
              {session.user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.avatarUrl}
                  alt={displayName}
                  className="size-9 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex size-9 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-xs">
                  {displayName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">
                  {displayName}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {session.user.email || (githubHandle ? `@${githubHandle}` : "Developer")}
                </p>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-primary">
                  <Sparkles className="size-2.5" />
                  <span>Auth: {session.user.provider === "github" ? "GitHub OAuth" : "Email & Password"}</span>
                </div>
              </div>
            </div>

            {/* GitHub Connection Status Box */}
            <div className="my-2.5 rounded-xl border border-border/60 bg-background/80 p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <GitHubIcon className="size-3.5 text-foreground" />
                  <span className="text-[11px] font-medium text-foreground">GitHub Access</span>
                </div>
                {isGitHubConnected ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400">
                    <AlertCircle className="size-3" />
                    Not Connected
                  </span>
                )}
              </div>

              {isGitHubConnected ? (
                <p className="mt-1 text-[10px] text-muted-foreground truncate">
                  Linked as <span className="text-foreground font-mono">@{githubHandle}</span>
                </p>
              ) : (
                <div className="mt-2">
                  <a
                    href="/api/auth/github"
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-1.5 px-2 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    <GitHubIcon className="size-3" />
                    <span>Connect GitHub Account</span>
                  </a>
                </div>
              )}
            </div>

            {/* Menu Actions */}
            <div className="space-y-1">
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              >
                <Settings className="size-3.5" />
                <span>Account & Settings</span>
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                <LogOut className="size-3.5" />
                <span>{loggingOut ? "Signing out..." : "Sign Out"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Not authenticated: Show Sign In and GitHub options
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-primary active:scale-[0.98]"
      >
        <LogIn className="size-3.5" />
        <span>Sign In</span>
      </Link>

      <a
        href="/api/auth/github"
        className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-foreground/40 hover:bg-card hover:text-foreground active:scale-[0.98]"
      >
        <GitHubIcon className="size-3.5" />
        <span>GitHub</span>
      </a>
    </div>
  );
}
