import type { AnalysisResponse } from "@bug-detective/shared-types";
import { requestAnalyzer } from "@/lib/api/analyzer";
import {
  findAccessibleRepository,
  safeGitHubError,
} from "@/lib/github/api";
import { githubError, githubJson, unauthorized } from "@/lib/github/http";
import { allowRepositoryScan } from "@/lib/github/rate-limit";
import { retrieveRepositorySource } from "@/lib/github/source";
import {
  clearGitHubSessionCookie,
  readGitHubSession,
  verifyCsrf,
} from "@/lib/github/session";

import { getSession } from "@/lib/auth/session";

const MAX_REQUEST_BYTES = 4 * 1024;
const ANALYZER_TIMEOUT_MS = 360_000;

async function readBoundedBody(request: Request): Promise<unknown | Response> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      return githubError(400, "INVALID_CONTENT_LENGTH", "Provide a valid JSON scan request.");
    }
    if (Number(contentLength) > MAX_REQUEST_BYTES) {
      return githubError(413, "REQUEST_TOO_LARGE", "Scan request exceeds the 4 KiB limit.");
    }
  }
  const reader = request.body?.getReader();
  if (!reader) return githubError(400, "INVALID_REQUEST", "Provide a valid JSON scan request.");
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return githubError(413, "REQUEST_TOO_LARGE", "Scan request exceeds the 4 KiB limit.");
      }
      chunks.push(value);
    }
  } catch {
    return githubError(400, "INVALID_REQUEST", "Provide a valid JSON scan request.");
  }
  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return githubError(400, "INVALID_JSON", "Provide a valid JSON scan request.");
  }
}

export async function POST(request: Request) {
  let session = await readGitHubSession(request);
  if (!session) {
    const authSession = await getSession();
    if (authSession?.accessToken) {
      session = {
        accessToken: authSession.accessToken,
        login: authSession.user.login,
        csrfToken: "",
        expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      };
    }
  }
  if (!session) return unauthorized();
  if (session.csrfToken && !verifyCsrf(request, session)) {
    return githubError(
      403,
      "CSRF_VALIDATION_FAILED",
      "Reload the page and try again.",
      session,
    );
  }
  const analyzerApiKey =
    process.env.ANALYZER_API_KEY || "gqPRXXtBxkbkKrfnxVvxZkNcW1OfUwN58B2itLfLel0";
  const body = await readBoundedBody(request);
  if (body instanceof Response) return body;
  if (
    typeof body !== "object" ||
    body === null ||
    !("repositoryId" in body) ||
    typeof body.repositoryId !== "number" ||
    !Number.isSafeInteger(body.repositoryId) ||
    body.repositoryId < 1 ||
    !("commitSha" in body) ||
    typeof body.commitSha !== "string" ||
    !/^[0-9a-f]{40}$/i.test(body.commitSha) ||
    Object.keys(body).some((key) => key !== "repositoryId" && key !== "commitSha")
  ) {
    return githubError(
      422,
      "INVALID_SCAN_TARGET",
      "Provide an accessible repository ID and full 40-character commit SHA.",
      session,
    );
  }
  const loginKey = (session?.login || "user").toLowerCase();
  if (!allowRepositoryScan(loginKey)) {
    return githubError(
      429,
      "SCAN_RATE_LIMIT",
      "Too many repository scans were requested. Try again in 15 minutes.",
      session,
    );
  }

  try {
    const repository = await findAccessibleRepository(
      session.accessToken,
      body.repositoryId,
    );
    if (!repository) {
      return githubError(
        404,
        "REPOSITORY_UNAVAILABLE",
        "This repository is not available to the connected GitHub App.",
        session,
      );
    }
    const source = await retrieveRepositorySource(
      session.accessToken,
      repository,
      body.commitSha.toLowerCase(),
    );
    const analyzerResponse = await requestAnalyzer(
      "/analyze/sources",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-analyzer-api-key": analyzerApiKey,
        },
        body: JSON.stringify({
          repositoryFullName: repository.fullName,
          commitSha: body.commitSha.toLowerCase(),
          files: source.files.map((file) => ({
            path: file.path,
            content: file.content,
          })),
        }),
      },
      ANALYZER_TIMEOUT_MS,
    );
    let result: unknown;
    try {
      result = await analyzerResponse.json();
    } catch {
      return githubError(
        502,
        "ANALYZER_INVALID_RESPONSE",
        "The analyzer returned an invalid response.",
        session,
      );
    }
    if (!analyzerResponse.ok) {
      return githubError(
        analyzerResponse.status,
        "ANALYZER_FAILED",
        "The analyzer could not complete this repository scan.",
        session,
      );
    }
    if (
      typeof result !== "object" ||
      result === null ||
      !("files" in result) ||
      !Array.isArray(result.files) ||
      !("errors" in result) ||
      !Array.isArray(result.errors) ||
      !("status" in result) ||
      typeof result.status !== "string"
    ) {
      return githubError(
        502,
        "ANALYZER_INVALID_RESPONSE",
        "The analyzer returned an invalid response.",
        session,
      );
    }
    const analysis = result as AnalysisResponse;

    const diffMap = new Map<string, Set<number>>();
    for (const f of source.files) {
      if (f.changedLines && f.changedLines.length > 0) {
        diffMap.set(f.path, new Set(f.changedLines));
      }
    }

    const enrichedFindings = analysis.findings.map((finding) => {
      const fileLines = diffMap.get(finding.filePath);
      const isDiff =
        fileLines !== undefined
          ? fileLines.has(finding.startLine) ||
            Array.from(fileLines).some(
              (line) => line >= finding.startLine && line <= finding.endLine,
            )
          : null;
      return {
        ...finding,
        inCommitDiff: isDiff,
      };
    });

    return githubJson(
      {
        ...analysis,
        findings: enrichedFindings,
        files: [...analysis.files, ...source.inspections],
        errors: [...analysis.errors, ...source.warnings],
        status:
          source.warnings.length > 0 && analysis.status === "completed"
            ? "partial"
            : analysis.status,
      },
      200,
      session,
    );
  } catch (error) {
    const safe = safeGitHubError(error);
    const response = githubError(safe.status, safe.code, safe.message, session);
    return safe.status === 401 ? clearGitHubSessionCookie(response) : response;
  }
}
