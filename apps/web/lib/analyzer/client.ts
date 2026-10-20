export type AnalyzerHealth = {
  status: "ok";
};

export type AnalyzerClientErrorCode =
  | "not_configured"
  | "invalid_configuration"
  | "timeout"
  | "upstream_error"
  | "invalid_response";

export class AnalyzerClientError extends Error {
  readonly code: AnalyzerClientErrorCode;
  readonly upstreamStatus?: number;

  constructor(
    code: AnalyzerClientErrorCode,
    upstreamStatus?: number,
  ) {
    super(code);
    this.name = "AnalyzerClientError";
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

type AnalyzerClientOptions = {
  env?: NodeJS.ProcessEnv;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function getAnalyzerBaseUrl(env: NodeJS.ProcessEnv): URL {
  const value = env.ANALYZER_BASE_URL;

  if (!value) {
    throw new AnalyzerClientError("not_configured");
  }

  if (value !== value.trim()) {
    throw new AnalyzerClientError("invalid_configuration");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AnalyzerClientError("invalid_configuration");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new AnalyzerClientError("invalid_configuration");
  }

  return url;
}

export async function getAnalyzerHealth({
  env = process.env,
  fetcher = fetch,
  timeoutMs = 5_000,
}: AnalyzerClientOptions = {}): Promise<AnalyzerHealth> {
  const baseUrl = getAnalyzerBaseUrl(env);
  const requestTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.min(Math.max(timeoutMs, 1), 5_000)
    : 5_000;
  const requestUrl = new URL(
    "health",
    baseUrl.href.endsWith("/") ? baseUrl : `${baseUrl.href}/`,
  );

  let response: Response;
  try {
    response = await fetcher(requestUrl, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new AnalyzerClientError("timeout");
    }
    throw new AnalyzerClientError("upstream_error");
  }

  if (!response.ok) {
    throw new AnalyzerClientError("upstream_error", response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new AnalyzerClientError("timeout");
    }
    throw new AnalyzerClientError("invalid_response");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("status" in body) ||
    body.status !== "ok"
  ) {
    throw new AnalyzerClientError("invalid_response");
  }

  return { status: "ok" };
}
