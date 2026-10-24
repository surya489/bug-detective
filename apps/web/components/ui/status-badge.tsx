import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import type {
  FindingSeverity,
  FindingStatus,
  ScanStatus,
} from "@bug-detective/shared-types";

export function SeverityBadge({
  severity,
  className = "",
}: {
  severity: FindingSeverity | string;
  className?: string;
}) {
  let style = "border-border bg-muted text-muted-foreground";

  switch (severity) {
    case "critical":
      style = "border-rose-400/20 bg-rose-400/10 text-rose-300";
      break;
    case "high":
      style = "border-orange-400/20 bg-orange-400/10 text-orange-300";
      break;
    case "medium":
      style = "border-amber-400/20 bg-amber-400/10 text-amber-300";
      break;
    case "low":
      style = "border-sky-400/20 bg-sky-400/10 text-sky-300";
      break;
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${style} ${className}`}
    >
      {severity}
    </span>
  );
}

export function ScanStatusBadge({
  status,
  className = "",
}: {
  status: ScanStatus;
  className?: string;
}) {
  switch (status) {
    case "completed":
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400 ${className}`}
        >
          <CheckCircle2 className="size-3" />
          <span>Completed</span>
        </span>
      );
    case "partial":
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300 ${className}`}
        >
          <AlertTriangle className="size-3" />
          <span>Partial</span>
        </span>
      );
    case "failed":
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-400 ${className}`}
        >
          <XCircle className="size-3" />
          <span>Failed</span>
        </span>
      );
    case "running":
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300 animate-pulse ${className}`}
        >
          <RefreshCw className="size-3 animate-spin" />
          <span>Running</span>
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground ${className}`}
        >
          {status}
        </span>
      );
  }
}

export function TriageBadge({
  status,
  className = "",
}: {
  status: FindingStatus | string;
  className?: string;
}) {
  let style = "bg-muted text-muted-foreground border border-border";
  let label = "Needs review";

  if (status === "confirmed") {
    style = "bg-rose-500/20 text-rose-300 border border-rose-500/30";
    label = "Confirmed Defect";
  } else if (status === "false_positive") {
    style = "bg-zinc-700/50 text-zinc-400 border border-zinc-600/40";
    label = "False Positive";
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${style} ${className}`}
    >
      {label}
    </span>
  );
}
