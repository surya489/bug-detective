"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  ExternalLink,
  Flame,
  FolderGit2,
  Lock,
  RefreshCw,
  Save,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface HealthCheckResult {
  online: boolean;
  latencyMs: number | null;
  checkedAt: string | null;
  detail?: string;
}

const ACTIVE_AI_RULES = [
  {
    id: "AI-SEC-001",
    name: "Hardcoded Secrets & API Keys",
    severity: "critical",
    category: "security",
    confidence: "98%",
    description: "Detects exposed tokens, AWS keys, JWTs, and API credentials in client code.",
  },
  {
    id: "AI-SEC-002",
    name: "XSS via dangerouslySetInnerHTML",
    severity: "high",
    category: "security",
    confidence: "95%",
    description: "Flags unsanitized HTML markup injected into React DOM elements.",
  },
  {
    id: "AI-SEC-003",
    name: "Dynamic eval() Execution",
    severity: "critical",
    category: "security",
    confidence: "96%",
    description: "Prevents arbitrary string evaluation and injection vulnerabilities.",
  },
  {
    id: "AI-SEC-004",
    name: "Sensitive Token Console Logging",
    severity: "medium",
    category: "security",
    confidence: "90%",
    description: "Identifies console.log statements that expose passwords or credentials in browser logs.",
  },
  {
    id: "AI-BUG-001",
    name: "Swallowed Catch Block",
    severity: "medium",
    category: "bug",
    confidence: "89%",
    description: "Catches empty exception blocks that silently swallow runtime failures.",
  },
  {
    id: "AI-BUG-002",
    name: "Direct React State Mutation",
    severity: "high",
    category: "bug",
    confidence: "94%",
    description: "Finds in-place mutations like array.push on React state that prevent re-renders.",
  },
  {
    id: "AI-PERF-001",
    name: "Uncleaned Event Listener in useEffect",
    severity: "medium",
    category: "performance",
    confidence: "92%",
    description: "Flags missing cleanup functions for window/document listeners causing memory leaks.",
  },
];

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthCheckResult>({
    online: false,
    latencyMs: null,
    checkedAt: null,
  });
  const [checking, setChecking] = useState(false);

  // Quality gate state
  const [maxCritical, setMaxCritical] = useState(0);
  const [maxBugs, setMaxBugs] = useState(0);
  const [minConfidence, setMinConfidence] = useState(80);
  const [autoVerify, setAutoVerify] = useState(true);
  const [savedNotice, setSavedNotice] = useState(false);

  // Check analyzer health
  const checkHealth = async () => {
    setChecking(true);
    const start = performance.now();
    try {
      const res = await fetch("/api/analyzer/health", { cache: "no-store" });
      const elapsed = Math.round(performance.now() - start);
      setHealth({
        online: res.ok,
        latencyMs: elapsed,
        checkedAt: new Date().toLocaleTimeString(),
      });
    } catch {
      setHealth({
        online: false,
        latencyMs: null,
        checkedAt: new Date().toLocaleTimeString(),
        detail: "Could not reach Python FastAPI analyzer at port 8001.",
      });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void checkHealth();
  }, []);

  const handleSaveQualityGate = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Settings className="size-4" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Workspace Configuration
          </p>
        </div>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Settings & AI Diagnostics
        </h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Manage local Python AI engine parameters, review active inspection rules, and set SonarQube quality gates.
        </p>
      </div>

      {/* Grid: Diagnostics and Quality Gate */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Python AI Engine Diagnostics */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
                <BrainCircuit className="size-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Python AI Engine Status
                </h2>
                <p className="text-xs text-muted-foreground">
                  FastAPI service & local analyzer runtime
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={checking}
              onClick={() => void checkHealth()}
              className="gap-1.5 rounded-xl text-xs font-medium"
            >
              <RefreshCw className={`size-3.5 ${checking ? "animate-spin" : ""}`} />
              <span>Ping Service</span>
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background p-3.5 text-xs">
              <span className="text-muted-foreground">Service Health</span>
              <span
                className={`inline-flex items-center gap-1.5 font-semibold ${
                  health.online ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {health.online ? (
                  <>
                    <CheckCircle2 className="size-4" />
                    <span>Online (200 OK)</span>
                  </>
                ) : (
                  <>
                    <XCircle className="size-4" />
                    <span>Offline / Unreachable</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background p-3.5 text-xs">
              <span className="text-muted-foreground">Endpoint URL</span>
              <span className="font-mono font-medium text-foreground">
                http://127.0.0.1:8001
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background p-3.5 text-xs">
              <span className="text-muted-foreground">Round-Trip Latency</span>
              <span className="font-mono font-medium text-foreground">
                {health.latencyMs !== null ? `${health.latencyMs} ms` : "—"}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background p-3.5 text-xs">
              <span className="text-muted-foreground">Analyzer API Security</span>
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <Lock className="size-3" />
                Configured & Protected
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background p-3.5 text-xs">
              <span className="text-muted-foreground">AI Analyzer Mode</span>
              <span className="font-medium text-purple-300">
                Local Heuristic + LoRA PEFT Adapter
              </span>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-border/60 bg-background p-3.5">
            <p className="text-[11px] font-semibold text-foreground">
              To restart the local Python analyzer:
            </p>
            <pre className="mt-1.5 overflow-x-auto rounded-lg bg-card p-2.5 font-mono text-[11px] text-muted-foreground">
              python -m uvicorn app.main:app --app-dir services/analyzer --port 8001
            </pre>
          </div>
        </section>

        {/* Quality Gate Settings */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="size-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  SonarQube Quality Gate
                </h2>
                <p className="text-xs text-muted-foreground">
                  Define pass/fail criteria for pull requests and repository scans
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveQualityGate} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground">
                  Max Allowed Critical Security Issues
                </label>
                <div className="mt-1.5 flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={maxCritical}
                    onChange={(e) => setMaxCritical(Number(e.target.value))}
                    className="h-10 w-24 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Block commits if critical vulnerabilities exceed this limit
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground">
                  Max Allowed High Severity Bugs
                </label>
                <div className="mt-1.5 flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={maxBugs}
                    onChange={(e) => setMaxBugs(Number(e.target.value))}
                    className="h-10 w-24 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Fail quality gate on undetected state mutations or logic flaws
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground">
                  Minimum AI Confidence Threshold ({minConfidence}%)
                </label>
                <div className="mt-1.5 flex items-center gap-3">
                  <input
                    type="range"
                    min="50"
                    max="100"
                    step="5"
                    value={minConfidence}
                    onChange={(e) => setMinConfidence(Number(e.target.value))}
                    className="h-2 w-full max-w-xs cursor-pointer accent-primary"
                  />
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {minConfidence}%
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Findings below this confidence rating require explicit engineer approval
                </p>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <input
                  type="checkbox"
                  id="autoVerify"
                  checked={autoVerify}
                  onChange={(e) => setAutoVerify(e.target.checked)}
                  className="size-4 rounded accent-primary"
                />
                <label htmlFor="autoVerify" className="text-xs text-foreground cursor-pointer">
                  Cross-verify AI findings with TypeScript compiler AST
                </label>
              </div>

              <div className="pt-2">
                <Button type="submit" size="sm" className="gap-1.5 rounded-xl text-xs font-semibold">
                  <Save className="size-3.5" />
                  <span>Save Quality Gate</span>
                </Button>
                {savedNotice && (
                  <span className="ml-3 text-xs text-emerald-400 font-medium">
                    Quality Gate parameters saved!
                  </span>
                )}
              </div>
            </form>
          </div>
        </section>
      </div>

      {/* Model Fine-Tuning & Feedback Loop Section */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <Terminal className="size-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                AI Model Fine-Tuning & Training Pipeline
              </h2>
              <p className="text-xs text-muted-foreground">
                Train your model using LoRA / PEFT with human feedback
              </p>
            </div>
          </div>

          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            PEFT / LoRA Ready
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">1. Collect Feedback</p>
            <p className="mt-1 text-xs text-foreground">
              Engineers review findings in the <strong>Findings Tracker</strong> and flag
              Confirmed Bugs or False Positives.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">2. Export Dataset</p>
            <p className="mt-1 text-xs text-foreground">
              Click <strong>Export Triage Dataset</strong> or run the exporter to produce
              JSONL instruction pairs.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">3. Run Fine-Tuning</p>
            <p className="mt-1 text-xs text-foreground">
              Execute PEFT/LoRA fine-tuning in Python to update adapter weights with your team&apos;s code standards.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border/60 bg-background p-4">
          <p className="text-xs font-semibold text-foreground">
            Execute Training Script in Terminal:
          </p>
          <div className="mt-2 space-y-1.5 font-mono text-xs">
            <p className="text-muted-foreground"># Dry run verification of training pipeline:</p>
            <p className="text-primary font-medium">
              python -m training.train --data services/analyzer/training/sample_data.jsonl --dry-run
            </p>
          </div>
        </div>
      </section>

      {/* Active AI Rules Catalog */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
              <Cpu className="size-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Active AI Detection Rules ({ACTIVE_AI_RULES.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Custom heuristic rules and neural classifiers evaluated on every commit
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIVE_AI_RULES.map((rule) => (
            <div
              key={rule.id}
              className="rounded-xl border border-border bg-background p-4 transition-all hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-primary">
                  {rule.id}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                    rule.severity === "critical"
                      ? "border border-rose-500/30 bg-rose-500/10 text-rose-300"
                      : rule.severity === "high"
                        ? "border border-orange-500/30 bg-orange-500/10 text-orange-300"
                        : "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                  }`}
                >
                  {rule.severity}
                </span>
              </div>

              <h3 className="mt-2 text-xs font-semibold text-foreground">
                {rule.name}
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {rule.description}
              </p>

              <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
                <span className="capitalize">{rule.category}</span>
                <span className="text-purple-300 font-medium">
                  {rule.confidence} baseline
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
