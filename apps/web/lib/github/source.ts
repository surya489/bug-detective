import {
  getBlob,
  getCommitTree,
  getRepositoryCommitDetails,
  GitHubApiError,
  type GitHubRepository,
  validateRepositoryCommit,
} from "./api";

const MAX_TREE_ENTRIES = 50_000;
const MAX_FILES = 500;
const MAX_FILE_BYTES = 1 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_PROCESSING_MS = 300_000;
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const SAFE_JSON_CONFIGS = new Set([
  ".prettierrc.json",
  "jsconfig.json",
  "package.json",
  "tsconfig.json",
]);
const IGNORED_DIRECTORIES = new Set([
  ".aws",
  ".git",
  ".gnupg",
  ".next",
  ".ssh",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "out",
  "vendor",
  "venv",
]);
const SENSITIVE_NAMES = new Set([
  ".npmrc",
  ".pypirc",
  "credentials",
  "credentials.json",
  "id_rsa",
  "id_ed25519",
  "secrets",
  "secrets.json",
]);
const SENSITIVE_SUFFIXES = new Set([
  ".key",
  ".keystore",
  ".p12",
  ".pem",
  ".pfx",
]);

export interface RetrievedSourceFile {
  path: string;
  content: string;
  status?: string;
  patch?: string;
  changedLines?: number[];
}

export function parseDiffChangedLines(patch?: string): number[] {
  if (!patch) return [];
  const changedLines: number[] = [];
  const lines = patch.split("\n");
  let currentLine = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match) {
        currentLine = parseInt(match[1], 10);
      }
    } else if (line.startsWith("+")) {
      changedLines.push(currentLine);
      currentLine += 1;
    } else if (line.startsWith("-")) {
      // Deleted lines do not advance line counter in new version
    } else {
      currentLine += 1;
    }
  }

  return changedLines;
}

export interface SourceInspection {
  path: string;
  status: "skipped";
  reason: string;
  sizeBytes?: number;
}

export interface RetrievedRepositorySource {
  files: RetrievedSourceFile[];
  inspections: SourceInspection[];
  warnings: string[];
}

function canonicalPath(path: string): string | null {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(path) ||
    path.includes(":")
  ) {
    return null;
  }
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts.join("/");
}

function excludedPath(path: string): string | null {
  const parts = path.split("/");
  const filename = parts[parts.length - 1].toLowerCase();
  if (parts.some((part) => part.toLowerCase().startsWith(".env"))) {
    return "sensitive_environment_file";
  }
  if (parts.slice(0, -1).some((part) => IGNORED_DIRECTORIES.has(part.toLowerCase()))) {
    return "generated_or_dependency_directory";
  }
  if (
    parts.some(
      (part) =>
        SENSITIVE_NAMES.has(part.toLowerCase()) ||
        ["credential", "password", "private_key", "secret", "token"].some((marker) =>
          part.toLowerCase().includes(marker),
        ),
    )
  ) {
    return "sensitive_file";
  }
  const suffix = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
  if (SENSITIVE_SUFFIXES.has(suffix)) {
    return "private_key_or_credential_file";
  }
  if (/\.min\.(?:c?js|c?ts|jsx|tsx|mjs|mts)$/.test(filename)) {
    return "generated_or_minified_file";
  }
  if (["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"].includes(filename) || suffix === ".lock") {
    return "lockfile";
  }
  if (SAFE_JSON_CONFIGS.has(filename)) return null;
  if (SOURCE_EXTENSIONS.has(suffix)) return null;
  return "unsupported_file_type";
}

function recordSkipped(
  inspections: SourceInspection[],
  path: string,
  reason: string,
  sizeBytes?: number,
): void {
  inspections.push({
    path,
    status: "skipped",
    reason,
    sizeBytes: sizeBytes ?? 0,
  });
}

function decodeBlobContent(
  encodedContent: string,
  expectedSize: number,
): Uint8Array | null {
  const compact = encodedContent.replace(/\s/g, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)) {
    return null;
  }
  const bytes = Buffer.from(compact, "base64");
  return bytes.byteLength === expectedSize ? bytes : null;
}

export async function retrieveRepositorySource(
  accessToken: string,
  repository: GitHubRepository,
  commitSha: string,
): Promise<RetrievedRepositorySource> {
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
    throw new GitHubApiError("not_found", 404);
  }
  const started = Date.now();
  const remainingMs = () => MAX_PROCESSING_MS - (Date.now() - started);
  if (remainingMs() <= 0) throw new GitHubApiError("limit", 0);
  const commitDetail = await getRepositoryCommitDetails(
    accessToken,
    repository,
    commitSha,
    remainingMs(),
  );
  if (!commitDetail) throw new GitHubApiError("not_found", 404);
  if (remainingMs() <= 0) throw new GitHubApiError("limit", 0);

  const commitFilesMap = new Map<
    string,
    { status: string; patch?: string; changedLines: number[] }
  >();
  if (Array.isArray(commitDetail.files) && commitDetail.files.length > 0) {
    for (const file of commitDetail.files) {
      if (file.status !== "removed") {
        commitFilesMap.set(file.filename, {
          status: file.status,
          patch: file.patch,
          changedLines: parseDiffChangedLines(file.patch),
        });
      }
    }
  }

  const tree = await getCommitTree(
    accessToken,
    repository,
    commitSha,
    remainingMs(),
  );
  const files: RetrievedSourceFile[] = [];
  const inspections: SourceInspection[] = [];
  const warnings: string[] = [];
  let totalBytes = 0;
  let visitedEntries = 0;

  if (tree.truncated) {
    warnings.push("GitHub returned a truncated commit tree; this scan may be incomplete.");
  }
  for (const entry of tree.entries) {
    visitedEntries += 1;
    if (visitedEntries > MAX_TREE_ENTRIES) {
      warnings.push("The repository tree exceeded the supported entry limit.");
      break;
    }
    if (remainingMs() <= 0) {
      warnings.push("Source retrieval reached the processing time limit.");
      break;
    }
    if (entry.type === "tree") continue;
    const path = canonicalPath(entry.path);
    if (!path) {
      recordSkipped(inspections, "unavailable-path", "invalid_path");
      warnings.push("One or more repository paths could not be safely processed.");
      continue;
    }

    if (
      commitFilesMap.size > 0 &&
      !commitFilesMap.has(path) &&
      !SAFE_JSON_CONFIGS.has(path.toLowerCase())
    ) {
      continue;
    }
    if (entry.type === "commit") {
      recordSkipped(inspections, path, "git_submodule");
      continue;
    }
    if (entry.mode === "120000") {
      recordSkipped(inspections, path, "symlink");
      continue;
    }
    if (entry.type !== "blob" || entry.mode !== "100644" && entry.mode !== "100755") {
      recordSkipped(inspections, path, "unsupported_file_type");
      continue;
    }
    const exclusion = excludedPath(path);
    if (exclusion) {
      recordSkipped(inspections, path, exclusion, entry.size);
      continue;
    }
    if (typeof entry.size !== "number" || !Number.isSafeInteger(entry.size) || entry.size < 0) {
      recordSkipped(inspections, path, "invalid_blob_metadata");
      warnings.push("Some eligible source files had invalid GitHub metadata.");
      continue;
    }
    if (entry.size > MAX_FILE_BYTES) {
      recordSkipped(inspections, path, "file_size_limit", entry.size);
      warnings.push("One or more eligible files exceeded the per-file size limit.");
      continue;
    }
    if (files.length >= MAX_FILES) {
      recordSkipped(inspections, path, "file_count_limit", entry.size);
      warnings.push("The eligible source file count exceeded the configured limit.");
      continue;
    }
    if (totalBytes + entry.size > MAX_TOTAL_BYTES) {
      recordSkipped(inspections, path, "total_size_limit", entry.size);
      warnings.push("Eligible files exceeded the configured total size limit.");
      continue;
    }
    try {
      const blob = await getBlob(
        accessToken,
        repository,
        entry.sha,
        remainingMs(),
      );
      if (blob.size !== entry.size || blob.size > MAX_FILE_BYTES) {
        recordSkipped(inspections, path, "blob_size_mismatch", entry.size);
        warnings.push("GitHub returned source content with unexpected size metadata.");
        continue;
      }
      const bytes = decodeBlobContent(blob.content, blob.size);
      if (!bytes) {
        recordSkipped(inspections, path, "invalid_blob_encoding", blob.size);
        warnings.push("One or more source files had invalid GitHub content encoding.");
        continue;
      }
      if (bytes.includes(0)) {
        recordSkipped(inspections, path, "binary_file", bytes.byteLength);
        continue;
      }
      let content: string;
      try {
        content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        recordSkipped(inspections, path, "non_utf8_file", bytes.byteLength);
        continue;
      }
      const diffMeta = commitFilesMap.get(path);
      files.push({
        path,
        content,
        status: diffMeta?.status ?? "existing",
        patch: diffMeta?.patch,
        changedLines: diffMeta?.changedLines,
      });
      totalBytes += bytes.byteLength;
    } catch (error) {
      if (
        error instanceof GitHubApiError &&
        (error.code === "unauthorized" || error.code === "forbidden")
      ) {
        throw error;
      }
      recordSkipped(inspections, path, "source_unavailable", entry.size);
      warnings.push("Some eligible files could not be retrieved from GitHub.");
      if (
        error instanceof GitHubApiError &&
        (error.code === "rate_limit" ||
          error.code === "upstream" ||
          error.code === "limit")
      ) {
        break;
      }
    }
  }
  return { files, inspections, warnings: [...new Set(warnings)] };
}
