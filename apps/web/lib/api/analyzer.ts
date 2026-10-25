const rawBaseUrl =
  process.env.ANALYZER_URL ||
  process.env.ANALYZER_BASE_URL ||
  "http://127.0.0.1:8001";

const analyzerBaseUrl = rawBaseUrl.replace(/\/+$/, "");

export async function requestAnalyzer(
  path: string,
  init?: RequestInit,
  timeoutMs = 5_000,
): Promise<Response> {
  try {
    return await fetch(`${analyzerBaseUrl}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return Response.json(
      {
        error: {
          code: "ANALYZER_UNAVAILABLE",
          message: `The analyzer service at ${analyzerBaseUrl} is unavailable. Ensure the FastAPI backend is running and ANALYZER_URL is configured.`,
        },
      },
      { status: 503 },
    );
  }
}
