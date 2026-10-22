"use client";

import { useState } from "react";
import type { Finding } from "@bug-detective/shared-types";
import { Button } from "@/components/ui/button";

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

export default function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${severityClass(finding.severity)}`}
        >
          {finding.severity}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
          {finding.category}
        </span>
        <span className="ml-auto rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
          Needs review
        </span>
      </div>
      <h3 className="mt-3 font-medium">{finding.title}</h3>
      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
        {finding.filePath}:{finding.startLine}
        {finding.endLine !== finding.startLine ? `-${finding.endLine}` : ""}
      </p>
      <Button
        className="mt-4 h-auto px-0 py-1 text-xs font-medium text-primary"
        size="sm"
        variant="link"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "Hide evidence" : "Review evidence"}
      </Button>
      {expanded && (
        <div className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
          <p className="text-muted-foreground">{finding.description}</p>
          <div>
            <p className="text-xs font-medium text-foreground">Compiler evidence</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 font-mono text-xs text-muted-foreground">
              {finding.evidence}
            </pre>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Analyzer</dt>
              <dd className="mt-1">{finding.analyzer ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rule</dt>
              <dd className="mt-1 font-mono">{finding.ruleId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Verification</dt>
              <dd className="mt-1">Not run</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">AI explanation</dt>
              <dd className="mt-1">Not available</dd>
            </div>
          </dl>
        </div>
      )}
    </article>
  );
}
