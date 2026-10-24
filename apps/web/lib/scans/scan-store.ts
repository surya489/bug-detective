"use client";

import type {
  AnalysisResponse,
  Finding,
  FindingStatus,
} from "@bug-detective/shared-types";

const SCANS_STORAGE_KEY = "bug_detective_scans";
const TRIAGE_STORAGE_KEY = "bug_detective_triage";
const EVENT_NAME = "bug_detective_store_change";

export const SEED_SCAN: AnalysisResponse = {
  id: "scan_seed_sample_01",
  fixtureId: "buggy-react-app",
  repositoryFullName: "acme-corp/payment-dashboard",
  commitSha: "2fe2953357b4ad007480dd102c60c8eb26b2d590",
  status: "completed",
  startedAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  finishedAt: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
  errors: [],
  files: [
    {
      path: "src/components/Dashboard.tsx",
      status: "included",
      reason: "Matched TypeScript/React scanner pattern",
      sizeBytes: 1420,
    },
    {
      path: "src/api/client.ts",
      status: "included",
      reason: "Matched TypeScript/React scanner pattern",
      sizeBytes: 890,
    },
    {
      path: "package.json",
      status: "skipped",
      reason: "Configuration file omitted from AST analyzer",
      sizeBytes: 450,
    },
  ],
  analyzers: [
    {
      name: "typescript-ast",
      version: "5.4.2",
      status: "completed",
      message: "Analyzed TypeScript AST syntax trees",
      filesAnalyzed: 2,
      findingsCount: 2,
      durationMs: 420,
    },
    {
      name: "ai-model",
      version: "1.0.0-lora",
      status: "completed",
      message: "Evaluated code security, bugs & memory leaks with AI",
      filesAnalyzed: 2,
      findingsCount: 4,
      durationMs: 780,
    },
  ],
  findings: [
    {
      id: "f_seed_001",
      scanId: "scan_seed_sample_01",
      title: "Hardcoded secret or credential token detected",
      category: "security",
      severity: "critical",
      filePath: "src/components/Dashboard.tsx",
      startLine: 18,
      endLine: 18,
      evidence: 'const apiKey = "sk-live-9876543210abcdef123456";',
      explanation:
        "The string appears to be a production secret or API token. Committing secrets to version control exposes them to unauthorized access. Move credentials to server-side environment variables (.env) or a secret manager.",
      description: "Hardcoded secret matches pattern: sk-live-...",
      ruleId: "AI-SEC-001",
      analyzer: "ai-model",
      confidence: 0.98,
      status: "needs_review",
      verification: "verified",
    },
    {
      id: "f_seed_002",
      scanId: "scan_seed_sample_01",
      title: "Cross-Site Scripting (XSS) risk via dangerouslySetInnerHTML",
      category: "security",
      severity: "high",
      filePath: "src/components/Dashboard.tsx",
      startLine: 45,
      endLine: 45,
      evidence: '<div dangerouslySetInnerHTML={{ __html: "<p>Unsafe markup</p>" }} />',
      explanation:
        "Using dangerouslySetInnerHTML bypasses React's built-in XSS protection. If HTML content is derived from untrusted input, attackers could execute arbitrary JavaScript in user sessions. Sanitize with DOMPurify before injecting.",
      description: "Unsanitized HTML injection risk",
      ruleId: "AI-SEC-002",
      analyzer: "ai-model",
      confidence: 0.95,
      status: "confirmed",
      verification: "verified",
    },
    {
      id: "f_seed_003",
      scanId: "scan_seed_sample_01",
      title: "Potential memory leak: Event listener not cleaned up in useEffect",
      category: "performance",
      severity: "medium",
      filePath: "src/components/Dashboard.tsx",
      startLine: 22,
      endLine: 24,
      evidence: 'window.addEventListener("resize", handleResize);',
      explanation:
        "An event listener was added in useEffect without returning a corresponding cleanup function. Each re-render registers an additional listener, causing memory leaks and degraded performance.",
      description: "Missing removeEventListener cleanup handler in effect",
      ruleId: "AI-PERF-001",
      analyzer: "ai-model",
      confidence: 0.92,
      status: "needs_review",
      verification: "verified",
    },
    {
      id: "f_seed_004",
      scanId: "scan_seed_sample_01",
      title: "Direct React state mutation will not trigger re-render",
      category: "bug",
      severity: "high",
      filePath: "src/components/Dashboard.tsx",
      startLine: 29,
      endLine: 30,
      evidence: "items.push(newItem);\nsetItems(items);",
      explanation:
        "Mutating state directly (e.g., array.push) violates React immutability rules. Because React checks object references, mutating in place causes missing re-renders and subtle synchronization bugs. Use `setItems(prev => [...prev, newItem])`.",
      description: "Mutating React state in place",
      ruleId: "AI-BUG-002",
      analyzer: "ai-model",
      confidence: 0.94,
      status: "confirmed",
      verification: "verified",
    },
    {
      id: "f_seed_005",
      scanId: "scan_seed_sample_01",
      title: "Empty catch block swallows error silently",
      category: "bug",
      severity: "medium",
      filePath: "src/components/Dashboard.tsx",
      startLine: 37,
      endLine: 39,
      evidence: "} catch (err) {\n  // empty\n}",
      explanation:
        "Swallowing errors hides failures from developers and users, making network failures or parsing issues impossible to debug. Log the error or propagate a user-visible notification.",
      description: "Unhandled caught exception",
      ruleId: "AI-BUG-001",
      analyzer: "ai-model",
      confidence: 0.89,
      status: "false_positive",
      verification: "verified",
    },
    {
      id: "f_seed_006",
      scanId: "scan_seed_sample_01",
      title: "Type assertion bypasses TypeScript compiler check",
      category: "maintainability",
      severity: "low",
      filePath: "src/api/client.ts",
      startLine: 14,
      endLine: 14,
      evidence: "const data = response.data as any;",
      explanation:
        "Casting to `any` silences TypeScript checks and may allow unexpected runtime null or undefined properties.",
      description: "Unsafe any assertion",
      ruleId: "TS-AST-014",
      analyzer: "typescript-ast",
      confidence: 0.85,
      status: "needs_review",
      verification: "not_run",
    },
  ],
};

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage quota or disabled
  }
}

function emitChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getTriageMap(): Record<string, FindingStatus> {
  return readStorage<Record<string, FindingStatus>>(TRIAGE_STORAGE_KEY, {
    f_seed_002: "confirmed",
    f_seed_004: "confirmed",
    f_seed_005: "false_positive",
  });
}

export function setFindingTriage(
  findingId: string,
  status: FindingStatus,
): void {
  const current = getTriageMap();
  current[findingId] = status;
  writeStorage(TRIAGE_STORAGE_KEY, current);
  emitChange();
}

export function getSavedScans(): AnalysisResponse[] {
  const stored = readStorage<AnalysisResponse[]>(SCANS_STORAGE_KEY, []);
  const scans = stored.length > 0 ? stored : [SEED_SCAN];
  const triage = getTriageMap();

  return scans.map((scan) => ({
    ...scan,
    findings: scan.findings.map((f) => ({
      ...f,
      status: triage[f.id] || f.status || "needs_review",
    })),
  }));
}

export function saveScan(scan: AnalysisResponse): void {
  const current = readStorage<AnalysisResponse[]>(SCANS_STORAGE_KEY, []);
  const updated = [
    scan,
    ...current.filter((s) => s.id !== scan.id),
  ].slice(0, 50); // Keep 50 most recent scans
  writeStorage(SCANS_STORAGE_KEY, updated);
  emitChange();
}

export function getScanById(scanId: string): AnalysisResponse | undefined {
  const scans = getSavedScans();
  return scans.find((s) => s.id === scanId);
}

export function getAllFindings(): Finding[] {
  const scans = getSavedScans();
  const triage = getTriageMap();
  const findings: Finding[] = [];
  const seenIds = new Set<string>();

  for (const scan of scans) {
    for (const finding of scan.findings) {
      if (!seenIds.has(finding.id)) {
        seenIds.add(finding.id);
        findings.push({
          ...finding,
          status: triage[finding.id] || finding.status || "needs_review",
        });
      }
    }
  }

  return findings;
}

export function subscribeToStore(callback: () => void): () => void {
  if (typeof window === "undefined") return () => { };
  window.addEventListener(EVENT_NAME, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT_NAME, callback);
    window.removeEventListener("storage", callback);
  };
}
