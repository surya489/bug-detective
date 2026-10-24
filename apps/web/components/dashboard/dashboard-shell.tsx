"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  FolderGit2,
  Radar,
  Bug,
  Settings,
} from "lucide-react";
import { GitHubUserNav } from "@/components/dashboard/github-user-nav";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, available: true },
  { href: "/repositories", label: "Repositories", icon: FolderGit2, available: true },
  { href: "/scans", label: "Scans", icon: Radar, available: true },
  { href: "/findings", label: "Findings", icon: Bug, available: true },
  { href: "/settings", label: "Settings", icon: Settings, available: true },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/repositories": "Repositories",
  "/scans": "Scans History",
  "/findings": "Findings Tracker",
  "/settings": "Settings",
};

function AnalyzerHealth() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/analyzer/health", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        setOnline(response.ok);
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }
        setOnline(false);
      });

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${
          online === null
            ? "bg-muted-foreground"
            : online
              ? "bg-emerald-400"
              : "bg-amber-400"
        }`}
      />
      {online === null
        ? "Checking analyzer"
        : online
          ? "Analyzer online"
          : "Analyzer offline"}
    </span>
  );
}

export default function DashboardShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? "Dashboard";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-card px-4 py-6 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
            <span className="text-lg font-bold">B</span>
          </span>
          <span>
            <span className="block font-semibold tracking-tight">
              Bug Detective
            </span>
            <span className="block text-xs text-muted-foreground">
              AI Code Inspection & Triage
            </span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="mt-8 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                <Icon className={`size-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-xl border border-border bg-background p-4">
          <p className="text-xs font-semibold text-foreground">SonarQube + CodeRabbit Mode</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Static compiler diagnostics and intelligent AI defect detection with manual tracking.
          </p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="border-b border-border bg-background">
          <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{title}</p>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Bug Detective <span className="px-1 text-border">/</span> {title}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <AnalyzerHealth />
              <GitHubUserNav />
            </div>
          </div>
          <nav
            aria-label="Mobile navigation"
            className="flex gap-1 overflow-x-auto border-t border-border px-3 py-2 lg:hidden"
          >
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
