"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalysisResponse,
  FixtureDescriptor,
} from "@bug-detective/shared-types";
import { Button } from "@/components/ui/button";
import FindingCard from "@/components/findings/finding-card";
import { Pagination, SearchInput, Skeleton } from "@/components/ui";
import { saveScan } from "@/lib/scans/scan-store";

type LoadState = "loading" | "ready" | "error";

function errorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "detail" in body &&
    typeof body.detail === "string"
  ) {
    return body.detail;
  }
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
  return fallback;
}

export default function DashboardOverview() {
  const scanInFlight = useRef(false);
  const [fixtures, setFixtures] = useState<FixtureDescriptor[]>([]);
  const [fixtureId, setFixtureId] =
    useState<FixtureDescriptor["id"]>("buggy-react-app");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [serviceOnline, setServiceOnline] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(
    "Connecting to the local analyzer…",
  );
  const [scan, setScan] = useState<AnalysisResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const [findingsPage, setFindingsPage] = useState(1);
  const [findingsPageSize, setFindingsPageSize] = useState(5);

  useEffect(() => {
    const controller = new AbortController();

    async function loadFixtures() {
      try {
        const [healthResponse, fixturesResponse] = await Promise.all([
          fetch("/api/analyzer/health", {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch("/api/analyzer/fixtures", {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);

        if (controller.signal.aborted) return;
        setServiceOnline(healthResponse.ok);
        if (!healthResponse.ok) {
          const healthBody: unknown = await healthResponse.json();
          throw new Error(
            errorMessage(healthBody, "Start the local analyzer and retry."),
          );
        }
        if (!fixturesResponse.ok) {
          const fixtureBody: unknown = await fixturesResponse.json();
          throw new Error(
            errorMessage(fixtureBody, "Could not load available fixtures."),
          );
        }
        const fixtureBody = (await fixturesResponse.json()) as {
          fixtures: FixtureDescriptor[];
        };
        if (controller.signal.aborted) return;
        setFixtures(fixtureBody.fixtures);
        setLoadState("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setServiceOnline(false);
        setLoadState("error");
        setLoadingMessage(
          error instanceof Error
            ? error.message
            : "Could not connect to the local analyzer.",
        );
      }
    }
    void loadFixtures();
    return () => {
      controller.abort();
    };
  }, []);

  const filteredFindings = useMemo(() => {
    if (!scan) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return scan.findings.filter((finding) => {
      const matchesSeverity = severity === "all" || finding.severity === severity;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${finding.title} ${finding.filePath} ${finding.evidence} ${finding.ruleId ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesSeverity && matchesQuery;
    });
  }, [query, scan, severity]);

  const includedFiles = scan?.files.filter((file) => file.status === "included").length;
  const criticalFindings = scan?.findings.filter(
    (finding) => finding.severity === "critical" || finding.severity === "high",
  ).length;
  const completedScans = scan?.status === "completed" ? 1 : 0;

  async function startScan() {
    if (scanInFlight.current || !serviceOnline) return;
    scanInFlight.current = true;
    setSubmitting(true);
    setScanError(null);
    setScan(null);
    try {
      const response = await fetch("/api/analyzer/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fixtureId }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(errorMessage(body, "The scan request failed."));
      }
      const scanResult = body as AnalysisResponse;
      setScan(scanResult);
      saveScan(scanResult);
    } catch (error) {
      setScanError(
        error instanceof Error
          ? error.message
          : "The scan failed. Check the analyzer service and retry.",
      );
    } finally {
      scanInFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
            Local analysis
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Find issues with evidence.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Run the TypeScript compiler against an allowlisted fixture. Source
            files stay local; repository scripts are never executed.
          </p>
        </div>
        <span className="w-fit rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
          Phase 2 · Fixture-only
        </span>
      </section>

      <section
        aria-label="Scan metrics"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {[
          {
            label: "Findings in latest scan",
            value: scan ? String(scan.findings.length) : "—",
            note: scan ? "Latest fixture scan" : "Run a scan to populate",
          },
          {
            label: "Critical / high",
            value: criticalFindings === undefined ? "—" : String(criticalFindings),
            note: scan ? "From latest scan" : "No scan data yet",
          },
          {
            label: "Completed this session",
            value: String(completedScans),
            note: "Not persisted between sessions",
          },
          {
            label: "Source files checked",
            value: includedFiles === undefined ? "—" : String(includedFiles),
            note: scan ? "In latest scan" : "Analyzer has not run",
          },
        ].map((metric) => (
          <article
            key={metric.label}
            className="rounded-xl border border-border bg-card p-4 sm:p-5"
          >
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <p className="mt-3 text-2xl font-semibold tabular-nums">{metric.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Start a local scan</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Select a fixture registered by the analyzer service.
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] ${serviceOnline
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "bg-amber-400/10 text-amber-300"
                }`}
            >
              {serviceOnline ? "Service ready" : "Service unavailable"}
            </span>
          </div>

          {loadState === "loading" ? (
            <Skeleton
              aria-label="Loading fixtures"
              className="mt-6 h-28 rounded-xl"
            />
          ) : loadState === "error" ? (
            <div
              className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200"
              role="alert"
            >
              {loadingMessage}
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="block text-sm">
                <span className="mb-2 block font-medium">Fixture</span>
                <select
                  aria-label="Select local fixture"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={submitting || fixtures.length === 0}
                  value={fixtureId}
                  onChange={(event) =>
                    setFixtureId(event.target.value as FixtureDescriptor["id"])
                  }
                >
                  {fixtures.map((fixture) => (
                    <option key={fixture.id} value={fixture.id}>
                      {fixture.name}
                    </option>
                  ))}
                </select>
                <span className="mt-2 block text-xs text-muted-foreground">
                  {fixtures.find((fixture) => fixture.id === fixtureId)?.description}
                </span>
              </label>
              <Button
                className="h-11 rounded-lg px-5 text-sm font-semibold"
                size="lg"
                disabled={
                  submitting || !serviceOnline || loadState !== "ready" || fixtures.length === 0
                }
                onClick={() => void startScan()}
                type="button"
              >
                {submitting ? "Analyzing…" : "Start scan"}
              </Button>
            </div>
          )}
          <div className="mt-5 rounded-xl border border-border bg-background px-4 py-3 text-xs leading-5 text-muted-foreground">
            Scope: JS, JSX, TS, TSX and supported config files · 1 MiB/file ·
            50 MiB total · 10,000 files · 30-second analyzer timeout
          </div>
          {scanError && (
            <p className="mt-4 text-sm text-rose-300" role="alert">
              {scanError}
            </p>
          )}
          {submitting && (
            <p className="mt-4 text-sm text-muted-foreground" role="status">
              Running isolated TypeScript checks. Source files are not installed
              or executed.
            </p>
          )}
        </div>

        <aside className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Analyzer status</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            TypeScript compiler diagnostics
          </p>
          {scan?.analyzers.map((analyzer) => (
            <div
              key={analyzer.name}
              className="mt-5 rounded-xl border border-border bg-background p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm">{analyzer.name}</span>
                <span
                  className={`text-xs ${analyzer.status === "completed"
                    ? "text-emerald-300"
                    : "text-amber-300"
                    }`}
                >
                  {analyzer.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {analyzer.message}
              </p>
              {analyzer.version && (
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  {analyzer.version} · {analyzer.durationMs} ms
                </p>
              )}
            </div>
          ))}
          {!scan && (
            <div className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              {serviceOnline
                ? "No analyzer run yet. Results will appear here after a scan."
                : "Start the local analyzer to check availability."}
            </div>
          )}
          {scan?.errors.map((message) => (
            <p key={message} className="mt-3 text-xs text-amber-300" role="status">
              {message}
            </p>
          ))}
        </aside>
      </section>

      {scan && (
        <section aria-labelledby="findings-heading" className="space-y-4">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                {scan.fixtureId.replaceAll("-", " ")} · {scan.status}
              </p>
              <h2 id="findings-heading" className="mt-1 text-xl font-semibold">
                Findings
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Compiler diagnostics are evidence for review, not confirmed bugs.
              </p>
            </div>
            {scan.findings.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_160px]">
                <label className="sr-only" htmlFor="finding-search">
                  Search findings
                </label>
                <SearchInput
                  id="finding-search"
                  className="h-10 rounded-lg bg-card"
                  onChange={(val) => { setQuery(val); setFindingsPage(1); }}
                  placeholder="Search title, file, evidence…"
                  value={query}
                />
                <label className="sr-only" htmlFor="severity-filter">
                  Filter by severity
                </label>
                <select
                  id="severity-filter"
                  className="h-10 rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => { setSeverity(event.target.value); setFindingsPage(1); }}
                  value={severity}
                >
                  <option value="all">All severities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="info">Info</option>
                </select>
              </div>
            )}
          </div>
          {scan.status !== "completed" && (
            <div
              className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200"
              role="status"
            >
              This scan is {scan.status}. Results may be incomplete; review the
              analyzer status before relying on them.
            </div>
          )}
          {filteredFindings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <p className="font-medium">
                {scan.findings.length === 0
                  ? "No findings in this scan"
                  : "No findings match these filters"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {scan.findings.length === 0
                  ? "The configured TypeScript checks completed without diagnostics."
                  : "Try another search term or severity."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3">
                {filteredFindings
                  .slice(
                    (findingsPage - 1) * findingsPageSize,
                    findingsPage * findingsPageSize,
                  )
                  .map((finding) => (
                    <FindingCard
                      key={finding.fingerprint ?? finding.id}
                      finding={finding}
                    />
                  ))}
              </div>

              {/* Reusable Pagination with Ellipses (...) */}
              <Pagination
                currentPage={findingsPage}
                totalPages={Math.ceil(filteredFindings.length / findingsPageSize)}
                onPageChange={setFindingsPage}
                totalItems={filteredFindings.length}
                pageSize={findingsPageSize}
                pageSizeOptions={[5, 10, 20]}
                onPageSizeChange={setFindingsPageSize}
                itemLabel="findings"
              />
            </div>
          )}
        </section>
      )}
    </main>
  );
}
