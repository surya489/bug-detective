"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

const navigation = [
  { href: "/", label: "Dashboard", available: true },
  { href: "/repositories", label: "Repositories", available: true },
  { href: "/scans", label: "Scans", available: false },
  { href: "/findings", label: "Findings", available: false },
  { href: "/settings", label: "Settings", available: false },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/repositories": "Repositories",
  "/settings": "Settings",
};

function AnalyzerHealth() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/analyzer/health", { cache: "no-store" })
      .then((response) => {
        if (active) setOnline(response.ok);
      })
      .catch(() => {
        if (active) setOnline(false);
      });
    return () => {
      active = false;
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
              Local analysis workspace
            </span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="mt-10 space-y-1">
          {navigation.map((item) =>
            item.available ? (
              <Link
                key={item.label}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  pathname === item.href
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.label}
                aria-disabled="true"
                title="Coming in a later phase"
                className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2.5 text-sm text-muted-foreground/60"
              >
                {item.label}
                <span className="text-[10px] uppercase tracking-wide">Soon</span>
              </span>
            ),
          )}
        </nav>

        <div className="mt-auto rounded-xl border border-border bg-background p-4">
          <p className="text-xs font-medium text-foreground">Read-only analysis</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Scan a local fixture or connect an installed GitHub App to analyze
            an immutable repository commit.
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
            <AnalyzerHealth />
          </div>
          <nav
            aria-label="Mobile navigation"
            className="flex gap-1 overflow-x-auto border-t border-border px-3 py-2 lg:hidden"
          >
            {navigation.map((item) =>
              item.available ? (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={`shrink-0 rounded-md px-3 py-2 text-xs ${
                    pathname === item.href
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.label}
                  aria-disabled="true"
                  className="shrink-0 cursor-not-allowed px-3 py-2 text-xs text-muted-foreground/50"
                  title="Coming in a later phase"
                >
                  {item.label} · Soon
                </span>
              ),
            )}
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
