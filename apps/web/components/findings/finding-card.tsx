"use client";

import { useEffect, useState } from "react";
import type { Finding, FindingStatus } from "@bug-detective/shared-types";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  Sparkles,
  AlertTriangle,
  Copy,
  Check,
  GitCommit,
} from "lucide-react";
import { SeverityBadge, TriageBadge } from "@/components/ui/status-badge";
import { setFindingTriage } from "@/lib/scans/scan-store";

export default function FindingCard({
  finding,
  onTriageChange,
}: {
  finding: Finding;
  onTriageChange?: (findingId: string, status: FindingStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [triageStatus, setTriageStatus] = useState<FindingStatus>(
    (finding.status as FindingStatus) || "needs_review",
  );

  useEffect(() => {
    setTriageStatus((finding.status as FindingStatus) || "needs_review");
  }, [finding.status]);

  const handleUpdateTriage = (next: FindingStatus) => {
    setTriageStatus(next);
    setFindingTriage(finding.id, next);
    onTriageChange?.(finding.id, next);
  };

  const handleCopyEvidence = async () => {
    try {
      await navigator.clipboard.writeText(finding.evidence);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback
    }
  };

  return (
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5 transition-all hover:border-primary/30">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground capitalize">
          {finding.category}
        </span>
        {finding.analyzer === "ai-model" && (
          <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-[11px] font-medium text-purple-300">
            <Sparkles className="size-3" />
            AI Detected
          </span>
        )}
        {finding.inCommitDiff && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
            <GitCommit className="size-3" />
            Commit Diff
          </span>
        )}

        {/* Reusable Triage Status Badge */}
        <div className="ml-auto">
          <TriageBadge status={triageStatus} />
        </div>
      </div>

      <h3 className="mt-3 font-semibold text-foreground text-sm sm:text-base">
        {finding.title}
      </h3>
      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
        {finding.filePath}:{finding.startLine}
        {finding.endLine !== finding.startLine ? `-${finding.endLine}` : ""}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
        <Button
          className="h-auto px-0 py-1 text-xs font-medium text-primary hover:underline"
          size="sm"
          variant="link"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Hide details & analysis" : "Review details & AI analysis"}
        </Button>

        {/* Manual Tracking Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              handleUpdateTriage(
                triageStatus === "confirmed" ? "needs_review" : "confirmed",
              )
            }
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              triageStatus === "confirmed"
                ? "border-rose-500 bg-rose-500/20 text-rose-300 font-semibold"
                : "border-border text-muted-foreground hover:border-rose-500/40 hover:text-rose-400 bg-background"
            }`}
            title="Confirm this finding as an actual bug"
          >
            <AlertTriangle className="size-3.5" />
            <span>Confirm Bug</span>
          </button>

          <button
            type="button"
            onClick={() =>
              handleUpdateTriage(
                triageStatus === "false_positive"
                  ? "needs_review"
                  : "false_positive",
              )
            }
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              triageStatus === "false_positive"
                ? "border-zinc-500 bg-zinc-800 text-zinc-300 font-semibold"
                : "border-border text-muted-foreground hover:border-zinc-500/40 hover:text-zinc-300 bg-background"
            }`}
            title="Mark this finding as a false positive"
          >
            <XCircle className="size-3.5" />
            <span>False Positive</span>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-border pt-4 text-sm">
          {finding.description && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {finding.description}
            </p>
          )}

          {/* AI Explanation Box */}
          {finding.explanation && (
            <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-4 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-purple-300">
                <Sparkles className="size-4" />
                <span>AI Explanation & Code Review</span>
                {finding.confidence && (
                  <span className="ml-auto rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-medium text-purple-200 border border-purple-500/30">
                    {(finding.confidence * 100).toFixed(0)}% confidence
                  </span>
                )}
              </div>
              <p className="mt-2.5 whitespace-pre-wrap leading-relaxed text-zinc-300">
                {finding.explanation}
              </p>
            </div>
          )}

          {/* AI Suggested Code Diff Fix */}
          {finding.suggestedFix && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                <Sparkles className="size-4" />
                <span>AI Suggested Fix</span>
              </div>
              <pre className="mt-2.5 overflow-x-auto whitespace-pre-wrap rounded-lg border border-emerald-500/20 bg-background/80 p-3 font-mono text-[11px] text-emerald-300">
                {finding.suggestedFix}
              </pre>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-foreground">Code evidence</p>
              <button
                type="button"
                onClick={() => void handleCopyEvidence()}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {copied ? (
                  <>
                    <Check className="size-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-border/80 bg-background p-3.5 font-mono text-xs text-muted-foreground">
              {finding.evidence}
            </pre>
          </div>

          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border/60 bg-card/60 p-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Analyzer</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {finding.analyzer ?? "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rule ID</dt>
              <dd className="mt-1 font-mono font-medium text-primary">
                {finding.ruleId ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Verification</dt>
              <dd className="mt-1 font-medium capitalize text-emerald-400">
                {finding.analyzer === "ai-model" ? "Verified" : "Compiler AST"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Triage Status</dt>
              <dd className="mt-1 font-semibold capitalize text-foreground">
                {triageStatus.replace("_", " ")}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </article>
  );
}
