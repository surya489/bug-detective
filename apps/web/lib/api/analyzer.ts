const analyzerBaseUrl =
  process.env.ANALYZER_URL ?? "http://127.0.0.1:8001";

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
          message:
            "The local analyzer is unavailable. Start FastAPI at 127.0.0.1:8001 and try again.",
        },
      },
      { status: 503 },
    );
  }
}
