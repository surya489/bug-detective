"use client";

import { useState } from "react";
import type { Finding } from "@bug-detective/shared-types";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Sparkles, AlertTriangle } from "lucide-react";

function severityClass(severity: Finding["severity"]): string {
  switch (severity) {
    case "critical":
      return "border-rose-400/20 bg-rose-400/10 text-rose-300";
    case "high":
      return "border-orange-400/20 bg-orange-400/10 text-orange-300";
    case "medium":
      return "border-amber-400/20 bg-amber-400/10 text-amber-300";
    case "low":
      return "border-sky-400/20 bg-sky-400/10 text-sky-300";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

type TriageStatus = "needs_review" | "confirmed" | "false_positive";

export default function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false);
  const [triageStatus, setTriageStatus] = useState<TriageStatus>(
    (finding.status as TriageStatus) || "needs_review",
  );

  return (
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5 transition-all">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${severityClass(finding.severity)}`}
        >
          {finding.severity}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
          {finding.category}
        </span>
        {finding.analyzer === "ai-model" && (
          <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-[11px] font-medium text-purple-300">
            <Sparkles className="size-3" />
            AI Detected
          </span>
        )}

        {/* Triage Status Badge */}
        <span
          className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium ${
            triageStatus === "confirmed"
              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
              : triageStatus === "false_positive"
                ? "bg-zinc-700/50 text-zinc-400 border border-zinc-600/40"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {triageStatus === "confirmed"
            ? "Confirmed Defect"
            : triageStatus === "false_positive"
              ? "False Positive"
              : "Needs review"}
        </span>
      </div>

      <h3 className="mt-3 font-medium text-foreground">{finding.title}</h3>
      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
        {finding.filePath}:{finding.startLine}
        {finding.endLine !== finding.startLine ? `-${finding.endLine}` : ""}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
        <Button
          className="h-auto px-0 py-1 text-xs font-medium text-primary"
          size="sm"
          variant="link"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Hide details & analysis" : "Review details & AI analysis"}
        </Button>

        {/* Manual Tracking Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setTriageStatus(
                triageStatus === "confirmed" ? "needs_review" : "confirmed",
              )
            }
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              triageStatus === "confirmed"
                ? "border-rose-500 bg-rose-500/20 text-rose-300"
                : "border-border text-muted-foreground hover:border-rose-500/40 hover:text-rose-400"
            }`}
            title="Confirm this finding as an actual bug"
          >
            <AlertTriangle className="size-3" />
            <span>Confirm Bug</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setTriageStatus(
                triageStatus === "false_positive"
                  ? "needs_review"
                  : "false_positive",
              )
            }
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              triageStatus === "false_positive"
                ? "border-zinc-500 bg-zinc-800 text-zinc-300"
                : "border-border text-muted-foreground hover:border-zinc-500/40 hover:text-zinc-300"
            }`}
            title="Mark this finding as a false positive"
          >
            <XCircle className="size-3" />
            <span>False Positive</span>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-border pt-4 text-sm">
          {finding.description && (
            <p className="text-muted-foreground">{finding.description}</p>
          )}

          {/* AI Explanation Box */}
          {finding.explanation && (
            <div className="rounded-lg border border-purple-500/20 bg-purple-950/20 p-3.5 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-purple-300">
                <Sparkles className="size-3.5" />
                <span>AI Explanation & Code Review</span>
                {finding.confidence && (
                  <span className="ml-auto rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-200">
                    {(finding.confidence * 100).toFixed(0)}% confidence
                  </span>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed text-zinc-300">
                {finding.explanation}
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-foreground">Code evidence</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 font-mono text-xs text-muted-foreground">
              {finding.evidence}
            </pre>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Analyzer</dt>
              <dd className="mt-1 font-medium text-foreground">
                {finding.analyzer ?? "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rule</dt>
              <dd className="mt-1 font-mono">{finding.ruleId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Verification</dt>
              <dd className="mt-1">
                {finding.analyzer === "ai-model" ? "Verified" : "Not run"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="mt-1 capitalize">{triageStatus.replace("_", " ")}</dd>
            </div>
          </dl>
        </div>
      )}
    </article>
  );
}
