export type ScanStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
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
  description?: string | null;
  fingerprint?: string | null;
  analyzer?: string | null;
  ruleId?: string | null;
  confidence?: number | null;
  status: "needs_review";
  verification: "not_run";
}

export interface FixtureDescriptor {
  id: "buggy-react-app" | "clean-react-app";
  name: string;
  description: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  defaultBranch: string | null;
  visibility: "public" | "private" | "internal";
  updatedAt: string | null;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
}

export interface GitHubSessionState {
  configured: boolean;
  connected: boolean;
  login: string | null;
  csrfToken: string | null;
}

export interface FileInspection {
  path: string;
  status: "included" | "skipped";
  reason: string;
  sizeBytes: number;
}

export interface AnalyzerRun {
  name: string;
  version: string | null;
  status:
    | "completed"
    | "partial"
    | "failed"
    | "timed_out"
    | "output_limit"
    | "unavailable"
    | "skipped";
  message: string;
  filesAnalyzed: number;
  findingsCount: number;
  durationMs: number;
}

export interface AnalysisResponse {
  id: string;
  fixtureId: string;
  repositoryFullName?: string | null;
  commitSha?: string | null;
  status: ScanStatus;
  findings: Finding[];
  files: FileInspection[];
  analyzers: AnalyzerRun[];
  errors: string[];
  startedAt: string;
  finishedAt: string;
}
