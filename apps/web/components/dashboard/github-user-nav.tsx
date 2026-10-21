"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { GitHubIcon } from "@/components/ui/github-icon";
import type { GitHubUser } from "@/lib/auth/session";

type SessionState = {
  authenticated: boolean;
  user: GitHubUser | null;
  isConfigured: boolean;
};

export function GitHubUserNav() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

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
    return <div className="h-8 w-28 animate-pulse rounded-full bg-muted/40" />;
  }

  if (session?.authenticated && session.user) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={session.user.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent/40"
          title={`Signed in as ${session.user.login}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={session.user.avatarUrl}
            alt={session.user.login}
            className="size-6 rounded-full border border-border/60 object-cover"
          />
          <span className="max-w-[120px] truncate">{session.user.login}</span>
        </a>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          title="Disconnect GitHub account"
          className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <LogOut className="size-3.5" />
          <span className="sr-only">Disconnect GitHub</span>
        </button>
      </div>
    );
  }

  return (
    <a
      href="/api/auth/github"
      className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-primary active:scale-[0.98]"
    >
      <GitHubIcon className="size-3.5" />
      <span>Connect GitHub</span>
    </a>
  );
}
