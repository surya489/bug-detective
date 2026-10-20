export type ScanStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export type FindingCategory =
  | "bug"
  | "security"
  | "performance"
  | "maintainability";

export interface ScanSummary {
  id: string;
  repositoryFullName: string;
  commitSha: string;
  status: ScanStatus;
  createdAt: string;
}

export interface Finding {
  id: string;
  scanId: string;
  title: string;
  category: FindingCategory;
  severity: FindingSeverity;
  filePath: string;
  startLine: number;
  endLine: number;
  evidence: string;
  explanation?: string | null;
}
